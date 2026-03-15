use super::Database;
use crate::commands::fs::FileEntry;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

const DEFAULT_SMART_FOLDER_MAX_DEPTH: usize = 5;
const DEFAULT_SMART_FOLDER_MAX_RESULTS: usize = 1000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartFolderCondition {
    #[serde(rename = "type")]
    pub cond_type: String, // "extension" | "name_contains" | "name_glob" | "size_min" | "size_max" | "modified_after" | "modified_before"
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartFolder {
    pub id: i64,
    pub name: String,
    pub conditions: Vec<SmartFolderCondition>,
    pub search_paths: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SmartFolderInput {
    pub id: Option<i64>,
    pub name: String,
    pub conditions: Vec<SmartFolderCondition>,
    pub search_paths: Vec<String>,
}

/// 条件にファイルが合致するか判定
fn matches_conditions(
    path: &Path,
    name: &str,
    size: u64,
    modified: f64,
    is_dir: bool,
    conditions: &[SmartFolderCondition],
) -> bool {
    for cond in conditions {
        let matched = match cond.cond_type.as_str() {
            "extension" => {
                if is_dir {
                    false
                } else {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    // カンマ区切りで複数拡張子対応
                    cond.value
                        .split(',')
                        .map(|v| v.trim().to_lowercase().trim_start_matches('.').to_string())
                        .any(|v| v == ext)
                }
            }
            "name_contains" => {
                let query = cond.value.to_lowercase();
                name.to_lowercase().contains(&query)
            }
            "name_glob" => {
                let pattern = glob::Pattern::new(&cond.value);
                match pattern {
                    Ok(p) => p.matches(&name.to_lowercase()),
                    Err(_) => false,
                }
            }
            "size_min" => {
                if is_dir {
                    true // フォルダはサイズフィルタをスキップ
                } else {
                    match cond.value.parse::<u64>() {
                        Ok(min) => size >= min,
                        Err(_) => true,
                    }
                }
            }
            "size_max" => {
                if is_dir {
                    true
                } else {
                    match cond.value.parse::<u64>() {
                        Ok(max) => size <= max,
                        Err(_) => true,
                    }
                }
            }
            "modified_after" => {
                // ISO 8601 日付文字列をUNIXタイムスタンプに変換
                match chrono::NaiveDate::parse_from_str(&cond.value, "%Y-%m-%d") {
                    Ok(date) => {
                        let ts = date
                            .and_hms_opt(0, 0, 0)
                            .expect("0:00:00 is always valid")
                            .and_utc()
                            .timestamp() as f64;
                        modified >= ts
                    }
                    Err(_) => true,
                }
            }
            "modified_before" => {
                match chrono::NaiveDate::parse_from_str(&cond.value, "%Y-%m-%d") {
                    Ok(date) => {
                        let ts = date
                            .and_hms_opt(23, 59, 59)
                            .expect("23:59:59 is always valid")
                            .and_utc()
                            .timestamp() as f64;
                        modified <= ts
                    }
                    Err(_) => true,
                }
            }
            _ => true,
        };
        if !matched {
            return false;
        }
    }
    true
}

fn is_hidden(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
            return metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0;
        }
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

// ── Tauri コマンド ──

#[tauri::command]
pub fn save_smart_folder(
    state: tauri::State<Database>,
    input: SmartFolderInput,
) -> Result<SmartFolder, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let conditions_json =
        serde_json::to_string(&input.conditions).map_err(|e| format!("JSON error: {}", e))?;
    let search_paths_json =
        serde_json::to_string(&input.search_paths).map_err(|e| format!("JSON error: {}", e))?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    if let Some(id) = input.id {
        // UPDATE
        conn.execute(
            "UPDATE smart_folders SET name = ?2, conditions = ?3, search_paths = ?4 WHERE id = ?1",
            rusqlite::params![id, input.name, conditions_json, search_paths_json],
        )
        .map_err(|e| format!("Update smart folder: {}", e))?;

        Ok(SmartFolder {
            id,
            name: input.name,
            conditions: input.conditions,
            search_paths: input.search_paths,
            created_at: now,
        })
    } else {
        // INSERT
        conn.execute(
            "INSERT INTO smart_folders (name, conditions, search_paths, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![input.name, conditions_json, search_paths_json, now],
        )
        .map_err(|e| format!("Insert smart folder: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(SmartFolder {
            id,
            name: input.name,
            conditions: input.conditions,
            search_paths: input.search_paths,
            created_at: now,
        })
    }
}

#[tauri::command]
pub fn list_smart_folders(state: tauri::State<Database>) -> Result<Vec<SmartFolder>, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let mut stmt = conn
        .prepare("SELECT id, name, conditions, search_paths, created_at FROM smart_folders ORDER BY id")
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let conditions_str: String = row.get(2)?;
            let search_paths_str: String = row.get(3)?;
            Ok(SmartFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                conditions: serde_json::from_str(&conditions_str).unwrap_or_default(),
                search_paths: serde_json::from_str(&search_paths_str).unwrap_or_default(),
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect: {}", e))
}

#[tauri::command]
pub fn delete_smart_folder(state: tauri::State<Database>, id: i64) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    conn.execute("DELETE FROM smart_folders WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete smart folder: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn execute_smart_folder(
    state: tauri::State<'_, Database>,
    id: i64,
) -> Result<Vec<FileEntry>, String> {
    // DBからスマートフォルダを取得
    let folder = {
        let conn = state
            .conn
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT id, name, conditions, search_paths, created_at FROM smart_folders WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                let conditions_str: String = row.get(2)?;
                let search_paths_str: String = row.get(3)?;
                Ok(SmartFolder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    conditions: serde_json::from_str(&conditions_str).unwrap_or_default(),
                    search_paths: serde_json::from_str(&search_paths_str).unwrap_or_default(),
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| format!("Smart folder not found: {}", e))?
    };

    let conditions = folder.conditions;
    let search_paths = folder.search_paths;

    // バックグラウンドスレッドで検索実行
    tauri::async_runtime::spawn_blocking(move || {
        let max = DEFAULT_SMART_FOLDER_MAX_RESULTS;
        let depth = DEFAULT_SMART_FOLDER_MAX_DEPTH;
        let mut results = Vec::new();

        for search_path in &search_paths {
            if results.len() >= max {
                break;
            }

            let base = Path::new(search_path);
            if !base.exists() || !base.is_dir() {
                continue;
            }

            for entry in WalkDir::new(base)
                .max_depth(depth)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if results.len() >= max {
                    break;
                }

                let file_path = entry.path().to_path_buf();
                // ルートディレクトリ自体はスキップ
                if file_path == base {
                    continue;
                }

                let metadata = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                let name = entry.file_name().to_string_lossy().to_string();
                let size = if metadata.is_dir() { 0 } else { metadata.len() };
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs_f64())
                    .unwrap_or(0.0);

                let extension = file_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                if !matches_conditions(
                    &file_path,
                    &name,
                    size,
                    modified,
                    metadata.is_dir(),
                    &conditions,
                ) {
                    continue;
                }

                results.push(FileEntry {
                    name,
                    path: file_path.to_string_lossy().to_string(),
                    size,
                    modified,
                    is_dir: metadata.is_dir(),
                    is_hidden: is_hidden(&file_path),
                    is_symlink: metadata.is_symlink(),
                    extension,
                });
            }
        }

        // 更新日時の降順でソート
        results.sort_by(|a, b| b.modified.partial_cmp(&a.modified).unwrap_or(std::cmp::Ordering::Equal));

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}
