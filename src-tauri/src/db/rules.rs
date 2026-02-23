use super::Database;
use crate::watcher::engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuleCondition {
    pub id: String,
    pub rule_id: String,
    pub cond_type: String,  // "extension" | "name_glob" | "name_contains" | "size_min" | "size_max" | "age_days"
    pub cond_value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderRule {
    pub id: String,
    pub folder_path: String,
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub action_type: String, // "move" | "copy" | "rename" | "delete"
    pub action_dest: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub conditions: Vec<RuleCondition>,
    pub auto_execute: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConditionInput {
    pub cond_type: String,
    pub cond_value: String,
}

// ヘルパー: rule_id に紐づく conditions を取得
fn load_conditions(
    conn: &rusqlite::Connection,
    rule_id: &str,
) -> Result<Vec<RuleCondition>, String> {
    let mut stmt = conn
        .prepare("SELECT id, rule_id, cond_type, cond_value FROM rule_conditions WHERE rule_id = ?1")
        .map_err(|e| format!("Prepare conditions: {}", e))?;
    let rows = stmt
        .query_map(rusqlite::params![rule_id], |row| {
            Ok(RuleCondition {
                id: row.get(0)?,
                rule_id: row.get(1)?,
                cond_type: row.get(2)?,
                cond_value: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query conditions: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect conditions: {}", e))
}

#[tauri::command]
pub fn get_rules_for_folder(
    state: tauri::State<Database>,
    folder_path: String,
) -> Result<Vec<FolderRule>, String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, folder_path, name, enabled, priority, action_type, action_dest, created_at, updated_at, auto_execute
             FROM folder_rules WHERE LOWER(folder_path) = LOWER(?1) ORDER BY priority ASC",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![folder_path], |row| {
            Ok(FolderRule {
                id: row.get(0)?,
                folder_path: row.get(1)?,
                name: row.get(2)?,
                enabled: row.get::<_, i32>(3)? != 0,
                priority: row.get(4)?,
                action_type: row.get(5)?,
                action_dest: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                conditions: Vec::new(), // 後で埋める
                auto_execute: row.get::<_, i32>(9).unwrap_or(0) != 0,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut rules: Vec<FolderRule> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect: {}", e))?;

    for rule in &mut rules {
        rule.conditions = load_conditions(&conn, &rule.id)?;
    }

    Ok(rules)
}

#[tauri::command]
pub fn get_all_rules(state: tauri::State<Database>) -> Result<Vec<FolderRule>, String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, folder_path, name, enabled, priority, action_type, action_dest, created_at, updated_at, auto_execute
             FROM folder_rules ORDER BY folder_path, priority ASC",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(FolderRule {
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
                auto_execute: row.get::<_, i32>(9).unwrap_or(0) != 0,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut rules: Vec<FolderRule> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect: {}", e))?;

    for rule in &mut rules {
        rule.conditions = load_conditions(&conn, &rule.id)?;
    }

    Ok(rules)
}

#[tauri::command]
pub fn create_rule(
    state: tauri::State<Database>,
    folder_path: String,
    name: String,
    action_type: String,
    action_dest: Option<String>,
    conditions: Vec<ConditionInput>,
    auto_execute: Option<bool>,
) -> Result<FolderRule, String> {
    let auto_exec = auto_execute.unwrap_or(true);
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let now = chrono::Utc::now().timestamp();
    let rule_id = uuid::Uuid::new_v4().to_string();

    // 既存ルール数から priority を決定
    let priority: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(priority), -1) + 1 FROM folder_rules WHERE LOWER(folder_path) = LOWER(?1)",
            rusqlite::params![folder_path],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO folder_rules (id, folder_path, name, enabled, priority, action_type, action_dest, created_at, updated_at, auto_execute)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![rule_id, folder_path, name, priority, action_type, action_dest, now, now, auto_exec as i32],
    )
    .map_err(|e| format!("Insert rule: {}", e))?;

    let mut conds = Vec::new();
    for c in &conditions {
        let cond_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO rule_conditions (id, rule_id, cond_type, cond_value) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![cond_id, rule_id, c.cond_type, c.cond_value],
        )
        .map_err(|e| format!("Insert condition: {}", e))?;
        conds.push(RuleCondition {
            id: cond_id,
            rule_id: rule_id.clone(),
            cond_type: c.cond_type.clone(),
            cond_value: c.cond_value.clone(),
        });
    }

    Ok(FolderRule {
        id: rule_id,
        folder_path,
        name,
        enabled: true,
        priority,
        action_type,
        action_dest,
        created_at: now,
        updated_at: now,
        conditions: conds,
        auto_execute: auto_exec,
    })
}

#[tauri::command]
pub fn update_rule(
    state: tauri::State<Database>,
    id: String,
    name: String,
    enabled: bool,
    priority: i32,
    action_type: String,
    action_dest: Option<String>,
    conditions: Vec<ConditionInput>,
    auto_execute: Option<bool>,
) -> Result<FolderRule, String> {
    let auto_exec = auto_execute.unwrap_or(true);
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let now = chrono::Utc::now().timestamp();

    // ルール本体を更新
    let rows = conn
        .execute(
            "UPDATE folder_rules SET name=?2, enabled=?3, priority=?4, action_type=?5, action_dest=?6, updated_at=?7, auto_execute=?8
             WHERE id=?1",
            rusqlite::params![id, name, enabled as i32, priority, action_type, action_dest, now, auto_exec as i32],
        )
        .map_err(|e| format!("Update rule: {}", e))?;
    if rows == 0 {
        return Err(format!("Rule not found: {}", id));
    }

    // 既存の conditions を削除して再作成
    conn.execute("DELETE FROM rule_conditions WHERE rule_id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete conditions: {}", e))?;

    let mut conds = Vec::new();
    for c in &conditions {
        let cond_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO rule_conditions (id, rule_id, cond_type, cond_value) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![cond_id, id, c.cond_type, c.cond_value],
        )
        .map_err(|e| format!("Insert condition: {}", e))?;
        conds.push(RuleCondition {
            id: cond_id,
            rule_id: id.clone(),
            cond_type: c.cond_type.clone(),
            cond_value: c.cond_value.clone(),
        });
    }

    // 更新後のルールを取得
    let rule = conn
        .query_row(
            "SELECT folder_path, created_at FROM folder_rules WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(|e| format!("Fetch rule: {}", e))?;

    Ok(FolderRule {
        id,
        folder_path: rule.0,
        name,
        enabled,
        priority,
        action_type,
        action_dest,
        created_at: rule.1,
        updated_at: now,
        conditions: conds,
        auto_execute: auto_exec,
    })
}

#[tauri::command]
pub fn delete_rule(state: tauri::State<Database>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    // CASCADE で conditions も削除される（SQLite の foreign_keys が有効な場合）
    // 念のため手動でも削除
    conn.execute("DELETE FROM rule_conditions WHERE rule_id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete conditions: {}", e))?;
    conn.execute("DELETE FROM folder_rules WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete rule: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn toggle_rule(
    state: tauri::State<Database>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE folder_rules SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
        rusqlite::params![id, enabled as i32, now],
    )
    .map_err(|e| format!("Toggle rule: {}", e))?;
    Ok(())
}

/// ルールの auto_execute フラグを切り替え
#[tauri::command]
pub fn set_rule_auto_execute(
    state: tauri::State<Database>,
    id: String,
    auto_execute: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE folder_rules SET auto_execute = ?2, updated_at = ?3 WHERE id = ?1",
        rusqlite::params![id, auto_execute as i32, now],
    )
    .map_err(|e| format!("Set auto_execute: {}", e))?;
    Ok(())
}

/// サジェストを受理してルールアクションを実行
#[tauri::command]
pub fn accept_rule_suggestion(
    state: tauri::State<Database>,
    rule_id: String,
    file_path: String,
) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| format!("Lock: {}", e))?;

    // ルールを取得
    let rule_data = conn
        .query_row(
            "SELECT id, folder_path, name, enabled, priority, action_type, action_dest, created_at, updated_at, auto_execute
             FROM folder_rules WHERE id = ?1",
            rusqlite::params![rule_id],
            |row| {
                Ok(FolderRule {
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
                    auto_execute: row.get::<_, i32>(9).unwrap_or(0) != 0,
                })
            },
        )
        .map_err(|e| format!("Rule not found: {}", e))?;

    // conditions をロード
    let mut rule = rule_data;
    rule.conditions = load_conditions(&conn, &rule.id)?;

    // アクションを実行
    let path = std::path::Path::new(&file_path);
    let dest_path = engine::execute_action(path, &rule)?;

    // 移動履歴を記録
    if let Some(ref dest) = dest_path {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let source_dir = path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let dest_dir = std::path::Path::new(dest)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO move_history (source_dir, dest_dir, extension, operation, file_count, timestamp) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
            rusqlite::params![source_dir, dest_dir, ext, rule.action_type, now],
        ).ok();
    }

    Ok(dest_path)
}
