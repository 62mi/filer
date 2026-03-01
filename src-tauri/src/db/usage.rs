use crate::db::Database;

impl Database {
    /// AI API使用量を記録
    pub fn record_usage(
        &self,
        input_tokens: i64,
        output_tokens: i64,
        cost_usd: f64,
        operation: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let timestamp = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO ai_usage (timestamp, input_tokens, output_tokens, cost_usd, operation) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![timestamp, input_tokens, output_tokens, cost_usd, operation],
        )
        .map_err(|e| format!("Record usage failed: {}", e))?;
        Ok(())
    }

    /// 今月のAI使用量を取得
    pub fn get_monthly_usage(&self) -> Result<(i64, i64, f64), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let now = chrono::Utc::now();
        let month_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .ok_or_else(|| "Invalid date: day=1".to_string())?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| "Invalid time: midnight".to_string())?
            .and_utc()
            .timestamp();

        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cost_usd), 0.0) FROM ai_usage WHERE timestamp >= ?1",
            )
            .map_err(|e| format!("Query failed: {}", e))?;

        let result = stmt
            .query_row([month_start], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, f64>(2)?,
                ))
            })
            .map_err(|e| format!("Query failed: {}", e))?;

        Ok(result)
    }

    /// 月間予算を取得
    pub fn get_budget(&self) -> Result<Option<f64>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let result = conn.query_row(
            "SELECT value FROM ai_settings WHERE key = 'monthly_budget'",
            [],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(val) => Ok(val.parse::<f64>().ok()),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Query failed: {}", e)),
        }
    }

    /// 月間予算を設定
    pub fn set_budget(&self, amount: f64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO ai_settings (key, value) VALUES ('monthly_budget', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
            [amount.to_string()],
        )
        .map_err(|e| format!("Set budget failed: {}", e))?;
        Ok(())
    }
}

use chrono::Datelike;
