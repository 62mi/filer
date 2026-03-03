use super::Database;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: i64,
    pub name: String,
    pub data: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn save_workspace(
    state: tauri::State<Database>,
    name: String,
    data: String,
) -> Result<Workspace, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let now = chrono::Utc::now().to_rfc3339();

    // UPSERT: 同名があれば更新、なければ挿入
    conn.execute(
        "INSERT INTO workspaces (name, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        rusqlite::params![name, data, now],
    )
    .map_err(|e| format!("Save workspace failed: {}", e))?;

    let id = conn.last_insert_rowid();
    // UPSERT で UPDATE された場合は last_insert_rowid が 0 になるので再取得
    let workspace = if id == 0 {
        conn.query_row(
            "SELECT id, name, data, updated_at FROM workspaces WHERE name = ?1",
            rusqlite::params![name],
            |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    data: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        )
        .map_err(|e| format!("Fetch workspace failed: {}", e))?
    } else {
        Workspace {
            id,
            name,
            data,
            updated_at: now,
        }
    };

    Ok(workspace)
}

#[tauri::command]
pub fn load_workspace(
    state: tauri::State<Database>,
    name: String,
) -> Result<Option<Workspace>, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let result = conn.query_row(
        "SELECT id, name, data, updated_at FROM workspaces WHERE name = ?1",
        rusqlite::params![name],
        |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                data: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    );

    match result {
        Ok(ws) => Ok(Some(ws)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Load workspace failed: {}", e)),
    }
}

#[tauri::command]
pub fn list_workspaces(state: tauri::State<Database>) -> Result<Vec<Workspace>, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let mut stmt = conn
        .prepare("SELECT id, name, data, updated_at FROM workspaces WHERE name != '__last_session__' ORDER BY updated_at DESC")
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                data: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect: {}", e))
}

#[tauri::command]
pub fn delete_workspace(
    state: tauri::State<Database>,
    name: String,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    conn.execute(
        "DELETE FROM workspaces WHERE name = ?1",
        rusqlite::params![name],
    )
    .map_err(|e| format!("Delete workspace failed: {}", e))?;

    Ok(())
}

/// セッション状態を保存（特別なワークスペース名 __last_session__ を使用）
#[tauri::command]
pub fn save_session(
    state: tauri::State<Database>,
    data: String,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO workspaces (name, data, updated_at) VALUES ('__last_session__', ?1, ?2)
         ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        rusqlite::params![data, now],
    )
    .map_err(|e| format!("Save session failed: {}", e))?;

    Ok(())
}

/// セッション状態を読み込み
#[tauri::command]
pub fn load_session(state: tauri::State<Database>) -> Result<Option<String>, String> {
    let conn = state
        .conn
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let result = conn.query_row(
        "SELECT data FROM workspaces WHERE name = '__last_session__'",
        [],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(data) => Ok(Some(data)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Load session failed: {}", e)),
    }
}
