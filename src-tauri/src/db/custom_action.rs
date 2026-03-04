use super::Database;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomAction {
    pub id: String,
    pub name: String,
    pub command: String,
    pub icon: Option<String>,
    pub show_for: String, // "file" | "directory" | "both"
    pub extensions: String, // カンマ区切り (例: "jpg,png,gif")、空=全て
    pub sort_order: i32,
}

#[tauri::command]
pub fn list_custom_actions(state: tauri::State<Database>) -> Result<Vec<CustomAction>, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let mut stmt = conn
        .prepare(
            "SELECT id, name, command, icon, show_for, extensions, sort_order
             FROM custom_actions ORDER BY sort_order ASC",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CustomAction {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                icon: row.get(3)?,
                show_for: row.get(4)?,
                extensions: row.get::<_, String>(5).unwrap_or_default(),
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect: {}", e))
}

#[tauri::command]
pub fn save_custom_action(
    state: tauri::State<Database>,
    id: Option<String>,
    name: String,
    command: String,
    icon: Option<String>,
    show_for: String,
    extensions: String,
) -> Result<CustomAction, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let action_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // 新規の場合は末尾に追加、更新の場合は既存の sort_order を維持
    let sort_order: i32 = conn
        .query_row(
            "SELECT sort_order FROM custom_actions WHERE id = ?1",
            rusqlite::params![action_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| {
            // 新規 → 最大値+1
            conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM custom_actions",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0)
        });

    conn.execute(
        "INSERT INTO custom_actions (id, name, command, icon, show_for, extensions, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET name=?2, command=?3, icon=?4, show_for=?5, extensions=?6",
        rusqlite::params![action_id, name, command, icon, show_for, extensions, sort_order],
    )
    .map_err(|e| format!("Upsert: {}", e))?;

    Ok(CustomAction {
        id: action_id,
        name,
        command,
        icon,
        show_for,
        extensions,
        sort_order,
    })
}

#[tauri::command]
pub fn delete_custom_action(state: tauri::State<Database>, id: String) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "DELETE FROM custom_actions WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete: {}", e))?;
    Ok(())
}

/// カスタムアクションを実行する
/// プレースホルダー: {path} {dir} {name} {ext}
#[tauri::command]
pub async fn execute_custom_action(command: String, path: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);

    let dir = file_path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let name = file_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = file_path
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // シェルメタ文字を含むパスによるインジェクション防止のためクォーティング
    let quote = |s: &str| format!("\"{}\"", s.replace('"', "\\\""));

    let expanded = command
        .replace("{path}", &quote(&path))
        .replace("{dir}", &quote(&dir))
        .replace("{name}", &quote(&name))
        .replace("{ext}", &quote(&ext));

    tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("cmd")
            .args(["/c", &expanded])
            .spawn()
            .map_err(|e| format!("Failed to execute command: {}", e))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
