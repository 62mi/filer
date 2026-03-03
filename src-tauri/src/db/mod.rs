pub mod custom_action;
pub mod dir_size_cache;
pub mod history;
pub mod rules;
pub mod smart_folder;
pub mod usage;
pub mod workspace;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create DB directory: {}", e))?;
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        Self::init_tables(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn db_path() -> PathBuf {
        let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
        data_dir.join("com.filer.app").join("move_history.db")
    }

    fn init_tables(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS move_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                source_dir  TEXT NOT NULL,
                dest_dir    TEXT NOT NULL,
                extension   TEXT NOT NULL,
                operation   TEXT NOT NULL,
                file_count  INTEGER NOT NULL DEFAULT 1,
                timestamp   INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mh_ext ON move_history(extension);
            CREATE INDEX IF NOT EXISTS idx_mh_source ON move_history(source_dir);
            CREATE INDEX IF NOT EXISTS idx_mh_dest ON move_history(dest_dir);
            CREATE INDEX IF NOT EXISTS idx_mh_time ON move_history(timestamp DESC);

            CREATE TABLE IF NOT EXISTS folder_rules (
                id          TEXT PRIMARY KEY,
                folder_path TEXT NOT NULL,
                name        TEXT NOT NULL,
                enabled     INTEGER NOT NULL DEFAULT 1,
                priority    INTEGER NOT NULL DEFAULT 0,
                action_type TEXT NOT NULL,
                action_dest TEXT,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_fr_folder ON folder_rules(folder_path);

            CREATE TABLE IF NOT EXISTS rule_conditions (
                id          TEXT PRIMARY KEY,
                rule_id     TEXT NOT NULL REFERENCES folder_rules(id) ON DELETE CASCADE,
                cond_type   TEXT NOT NULL,
                cond_value  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rc_rule ON rule_conditions(rule_id);

            CREATE TABLE IF NOT EXISTS ai_usage (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       INTEGER NOT NULL,
                input_tokens    INTEGER NOT NULL,
                output_tokens   INTEGER NOT NULL,
                cost_usd        REAL NOT NULL,
                operation       TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_au_time ON ai_usage(timestamp DESC);

            CREATE TABLE IF NOT EXISTS ai_settings (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dir_size_cache (
                path          TEXT PRIMARY KEY,
                size          INTEGER NOT NULL,
                calculated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspaces (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL UNIQUE,
                data       TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS smart_folders (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT NOT NULL,
                conditions   TEXT NOT NULL,
                search_paths TEXT NOT NULL,
                created_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_actions (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                command     TEXT NOT NULL,
                icon        TEXT,
                show_for    TEXT NOT NULL DEFAULT 'both',
                extensions  TEXT NOT NULL DEFAULT '',
                sort_order  INTEGER NOT NULL DEFAULT 0
            );",
        )
        .map_err(|e| format!("Failed to init tables: {}", e))?;

        // マイグレーション: auto_execute カラム追加（既存DBとの互換性）
        conn.execute(
            "ALTER TABLE folder_rules ADD COLUMN auto_execute INTEGER NOT NULL DEFAULT 1",
            [],
        )
        .ok(); // カラムが既に存在する場合はエラーを無視

        Ok(())
    }

    pub fn cleanup_old_entries(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let cutoff = chrono::Utc::now().timestamp() - (90 * 24 * 60 * 60);
        conn.execute("DELETE FROM move_history WHERE timestamp < ?1", [cutoff])
            .map_err(|e| format!("Cleanup failed: {}", e))?;
        conn.execute("DELETE FROM ai_usage WHERE timestamp < ?1", [cutoff])
            .map_err(|e| format!("AI usage cleanup failed: {}", e))?;
        // フォルダサイズキャッシュも90日でクリーンアップ
        conn.execute("DELETE FROM dir_size_cache WHERE calculated_at < ?1", [cutoff])
            .map_err(|e| format!("Dir size cache cleanup failed: {}", e))?;
        Ok(())
    }
}
