use super::Database;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct MoveSuggestion {
    pub dest_dir: String,
    pub frequency: u32,
    pub last_used: i64,
    pub ext_matches: u32,
    pub source_matches: u32,
    pub score: f64,
}

#[tauri::command]
pub fn record_move_operation(
    state: tauri::State<Database>,
    source_dir: String,
    dest_dir: String,
    extensions: Vec<String>,
    operation: String,
    file_count: u32,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let now = chrono::Utc::now().timestamp();

    for ext in &extensions {
        conn.execute(
            "INSERT INTO move_history (source_dir, dest_dir, extension, operation, file_count, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![source_dir, dest_dir, ext.to_lowercase(), operation, file_count, now],
        )
        .map_err(|e| format!("Insert failed: {}", e))?;
    }

    // ディレクトリのみ（拡張子なし）の場合も記録
    if extensions.is_empty() {
        conn.execute(
            "INSERT INTO move_history (source_dir, dest_dir, extension, operation, file_count, timestamp)
             VALUES (?1, ?2, '', ?3, ?4, ?5)",
            rusqlite::params![source_dir, dest_dir, operation, file_count, now],
        )
        .map_err(|e| format!("Insert failed: {}", e))?;
    }

    Ok(())
}

/// 候補の生データ
struct Candidate {
    dest_dir: String,
    total_freq: u32,
    last_used: i64,
    ext_matches: u32,
    source_matches: u32,
}

#[tauri::command]
pub fn get_move_suggestions(
    state: tauri::State<Database>,
    extensions: Vec<String>,
    source_dir: String,
    limit: Option<u32>,
) -> Result<Vec<MoveSuggestion>, String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let max = limit.unwrap_or(10) as usize;
    let now = chrono::Utc::now().timestamp();
    let cutoff = now - (90 * 24 * 60 * 60);
    let ext_lower: Vec<String> = extensions.iter().map(|e| e.to_lowercase()).collect();

    // 全候補を取得（dest_dir ごとに集約）
    let mut stmt = conn
        .prepare(
            "SELECT dest_dir, COUNT(*) as frequency, MAX(timestamp) as last_used
             FROM move_history
             WHERE timestamp > ?1 AND LOWER(dest_dir) != LOWER(?2)
             GROUP BY LOWER(dest_dir)
             ORDER BY frequency DESC
             LIMIT 30",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![cutoff, source_dir], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("Query: {}", e))?;

    let raw: Vec<(String, u32, i64)> = rows.filter_map(|r| r.ok()).collect();
    if raw.is_empty() {
        return Ok(Vec::new());
    }

    // 各候補について詳細スコア材料を取得
    let mut candidates: Vec<Candidate> = Vec::with_capacity(raw.len());

    for (dest, freq, last) in &raw {
        // 拡張子マッチ: この dest に対して、同じ拡張子の移動が何回あったか
        let ext_matches = if ext_lower.is_empty() {
            0u32
        } else {
            let placeholders: String = ext_lower.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let q = format!(
                "SELECT COUNT(*) FROM move_history
                 WHERE LOWER(dest_dir) = LOWER(?1) AND extension IN ({}) AND timestamp > ?2",
                placeholders
            );
            let mut s = conn.prepare(&q).map_err(|e| format!("Ext: {}", e))?;
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            params.push(Box::new(dest.clone()));
            for ext in &ext_lower {
                params.push(Box::new(ext.clone()));
            }
            params.push(Box::new(cutoff));
            let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
            s.query_row(refs.as_slice(), |row| row.get::<_, u32>(0)).unwrap_or(0)
        };

        // ソースディレクトリマッチ: 同じ source_dir → この dest への移動が何回あったか
        let source_matches: u32 = conn
            .prepare(
                "SELECT COUNT(*) FROM move_history
                 WHERE LOWER(source_dir) = LOWER(?1) AND LOWER(dest_dir) = LOWER(?2) AND timestamp > ?3",
            )
            .and_then(|mut s| {
                s.query_row(rusqlite::params![source_dir, dest, cutoff], |row| {
                    row.get::<_, u32>(0)
                })
            })
            .unwrap_or(0);

        candidates.push(Candidate {
            dest_dir: dest.clone(),
            total_freq: *freq,
            last_used: *last,
            ext_matches,
            source_matches,
        });
    }

    // スコア計算
    // 正規化用の最大値
    let max_freq = candidates.iter().map(|c| c.total_freq).max().unwrap_or(1) as f64;
    let max_ext = candidates.iter().map(|c| c.ext_matches).max().unwrap_or(1).max(1) as f64;
    let max_src = candidates.iter().map(|c| c.source_matches).max().unwrap_or(1).max(1) as f64;

    // 重み配分:
    //   ソースマッチ 0.30 — 「このフォルダから何度もそこへ送った」が最強シグナル
    //   拡張子マッチ 0.25 — 「.pdfはいつもDocumentsへ」
    //   頻度         0.20 — 全体的な人気度
    //   最近度       0.25 — 最近使ったところを優先
    let mut suggestions: Vec<MoveSuggestion> = candidates
        .into_iter()
        .map(|c| {
            let freq_norm = c.total_freq as f64 / max_freq;
            let days_ago = ((now - c.last_used) as f64) / 86400.0;
            let recency = (-0.05 * days_ago).exp(); // 0日=1.0, 14日≈0.50, 30日≈0.22
            let ext_norm = c.ext_matches as f64 / max_ext;
            let src_norm = c.source_matches as f64 / max_src;

            let score = 0.30 * src_norm + 0.25 * ext_norm + 0.20 * freq_norm + 0.25 * recency;

            MoveSuggestion {
                dest_dir: c.dest_dir,
                frequency: c.total_freq,
                last_used: c.last_used,
                ext_matches: c.ext_matches,
                source_matches: c.source_matches,
                score,
            }
        })
        .collect();

    // スコア降順ソート
    suggestions.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    suggestions.truncate(max);

    // 存在しないディレクトリを除外
    suggestions.retain(|s| std::path::Path::new(&s.dest_dir).is_dir());

    Ok(suggestions)
}

/// 移動履歴のパターン検出（ゼロAPIコスト）
#[derive(Debug, Serialize, Clone)]
pub struct RulePattern {
    pub source_dir: String,
    pub extension: String,
    pub dest_dir: String,
    pub frequency: u32,
    pub suggested_name: String,
}

#[tauri::command]
pub fn detect_rule_patterns(
    state: tauri::State<Database>,
    folder_path: String,
) -> Result<Vec<RulePattern>, String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let now = chrono::Utc::now().timestamp();
    let cutoff = now - (90 * 24 * 60 * 60); // 90日

    let mut stmt = conn
        .prepare(
            "SELECT extension, dest_dir, COUNT(*) as freq
             FROM move_history
             WHERE LOWER(source_dir) = LOWER(?1) AND timestamp > ?2
               AND extension != ''
             GROUP BY LOWER(extension), LOWER(dest_dir)
             HAVING freq >= 3
             ORDER BY freq DESC
             LIMIT 5",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![folder_path, cutoff], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u32>(2)?,
            ))
        })
        .map_err(|e| format!("Query: {}", e))?;

    let patterns: Vec<RulePattern> = rows
        .filter_map(|r| r.ok())
        .filter(|(_, dest, _)| std::path::Path::new(dest).is_dir())
        .map(|(ext, dest, freq)| {
            let dest_name = std::path::Path::new(&dest)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&dest)
                .to_string();
            RulePattern {
                source_dir: folder_path.clone(),
                suggested_name: format!(".{}を{}へ移動", ext, dest_name),
                extension: ext,
                dest_dir: dest,
                frequency: freq,
            }
        })
        .collect();

    Ok(patterns)
}
