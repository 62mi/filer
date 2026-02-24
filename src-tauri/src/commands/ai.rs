use crate::db::Database;
use crate::db::rules::ConditionInput;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;

// === APIキー管理（Windows Credential Manager経由） ===

const KEYRING_SERVICE: &str = "com.filer.app";
const KEYRING_USER: &str = "claude-api-key";

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("キーリング初期化エラー: {}", e))
}

/// 旧平文ファイルからの移行（存在すればkeyringに移して削除）
fn migrate_plaintext_key() {
    let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let old_path = data_dir.join("com.filer.app").join("api_key.txt");
    if !old_path.exists() {
        return;
    }
    if let Ok(key) = std::fs::read_to_string(&old_path) {
        let key = key.trim().to_string();
        if !key.is_empty() {
            if let Ok(entry) = keyring_entry() {
                if entry.set_password(&key).is_ok() {
                    let _ = std::fs::remove_file(&old_path);
                }
            }
        } else {
            let _ = std::fs::remove_file(&old_path);
        }
    }
}

#[tauri::command]
pub async fn save_api_key(api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("APIキーが空です".to_string());
    }
    let entry = keyring_entry()?;
    entry
        .set_password(key)
        .map_err(|e| format!("APIキー保存エラー: {}", e))
}

#[tauri::command]
pub async fn load_api_key() -> Result<Option<String>, String> {
    // 初回呼び出し時に旧形式から移行
    migrate_plaintext_key();

    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(key) if key.trim().is_empty() => Ok(None),
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("APIキー読み取りエラー: {}", e)),
    }
}

#[tauri::command]
pub async fn delete_api_key() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("APIキー削除エラー: {}", e)),
    }
}

#[tauri::command]
pub async fn has_api_key() -> Result<bool, String> {
    migrate_plaintext_key();

    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(key) => Ok(!key.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("APIキー確認エラー: {}", e)),
    }
}

// === 定数 ===
const MAX_FILE_COLLECT: usize = 1000;

// === 型定義 ===

#[derive(Debug)]
struct FileInfo {
    rel_path: String,
    size: u64,
    modified: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiCategory {
    pub folder_name: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiOrganizationPlan {
    pub summary: String,
    pub categories: Vec<AiCategory>,
    pub file_count: usize,
    pub estimated_input_tokens: usize,
    pub estimated_output_tokens: usize,
    pub estimated_cost_usd: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSuggestedAction {
    pub file_path: String,
    pub file_name: String,
    pub action_type: String,
    pub action_dest: Option<String>,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiExecutionResult {
    pub file_path: String,
    pub file_name: String,
    pub action_type: String,
    pub success: bool,
    pub error: Option<String>,
    pub dest_path: Option<String>,
}

/// Claude APIレスポンスから抽出した実際のトークン使用量
#[derive(Debug, Clone)]
struct ApiUsage {
    input_tokens: i64,
    output_tokens: i64,
}

/// フロントエンドに返すAI使用量情報
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiUsageInfo {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: f64,
    pub budget_usd: Option<f64>,
}

// === 進捗イベント ===

#[derive(Clone, Serialize)]
struct AiProgressPayload {
    step: String,
    current: usize,
    total: usize,
    message: String,
    detail: String,
}

fn emit_progress(
    app: &tauri::AppHandle,
    step: &str,
    current: usize,
    total: usize,
    message: &str,
    detail: &str,
) {
    app.emit(
        "ai-progress",
        AiProgressPayload {
            step: step.to_string(),
            current,
            total,
            message: message.to_string(),
            detail: detail.to_string(),
        },
    )
    .ok();
}

/// ファイルリストからプレビュー用の文字列を生成
fn files_preview(files: &[FileInfo], max: usize) -> String {
    let names: Vec<&str> = files
        .iter()
        .take(max)
        .map(|f| {
            // ファイル名部分だけ取り出す
            f.rel_path
                .rsplit('\\')
                .next()
                .unwrap_or(&f.rel_path)
        })
        .collect();
    let remaining = files.len().saturating_sub(max);
    if remaining > 0 {
        format!("{} 他{}件", names.join(", "), remaining)
    } else {
        names.join(", ")
    }
}

// === ファイル収集 ===

fn collect_files(folder_path: &str) -> Result<Vec<FileInfo>, String> {
    let dir_path = std::path::Path::new(folder_path);
    if !dir_path.is_dir() {
        return Err(format!("ディレクトリが見つかりません: {}", folder_path));
    }

    let mut files: Vec<FileInfo> = Vec::new();
    for entry in walkdir::WalkDir::new(dir_path)
        .min_depth(1)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.metadata().map(|m| !m.is_dir()).unwrap_or(false))
        .take(MAX_FILE_COLLECT * 2) // ソート前に十分な量を確保しつつメモリを制限
    {
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let path = entry.path();
        let rel_path = path
            .strip_prefix(dir_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);

        files.push(FileInfo {
            rel_path,
            size: metadata.len(),
            modified,
        });
    }

    files.sort_by(|a, b| {
        b.modified
            .partial_cmp(&a.modified)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    files.truncate(MAX_FILE_COLLECT);
    Ok(files)
}

// === Claude API ヘルパー ===

/// レスポンスサイズ上限（5MB）
const MAX_RESPONSE_SIZE: usize = 5 * 1024 * 1024;

async fn call_claude_api(
    api_key: &str,
    body: serde_json::Value,
) -> Result<(serde_json::Value, ApiUsage), String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API接続エラー: {}", e))?;

    let status = response.status();

    // Content-Lengthでサイズチェック（ヘッダがあれば）
    if let Some(content_length) = response.content_length() {
        if content_length as usize > MAX_RESPONSE_SIZE {
            return Err(format!(
                "APIレスポンスが大きすぎます（{}バイト、上限{}バイト）",
                content_length, MAX_RESPONSE_SIZE
            ));
        }
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("レスポンス読み取りエラー: {}", e))?;

    // ボディサイズチェック
    if response_text.len() > MAX_RESPONSE_SIZE {
        return Err(format!(
            "APIレスポンスが大きすぎます（{}バイト、上限{}バイト）",
            response_text.len(),
            MAX_RESPONSE_SIZE
        ));
    }

    if !status.is_success() {
        if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let err_msg = err_json["error"]["message"]
                .as_str()
                .unwrap_or("不明なエラー");
            return match status.as_u16() {
                401 => Err(
                    "APIキーが無効です。設定画面で正しいキーを入力してください。".to_string(),
                ),
                429 => Err(
                    "APIレート制限に達しました。しばらく待ってから再試行してください。"
                        .to_string(),
                ),
                _ => Err(format!("API エラー ({}): {}", status.as_u16(), err_msg)),
            };
        }
        return Err(format!("API エラー ({})", status.as_u16()));
    }

    let resp: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|e| format!("JSONパースエラー: {}", e))?;

    // レスポンスからトークン使用量を抽出
    let usage = ApiUsage {
        input_tokens: resp["usage"]["input_tokens"].as_i64().unwrap_or(0),
        output_tokens: resp["usage"]["output_tokens"].as_i64().unwrap_or(0),
    };

    Ok((resp, usage))
}

/// APIUsageからコスト(USD)を計算 (Claude Sonnet 4: $3/1M input, $15/1M output)
fn calculate_cost(usage: &ApiUsage) -> f64 {
    (usage.input_tokens as f64 * 3.0 / 1_000_000.0)
        + (usage.output_tokens as f64 * 15.0 / 1_000_000.0)
}

/// 使用量をDBに記録するヘルパー
fn record_usage_to_db(db: &Database, usage: &ApiUsage, operation: &str) {
    let cost = calculate_cost(usage);
    if let Err(e) = db.record_usage(usage.input_tokens, usage.output_tokens, cost, operation) {
        eprintln!("[usage] DB記録失敗 ({}): {}", operation, e);
    }
}

/// Claude APIのContentBlockの型安全な表現
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        name: String,
        input: serde_json::Value,
    },
}

/// Claude APIレスポンスの型安全な表現
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct ClaudeResponse {
    content: Vec<ContentBlock>,
    usage: Option<ClaudeUsage>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct ClaudeUsage {
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
}

fn extract_tool_result(
    resp: &serde_json::Value,
    tool_name: &str,
) -> Result<serde_json::Value, String> {
    let parsed: ClaudeResponse = serde_json::from_value(resp.clone())
        .map_err(|e| format!("APIレスポンスの構造が不正です: {}", e))?;

    for block in &parsed.content {
        if let ContentBlock::ToolUse { name, input } = block {
            if name == tool_name {
                return Ok(input.clone());
            }
        }
    }
    Err(format!(
        "AIからのレスポンスに{}の結果が含まれていませんでした",
        tool_name
    ))
}

/// 型安全にツール結果をデシリアライズするヘルパー
fn extract_tool_result_typed<T: serde::de::DeserializeOwned>(
    resp: &serde_json::Value,
    tool_name: &str,
) -> Result<T, String> {
    let input = extract_tool_result(resp, tool_name)?;
    serde_json::from_value(input)
        .map_err(|e| format!("{}の結果のパースエラー: {}", tool_name, e))
}

// === トークン推定 ===

fn estimate_tokens(files: &[FileInfo]) -> (usize, usize, f64) {
    let file_count = files.len();
    // ファイル名のトークン数を推定（1トークン ≈ 4文字）
    let name_tokens: usize = files.iter().map(|f| f.rel_path.len() / 4 + 1).sum();

    // Phase 1: 計画生成（軽量）
    let phase1_input = 250 + name_tokens;
    let phase1_output = 400;

    // Phase 2: ファイル振り分け（メタデータ付き）
    let phase2_input = 350 + (name_tokens * 3 / 2) + 200; // ファイル名+メタデータ+計画
    let phase2_output = file_count * 80; // 1アクション ≈ 80トークン

    let total_input = phase1_input + phase2_input;
    let total_output = phase1_output + phase2_output;

    // Claude Sonnet 4: $3/1M input, $15/1M output
    let cost =
        (total_input as f64 * 3.0 / 1_000_000.0) + (total_output as f64 * 15.0 / 1_000_000.0);

    (total_input, total_output, cost)
}

// === Phase 1: 整理計画の生成 ===

#[tauri::command]
pub async fn ai_generate_plan(
    app: tauri::AppHandle,
    db: tauri::State<'_, Database>,
    folder_path: String,
    user_instructions: String,
) -> Result<AiOrganizationPlan, String> {
    let api_key = match load_api_key().await? {
        Some(k) => k,
        None => {
            return Err(
                "APIキーが設定されていません。設定画面でClaude APIキーを入力してください。"
                    .to_string(),
            )
        }
    };

    emit_progress(&app, "scan", 1, 3, "ファイルをスキャン中...", "");
    let files = collect_files(&folder_path)?;
    if files.is_empty() {
        return Ok(AiOrganizationPlan {
            summary: "ファイルが見つかりませんでした".to_string(),
            categories: Vec::new(),
            file_count: 0,
            estimated_input_tokens: 0,
            estimated_output_tokens: 0,
            estimated_cost_usd: 0.0,
        });
    }

    // Phase 1 はファイル名のみ送信（軽量）
    let file_listing = files
        .iter()
        .map(|f| f.rel_path.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    let is_auto_mode = user_instructions.trim() == "__auto__";

    let system_prompt = if is_auto_mode {
        "You are a file organization planner for a Windows file manager.\n\
         Analyze the file list and create the BEST organization plan.\n\
         Look at file types, names, and existing directory structure to propose logical categories.\n\
         Create practical folder categories (e.g., Images, Documents, Videos, Code, Archives, Cleanup, etc.).\n\
         Only create categories that have matching files. Don't create empty categories.\n\
         If files are already well-organized, create fewer categories.\n\
         Use the create_plan tool to return your plan.\n\
         Summary and descriptions MUST be in Japanese."
            .to_string()
    } else {
        format!(
            "You are a file organization planner for a Windows file manager.\n\
             The user wants: \"{}\"\n\
             Analyze the file list and create an organization plan that fulfills the user's request.\n\
             Create practical folder categories based on the user's instructions.\n\
             Only create categories that have matching files.\n\
             Use the create_plan tool to return your plan.\n\
             Summary and descriptions MUST be in Japanese.",
            user_instructions
        )
    };

    let user_message = format!(
        "Folder: {}\nFile count: {}\n\nFiles:\n{}",
        folder_path,
        files.len(),
        file_listing
    );

    let tool_def = serde_json::json!({
        "name": "create_plan",
        "description": "Create a file organization plan with folder categories",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Brief summary of the organization plan in Japanese (1-2 sentences)"
                },
                "categories": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "folder_name": {
                                "type": "string",
                                "description": "Folder name to create (e.g., Images, Documents)"
                            },
                            "description": {
                                "type": "string",
                                "description": "What files go in this folder, in Japanese"
                            }
                        },
                        "required": ["folder_name", "description"]
                    }
                }
            },
            "required": ["summary", "categories"]
        }
    });

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": [{ "role": "user", "content": user_message }],
        "tools": [tool_def],
        "tool_choice": { "type": "tool", "name": "create_plan" }
    });

    emit_progress(
        &app,
        "api",
        2,
        3,
        "AIが整理プランを作成中...",
        &format!("{}件のファイルを分析中", files.len()),
    );
    let (resp, usage) = call_claude_api(&api_key, body).await?;
    record_usage_to_db(&db, &usage, "plan");
    emit_progress(&app, "done", 3, 3, "プラン作成完了", "");

    // 型安全にデシリアライズ
    #[derive(Deserialize)]
    struct PlanToolInput {
        summary: Option<String>,
        #[serde(default)]
        categories: Vec<AiCategory>,
    }
    let plan_input: PlanToolInput = extract_tool_result_typed(&resp, "create_plan")?;

    let (est_input, est_output, est_cost) = estimate_tokens(&files);

    Ok(AiOrganizationPlan {
        summary: plan_input.summary.unwrap_or_else(|| "整理計画".to_string()),
        categories: plan_input.categories,
        file_count: files.len(),
        estimated_input_tokens: est_input,
        estimated_output_tokens: est_output,
        estimated_cost_usd: est_cost,
    })
}

// === Phase 2: アクション生成 ===

#[tauri::command]
pub async fn ai_generate_actions(
    app: tauri::AppHandle,
    db: tauri::State<'_, Database>,
    folder_path: String,
    plan: AiOrganizationPlan,
) -> Result<Vec<AiSuggestedAction>, String> {
    let api_key = match load_api_key().await? {
        Some(k) => k,
        None => return Err("APIキーが設定されていません。".to_string()),
    };

    emit_progress(&app, "scan", 0, 0, "ファイルをスキャン中...", "");
    let files = collect_files(&folder_path)?;
    if files.is_empty() {
        return Ok(Vec::new());
    }

    // バッチ処理（150件ずつ）
    const BATCH_SIZE: usize = 150;
    let total_batches = (files.len() + BATCH_SIZE - 1) / BATCH_SIZE;
    let mut all_actions: Vec<AiSuggestedAction> = Vec::new();

    for (i, chunk) in files.chunks(BATCH_SIZE).enumerate() {
        let msg = if total_batches > 1 {
            format!("ファイルを振り分け中... ({}/{})", i + 1, total_batches)
        } else {
            "ファイルを振り分け中...".to_string()
        };
        let detail = files_preview(chunk, 3);
        emit_progress(&app, "assign", i + 1, total_batches, &msg, &detail);

        let batch_actions =
            generate_actions_batch(&api_key, &folder_path, chunk, &plan, &db).await?;
        all_actions.extend(batch_actions);
    }

    emit_progress(&app, "done", total_batches, total_batches, "振り分け完了", "");
    Ok(all_actions)
}

/// Phase 2 の1バッチ分を処理
async fn generate_actions_batch(
    api_key: &str,
    folder_path: &str,
    files: &[FileInfo],
    plan: &AiOrganizationPlan,
    db: &Database,
) -> Result<Vec<AiSuggestedAction>, String> {
    // カテゴリ一覧テキスト
    let categories_text = plan
        .categories
        .iter()
        .map(|c| format!("- {}/ → {}", c.folder_name, c.description))
        .collect::<Vec<_>>()
        .join("\n");

    // ファイル一覧（名前 + コンパクトなメタデータ）
    let file_listing = files
        .iter()
        .map(|f| {
            let size_str = format_size(f.size);
            let date_str = format_timestamp(f.modified);
            format!("{} | {} | {}", f.rel_path, size_str, date_str)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        r#"You are a file organizer. Assign each file to the appropriate category folder.

Organization Plan:
{categories}

Rules:
- Create "move" actions to move files into category subfolders
- action_dest must be an absolute path: {folder}\<category_folder_name>
- file_path must be the FULL absolute path: {folder}\<relative_path>
- file_name must be just the file name (not the path)
- Files already in a correct category subfolder should be SKIPPED (no action needed)
- If a file doesn't fit any category well, SKIP it (don't create an action)
- Provide a brief Japanese reason for each action
- IMPORTANT: Process ALL files in the list, do NOT skip or truncate the output
- IMPORTANT: actions must always be an array, never null. Use [] for no actions"#,
        categories = categories_text,
        folder = folder_path
    );

    let user_message = format!(
        "Assign these {} files to the planned categories:\n\n{}",
        files.len(),
        file_listing
    );

    let tool_def = serde_json::json!({
        "name": "organize_files",
        "description": "Assign files to category folders. Call once with all actions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "actions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "file_path": { "type": "string", "description": "Full absolute path of the file" },
                            "file_name": { "type": "string", "description": "File name only" },
                            "action_type": { "type": "string", "enum": ["move", "copy", "delete"] },
                            "action_dest": { "type": "string", "description": "Destination folder absolute path" },
                            "reason": { "type": "string", "description": "Brief reason in Japanese" }
                        },
                        "required": ["file_path", "file_name", "action_type", "reason"]
                    }
                }
            },
            "required": ["actions"]
        }
    });

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 16384,
        "system": system_prompt,
        "messages": [{ "role": "user", "content": user_message }],
        "tools": [tool_def],
        "tool_choice": { "type": "tool", "name": "organize_files" }
    });

    let (resp, usage) = call_claude_api(api_key, body).await?;
    record_usage_to_db(db, &usage, "assign");

    // 型安全にデシリアライズ
    #[derive(Deserialize)]
    struct OrganizeToolInput {
        #[serde(default)]
        actions: Vec<AiSuggestedAction>,
    }
    let result: OrganizeToolInput = extract_tool_result_typed(&resp, "organize_files")?;

    Ok(result.actions)
}

// === バッチ実行 ===

#[tauri::command]
pub async fn ai_execute_actions(
    folder_path: String,
    actions: Vec<AiSuggestedAction>,
) -> Result<Vec<AiExecutionResult>, String> {
    // ベースディレクトリを正規化
    let base_dir = std::fs::canonicalize(&folder_path)
        .map_err(|e| format!("フォルダパスの正規化エラー: {}", e))?;

    let mut results = Vec::new();

    for action in &actions {
        let file_path = std::path::Path::new(&action.file_path);

        if !file_path.exists() {
            results.push(AiExecutionResult {
                file_path: action.file_path.clone(),
                file_name: action.file_name.clone(),
                action_type: action.action_type.clone(),
                success: false,
                error: Some("ファイルが見つかりません".to_string()),
                dest_path: None,
            });
            continue;
        }

        // パストラバーサル防止: ファイルがベースディレクトリ内にあることを検証
        let canonical_file = match std::fs::canonicalize(file_path) {
            Ok(p) => p,
            Err(e) => {
                results.push(AiExecutionResult {
                    file_path: action.file_path.clone(),
                    file_name: action.file_name.clone(),
                    action_type: action.action_type.clone(),
                    success: false,
                    error: Some(format!("パス正規化エラー: {}", e)),
                    dest_path: None,
                });
                continue;
            }
        };
        if !canonical_file.starts_with(&base_dir) {
            results.push(AiExecutionResult {
                file_path: action.file_path.clone(),
                file_name: action.file_name.clone(),
                action_type: action.action_type.clone(),
                success: false,
                error: Some("不正なファイルパス: ベースフォルダ外のファイルです".to_string()),
                dest_path: None,
            });
            continue;
        }

        // 移動先もベースディレクトリ内かチェック
        if let Some(dest) = &action.action_dest {
            let dest_path = std::path::Path::new(dest);
            // 存在するパスはcanonicalize、存在しないパスは親ディレクトリで検証
            let is_outside_base = if dest_path.exists() {
                std::fs::canonicalize(dest_path)
                    .map(|p| !p.starts_with(&base_dir))
                    .unwrap_or(true)
            } else if let Some(parent) = dest_path.parent() {
                if parent.exists() {
                    std::fs::canonicalize(parent)
                        .map(|p| !p.starts_with(&base_dir))
                        .unwrap_or(true)
                } else {
                    true // 親ディレクトリも存在しない場合は拒否
                }
            } else {
                true
            };

            if is_outside_base {
                results.push(AiExecutionResult {
                    file_path: action.file_path.clone(),
                    file_name: action.file_name.clone(),
                    action_type: action.action_type.clone(),
                    success: false,
                    error: Some(
                        "不正な移動先: ベースフォルダ外への移動です".to_string(),
                    ),
                    dest_path: None,
                });
                continue;
            }
        }

        let temp_rule = crate::db::rules::FolderRule {
            id: String::new(),
            folder_path: String::new(),
            name: String::new(),
            enabled: true,
            priority: 0,
            action_type: action.action_type.clone(),
            action_dest: action.action_dest.clone(),
            created_at: 0,
            updated_at: 0,
            conditions: Vec::new(),
            auto_execute: true,
        };

        match crate::watcher::engine::execute_action(file_path, &temp_rule) {
            Ok(dest_path) => {
                results.push(AiExecutionResult {
                    file_path: action.file_path.clone(),
                    file_name: action.file_name.clone(),
                    action_type: action.action_type.clone(),
                    success: true,
                    error: None,
                    dest_path,
                });
            }
            Err(err) => {
                results.push(AiExecutionResult {
                    file_path: action.file_path.clone(),
                    file_name: action.file_name.clone(),
                    action_type: action.action_type.clone(),
                    success: false,
                    error: Some(err),
                    dest_path: None,
                });
            }
        }
    }

    // 空フォルダを徹底クリーンアップ
    if !actions.is_empty() {
        if let Some(root) = find_common_root(&actions) {
            cleanup_all_empty_dirs(&root);
        }
    }

    Ok(results)
}

// === AI使用量 ===

#[tauri::command]
pub async fn get_ai_usage(db: tauri::State<'_, Database>) -> Result<AiUsageInfo, String> {
    let (input_tokens, output_tokens, cost_usd) = db.get_monthly_usage()?;
    let budget_usd = db.get_budget()?;
    Ok(AiUsageInfo {
        input_tokens,
        output_tokens,
        cost_usd,
        budget_usd,
    })
}

#[tauri::command]
pub async fn set_ai_budget(db: tauri::State<'_, Database>, budget: f64) -> Result<(), String> {
    db.set_budget(budget)
}

// === ヘルパー ===

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{}B", bytes)
    } else if bytes < 1048576 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else if bytes < 1073741824 {
        format!("{:.1}MB", bytes as f64 / 1048576.0)
    } else {
        format!("{:.1}GB", bytes as f64 / 1073741824.0)
    }
}

fn format_timestamp(ts: f64) -> String {
    let dt = chrono::DateTime::from_timestamp(ts as i64, 0);
    match dt {
        Some(d) => d.format("%Y-%m-%d %H:%M").to_string(),
        None => "unknown".to_string(),
    }
}

/// アクション群のfile_pathから共通のルートフォルダを見つける
fn find_common_root(actions: &[AiSuggestedAction]) -> Option<PathBuf> {
    let paths: Vec<&std::path::Path> = actions
        .iter()
        .map(|a| std::path::Path::new(&a.file_path))
        .collect();
    if paths.is_empty() {
        return None;
    }

    let mut common = paths[0].to_path_buf();
    loop {
        if common.is_dir() && paths.iter().all(|p| p.starts_with(&common)) {
            return Some(common);
        }
        if !common.pop() {
            break;
        }
    }
    None
}

/// 指定フォルダ配下の全ての空フォルダをボトムアップで削除
fn cleanup_all_empty_dirs(root: &std::path::Path) {
    if !root.is_dir() {
        return;
    }

    let mut dirs: Vec<PathBuf> = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .min_depth(1)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_dir() {
            dirs.push(entry.path().to_path_buf());
        }
    }

    // 深い方から処理（ボトムアップ）
    dirs.sort_by(|a, b| b.components().count().cmp(&a.components().count()));

    for dir in &dirs {
        if dir == root {
            continue;
        }
        let is_empty = match std::fs::read_dir(dir) {
            Ok(mut entries) => entries.next().is_none(),
            Err(_) => false,
        };
        if is_empty {
            let _ = std::fs::remove_dir(dir);
        }
    }
}

// === AI ルールウィザード ===

/// AIが生成したルールのプレビュー
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneratedRulePreview {
    pub name: String,
    pub action_type: String,
    pub action_dest: Option<String>,
    pub conditions: Vec<ConditionInput>,
    pub auto_execute: bool,
    pub explanation: String,
    pub matching_files: Vec<String>,
}

/// 会話履歴のメッセージ
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,    // "user" | "assistant"
    pub content: String,
}

/// AI会話型ルール生成コマンド
#[tauri::command]
pub async fn ai_generate_rule(
    db: tauri::State<'_, Database>,
    folder_path: String,
    user_instruction: String,
    conversation_history: Option<Vec<ChatMessage>>,
) -> Result<GeneratedRulePreview, String> {
    let api_key = match load_api_key().await? {
        Some(k) => k,
        None => {
            return Err(
                "APIキーが設定されていません。設定画面でClaude APIキーを入力してください。"
                    .to_string(),
            )
        }
    };

    // フォルダ内のファイル・サブフォルダ一覧を取得
    let dir_path = std::path::Path::new(&folder_path);
    if !dir_path.is_dir() {
        return Err(format!("ディレクトリが見つかりません: {}", folder_path));
    }

    let mut file_listing = Vec::new();
    let mut subfolder_listing = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if metadata.is_dir() {
                // サブフォルダの中身をサマリー
                let sub_path = entry.path();
                let sub_count = std::fs::read_dir(&sub_path)
                    .map(|rd| rd.count())
                    .unwrap_or(0);
                subfolder_listing.push(format!(
                    "  - {}/ ({} items, {})",
                    name,
                    sub_count,
                    sub_path.to_string_lossy()
                ));
            } else {
                let size = metadata.len();
                file_listing.push(format!("  - {} ({})", name, format_size(size)));
            }
        }
    }
    file_listing.truncate(50);
    subfolder_listing.truncate(30);
    let files_context = if file_listing.is_empty() {
        "（ファイルなし）".to_string()
    } else {
        file_listing.join("\n")
    };
    let folders_context = if subfolder_listing.is_empty() {
        "（サブフォルダなし）".to_string()
    } else {
        subfolder_listing.join("\n")
    };

    // 既存ルールのコンテキスト
    let existing_rules = {
        let conn = db.conn.lock().map_err(|e| format!("Lock: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT name, action_type, action_dest FROM folder_rules WHERE LOWER(folder_path) = LOWER(?1) AND enabled = 1",
            )
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt
            .query_map(rusqlite::params![folder_path], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| format!("Query: {}", e))?;
        let rules: Vec<String> = rows
            .filter_map(|r| r.ok())
            .map(|(name, action, dest)| {
                format!(
                    "  - {}: {} {}",
                    name,
                    action,
                    dest.unwrap_or_default()
                )
            })
            .collect();
        if rules.is_empty() {
            "（既存ルールなし）".to_string()
        } else {
            rules.join("\n")
        }
    };

    let system_prompt = format!(
        r#"あなたはファイル整理ルールを作成するアシスタントです。
ユーザーの自然言語の指示を解析し、構造化されたフォルダルールに変換してください。

対象フォルダ: {folder_path}

サブフォルダ:
{folders_context}

フォルダ内のファイル:
{files_context}

既存ルール:
{existing_rules}

利用可能な条件タイプ:
- extension: 拡張子でマッチ（例: "pdf", "jpg,png,gif"）カンマ区切りで複数指定可
- name_glob: ファイル名のglobパターン（例: "screenshot_*", "*.tmp"）
- name_contains: ファイル名に含む文字列（例: "invoice"）
- size_min: 最小ファイルサイズ（バイト単位、例: "1048576" = 1MB）
- size_max: 最大ファイルサイズ（バイト単位）
- age_days: 最終更新からの経過日数（例: "30"）

利用可能なアクション:
- move: 指定フォルダに移動
- copy: 指定フォルダにコピー
- delete: ゴミ箱に移動

重要:
- action_dest は絶対パスで指定してください
- auto_execute はデフォルトで false（サジェストモード）を推奨します
- explanation は日本語で、ルールの内容を簡潔に説明してください
- 条件は必ず1つ以上指定してください"#
    );

    // 会話メッセージ構築
    let mut messages = Vec::new();

    // 既存の会話履歴があれば追加
    if let Some(history) = &conversation_history {
        for msg in history {
            messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content,
            }));
        }
    }

    // 最新のユーザーメッセージ追加
    messages.push(serde_json::json!({
        "role": "user",
        "content": user_instruction,
    }));

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": messages,
        "tools": [{
            "name": "create_folder_rule",
            "description": "フォルダの自動整理ルールを作成します",
            "input_schema": {
                "type": "object",
                "required": ["name", "action_type", "conditions", "explanation"],
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "ルール名（日本語OK、簡潔に）"
                    },
                    "action_type": {
                        "type": "string",
                        "enum": ["move", "copy", "delete"],
                        "description": "実行するアクション"
                    },
                    "action_dest": {
                        "type": "string",
                        "description": "移動/コピー先の絶対パス（deleteの場合は不要）"
                    },
                    "conditions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["cond_type", "cond_value"],
                            "properties": {
                                "cond_type": {
                                    "type": "string",
                                    "enum": ["extension", "name_glob", "name_contains", "size_min", "size_max", "age_days"]
                                },
                                "cond_value": {
                                    "type": "string",
                                    "description": "条件の値"
                                }
                            }
                        },
                        "description": "マッチ条件（すべてAND）"
                    },
                    "auto_execute": {
                        "type": "boolean",
                        "description": "true=自動実行、false=サジェストのみ（推奨: false）"
                    },
                    "explanation": {
                        "type": "string",
                        "description": "ルールの説明（日本語）"
                    }
                }
            }
        }],
        "tool_choice": { "type": "tool", "name": "create_folder_rule" }
    });

    let (resp, usage) = call_claude_api(&api_key, body).await?;

    // 使用量を記録
    record_usage_to_db(&db, &usage, "rule_wizard");

    // 型安全にデシリアライズ
    #[derive(Deserialize)]
    struct RuleToolInput {
        name: Option<String>,
        action_type: Option<String>,
        action_dest: Option<String>,
        #[serde(default)]
        conditions: Vec<ConditionInput>,
        #[serde(default)]
        auto_execute: bool,
        explanation: Option<String>,
    }
    let tool_input: RuleToolInput = extract_tool_result_typed(&resp, "create_folder_rule")?;

    let name = tool_input.name.unwrap_or_else(|| "新しいルール".to_string());
    let action_type = tool_input
        .action_type
        .unwrap_or_else(|| "move".to_string());
    let action_dest = tool_input.action_dest;
    let auto_execute = tool_input.auto_execute;
    let explanation = tool_input.explanation.unwrap_or_default();
    let conditions = tool_input.conditions;

    // マッチするファイルを計算
    let matching_files = find_matching_files(dir_path, &conditions);

    Ok(GeneratedRulePreview {
        name,
        action_type,
        action_dest,
        conditions,
        auto_execute,
        explanation,
        matching_files,
    })
}

/// 指定された条件にマッチするファイルを検索
fn find_matching_files(dir_path: &std::path::Path, conditions: &[ConditionInput]) -> Vec<String> {
    let mut matching = Vec::new();
    let entries = match std::fs::read_dir(dir_path) {
        Ok(e) => e,
        Err(_) => return matching,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }

        // FolderRule に変換してマッチチェック
        let temp_rule = crate::db::rules::FolderRule {
            id: String::new(),
            folder_path: String::new(),
            name: String::new(),
            enabled: true,
            priority: 0,
            action_type: String::new(),
            action_dest: None,
            created_at: 0,
            updated_at: 0,
            conditions: conditions
                .iter()
                .map(|c| crate::db::rules::RuleCondition {
                    id: String::new(),
                    rule_id: String::new(),
                    cond_type: c.cond_type.clone(),
                    cond_value: c.cond_value.clone(),
                })
                .collect(),
            auto_execute: true,
        };

        if crate::watcher::engine::matches_rule(&path, &temp_rule) {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                matching.push(name.to_string());
            }
        }
    }

    matching.sort();
    matching
}
