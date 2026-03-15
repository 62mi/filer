use super::Database;

impl Database {
    /// キャッシュからフォルダサイズを取得（TTL内のもののみ）
    pub fn get_cached_dir_size(&self, path: &str, ttl_secs: i64) -> Option<u64> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let cutoff = chrono::Utc::now().timestamp() - ttl_secs;
        conn.query_row(
            "SELECT size FROM dir_size_cache WHERE path = ?1 AND calculated_at > ?2",
            rusqlite::params![path, cutoff],
            |row| row.get::<_, u64>(0),
        )
        .ok()
    }

    /// フォルダサイズをキャッシュに保存
    pub fn save_dir_size(&self, path: &str, size: u64) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT OR REPLACE INTO dir_size_cache (path, size, calculated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![path, size, now],
        )
        .map_err(|e| format!("Failed to save dir size cache: {}", e))?;
        Ok(())
    }

    /// 古いキャッシュエントリを削除（定期メンテナンス用）
    #[allow(dead_code)]
    pub fn cleanup_dir_size_cache(&self, max_age_secs: i64) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let cutoff = chrono::Utc::now().timestamp() - max_age_secs;
        conn.execute(
            "DELETE FROM dir_size_cache WHERE calculated_at < ?1",
            [cutoff],
        )
        .map_err(|e| format!("Dir size cache cleanup failed: {}", e))?;
        Ok(())
    }
}
