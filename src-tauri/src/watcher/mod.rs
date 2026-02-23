pub mod engine;

use crate::db::Database;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// ルール自動実行時のフロントエンド通知ペイロード
#[derive(Debug, Clone, Serialize)]
pub struct RuleExecutedPayload {
    pub rule_id: String,
    pub rule_name: String,
    pub file_name: String,
    pub action_type: String,
    pub source_path: String,
    pub dest_path: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuleErrorPayload {
    pub rule_id: String,
    pub rule_name: String,
    pub file_name: String,
    pub error: String,
}

/// ルールサジェスト時（auto_execute = false）のペイロード
#[derive(Debug, Clone, Serialize)]
pub struct RuleSuggestionPayload {
    pub rule_id: String,
    pub rule_name: String,
    pub file_name: String,
    pub file_path: String,
    pub action_type: String,
    pub action_dest: Option<String>,
}

pub struct WatcherManager {
    app_handle: AppHandle,
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_folders: Mutex<HashSet<String>>,
}

impl WatcherManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            watcher: Mutex::new(None),
            watched_folders: Mutex::new(HashSet::new()),
        }
    }

    /// アプリ起動時にルール付きフォルダの監視を開始
    pub fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        let db = self.app_handle.state::<Database>();
        let rules = {
            let conn = db.conn.lock().map_err(|e| format!("Lock: {}", e))?;
            let mut stmt = conn.prepare(
                "SELECT DISTINCT folder_path FROM folder_rules WHERE enabled = 1",
            )?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.filter_map(|r| r.ok()).collect::<Vec<String>>()
        };

        if rules.is_empty() {
            return Ok(());
        }

        let handle = self.app_handle.clone();

        // デバウンス用の状態
        let debounce_map: std::sync::Arc<Mutex<HashMap<PathBuf, Instant>>> =
            std::sync::Arc::new(Mutex::new(HashMap::new()));
        let debounce_ref = debounce_map.clone();

        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, _>| {
            let event = match res {
                Ok(e) => e,
                Err(_) => return,
            };

            // Create イベントのみ処理（新規ファイル）
            let is_create = matches!(event.kind, EventKind::Create(_));
            if !is_create {
                return;
            }

            for path in &event.paths {
                // ディレクトリは無視
                if path.is_dir() {
                    continue;
                }

                // デバウンス: 2秒以内の同一パスイベントはスキップ
                {
                    let mut map = match debounce_ref.lock() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let now = Instant::now();
                    if let Some(last) = map.get(path) {
                        if now.duration_since(*last) < Duration::from_secs(2) {
                            continue;
                        }
                    }
                    map.insert(path.clone(), now);
                }

                // ファイルがまだ書き込み中の可能性があるので少し待つ
                std::thread::sleep(Duration::from_millis(500));

                // ファイルがまだ存在するか確認
                if !path.exists() || !path.is_file() {
                    continue;
                }

                let folder = match path.parent() {
                    Some(p) => p.to_string_lossy().to_string(),
                    None => continue,
                };

                // このフォルダのルールを取得
                let db = handle.state::<Database>();
                let rules = {
                    let conn = match db.conn.lock() {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    let mut stmt = match conn.prepare(
                        "SELECT r.id, r.folder_path, r.name, r.enabled, r.priority, r.action_type, r.action_dest, r.created_at, r.updated_at, r.auto_execute
                         FROM folder_rules r WHERE LOWER(r.folder_path) = LOWER(?1) AND r.enabled = 1
                         ORDER BY r.priority ASC",
                    ) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };

                    let rule_rows = match stmt.query_map(rusqlite::params![folder], |row| {
                        Ok(crate::db::rules::FolderRule {
                            id: row.get(0)?,
                            folder_path: row.get(1)?,
                            name: row.get(2)?,
                            enabled: row.get::<_, i32>(3)? != 0,
                            priority: row.get(4)?,
                            action_type: row.get(5)?,
                            action_dest: row.get(6)?,
                            created_at: row.get(7)?,
                            updated_at: row.get(8)?,
                            conditions: Vec::new(),
                            auto_execute: row.get::<_, i32>(9).unwrap_or(1) != 0,
                        })
                    }) {
                        Ok(r) => r,
                        Err(_) => continue,
                    };

                    let mut rules: Vec<crate::db::rules::FolderRule> =
                        rule_rows.filter_map(|r| r.ok()).collect();

                    // conditions をロード
                    for rule in &mut rules {
                        if let Ok(mut cond_stmt) = conn.prepare(
                            "SELECT id, rule_id, cond_type, cond_value FROM rule_conditions WHERE rule_id = ?1",
                        ) {
                            if let Ok(cond_rows) = cond_stmt.query_map(
                                rusqlite::params![rule.id],
                                |row| {
                                    Ok(crate::db::rules::RuleCondition {
                                        id: row.get(0)?,
                                        rule_id: row.get(1)?,
                                        cond_type: row.get(2)?,
                                        cond_value: row.get(3)?,
                                    })
                                },
                            ) {
                                rule.conditions = cond_rows.filter_map(|r| r.ok()).collect();
                            }
                        }
                    }
                    rules
                };

                // 各ルールを評価・実行
                for rule in &rules {
                    if !engine::matches_rule(path, rule) {
                        continue;
                    }

                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let source_path = path.to_string_lossy().to_string();

                    if rule.auto_execute {
                        // 自動実行モード: 即座にアクション実行
                        match engine::execute_action(path, rule) {
                            Ok(dest_path) => {
                                // 移動履歴を記録
                                if let Some(ref dest) = dest_path {
                                    if let Ok(conn) = db.conn.lock() {
                                        let ext = path
                                            .extension()
                                            .and_then(|e| e.to_str())
                                            .unwrap_or("")
                                            .to_lowercase();
                                        let now = chrono::Utc::now().timestamp();
                                        let dest_dir = std::path::Path::new(dest)
                                            .parent()
                                            .map(|p| p.to_string_lossy().to_string())
                                            .unwrap_or_default();
                                        conn.execute(
                                            "INSERT INTO move_history (source_dir, dest_dir, extension, operation, file_count, timestamp) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                                            rusqlite::params![folder, dest_dir, ext, rule.action_type, now],
                                        ).ok();
                                    }
                                }

                                // フロントエンドに通知
                                handle
                                    .emit(
                                        "rule-executed",
                                        RuleExecutedPayload {
                                            rule_id: rule.id.clone(),
                                            rule_name: rule.name.clone(),
                                            file_name,
                                            action_type: rule.action_type.clone(),
                                            source_path,
                                            dest_path,
                                            timestamp: chrono::Utc::now().timestamp(),
                                        },
                                    )
                                    .ok();
                            }
                            Err(err) => {
                                handle
                                    .emit(
                                        "rule-error",
                                        RuleErrorPayload {
                                            rule_id: rule.id.clone(),
                                            rule_name: rule.name.clone(),
                                            file_name,
                                            error: err,
                                        },
                                    )
                                    .ok();
                            }
                        }
                    } else {
                        // サジェストモード: フロントエンドに提案イベントを発行
                        handle
                            .emit(
                                "rule-suggestion",
                                RuleSuggestionPayload {
                                    rule_id: rule.id.clone(),
                                    rule_name: rule.name.clone(),
                                    file_name: file_name.clone(),
                                    file_path: source_path.clone(),
                                    action_type: rule.action_type.clone(),
                                    action_dest: rule.action_dest.clone(),
                                },
                            )
                            .ok();
                    }

                    // move/delete の場合ファイルが消えるので次のルールはスキップ
                    // (サジェストモードではファイルはまだ存在するが、重複サジェスト防止のためbreak)
                    if rule.action_type == "move" || rule.action_type == "delete" {
                        break;
                    }
                }
            }
        })?;

        // 有効なルールのフォルダを監視
        let mut folders = self
            .watched_folders
            .lock()
            .map_err(|e| format!("Lock: {}", e))?;
        for folder in &rules {
            let p = PathBuf::from(folder);
            if p.is_dir() {
                watcher.watch(&p, RecursiveMode::NonRecursive).ok();
                folders.insert(folder.clone());
            }
        }

        let mut w = self.watcher.lock().map_err(|e| format!("Lock: {}", e))?;
        *w = Some(watcher);

        Ok(())
    }

    /// ルール変更時にウォッチャーを再構築
    pub fn refresh(&self) -> Result<(), String> {
        // 既存ウォッチャーを停止
        {
            let mut w = self.watcher.lock().map_err(|e| format!("Lock: {}", e))?;
            *w = None;
            let mut f = self
                .watched_folders
                .lock()
                .map_err(|e| format!("Lock: {}", e))?;
            f.clear();
        }
        // 再起動
        self.start().map_err(|e| format!("Restart watcher: {}", e))
    }
}

#[tauri::command]
pub fn refresh_watcher(state: tauri::State<WatcherManager>) -> Result<(), String> {
    state.refresh()
}
