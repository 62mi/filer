use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use walkdir::WalkDir;

const DEFAULT_SEARCH_MAX_RESULTS: usize = 200;
const DEFAULT_SEARCH_MAX_DEPTH: usize = 5;
const DEFAULT_READ_MAX_BYTES: usize = 50_000;

/// ファイル名にパス区切り文字やトラバーサル文字列が含まれていないか検証
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("ファイル名が空です".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("ファイル名にパス区切り文字が含まれています".to_string());
    }
    if name == "." || name == ".." || name.contains("..") {
        return Err("ファイル名に不正な文字列が含まれています".to_string());
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: f64,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_symlink: bool,
    pub extension: String,
}

fn is_hidden(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(metadata) = fs::metadata(path) {
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
            return metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0;
        }
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err(format!("Directory not found: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();

    let read_dir = fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[fs] Error reading directory entry: {}", e);
                continue;
            }
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[fs] Error reading metadata for {:?}: {}", entry.file_name(), e);
                continue;
            }
        };

        let file_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

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

        entries.push(FileEntry {
            name,
            path: file_path.to_string_lossy().to_string(),
            size: if metadata.is_dir() { 0 } else { metadata.len() },
            modified,
            is_dir: metadata.is_dir(),
            is_hidden: is_hidden(&file_path),
            is_symlink: metadata.is_symlink(),
            extension,
        });
    }

    // ディレクトリを先に、次にファイルをソート
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(
            a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        )
    });

    Ok(entries)
}

#[tauri::command]
pub fn copy_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    let dest_path = Path::new(&dest);
    for source in &sources {
        let src_path = Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| "Invalid source path".to_string())?;
        let target = dest_path.join(file_name);

        if src_path.is_dir() {
            copy_dir_recursive(src_path, &target)?;
        } else {
            fs::copy(src_path, &target)
                .map_err(|e| format!("Failed to copy {}: {}", source, e))?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create directory: {}", e))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn move_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    let dest_path = Path::new(&dest);
    for source in &sources {
        let src_path = Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| "Invalid source path".to_string())?;
        let target = dest_path.join(file_name);
        fs::rename(src_path, &target).map_err(|e| format!("Failed to move {}: {}", source, e))?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct DeleteResult {
    pub succeeded: Vec<String>,
    pub failed: Vec<(String, String)>, // (path, error_message)
}

#[tauri::command]
pub fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<DeleteResult, String> {
    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);
        let result = if to_trash {
            trash::delete(path).map_err(|e| e.to_string())
        } else if path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| e.to_string())
        } else {
            fs::remove_file(path).map_err(|e| e.to_string())
        };

        match result {
            Ok(()) => succeeded.push(path_str.clone()),
            Err(e) => {
                eprintln!("[fs] Failed to delete {}: {}", path_str, e);
                failed.push((path_str.clone(), e));
            }
        }
    }

    Ok(DeleteResult { succeeded, failed })
}

#[tauri::command]
pub fn rename_file(path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;
    let src = Path::new(&path);
    let parent = src.parent().ok_or("Cannot get parent directory")?;
    let dest = parent.join(&new_name);
    fs::rename(src, &dest).map_err(|e| format!("Failed to rename: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_directory(path: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let dir = Path::new(&path).join(&name);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_file(path: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let file_path = Path::new(&path).join(&name);
    fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

/// ファイル同士をグループ化して新しいフォルダに入れる
/// drag_paths: ドラッグ中のファイルパス
/// target_path: ドロップ先のファイルパス
/// folder_name: 作成するフォルダ名（Noneの場合は自動生成）
/// 戻り値: 作成されたフォルダのパス
#[tauri::command]
pub fn group_files_into_folder(
    drag_paths: Vec<String>,
    target_path: String,
    folder_name: Option<String>,
) -> Result<String, String> {
    let target = Path::new(&target_path);
    let parent = target.parent().ok_or("Cannot get parent directory")?;

    // フォルダ名を決定
    let name = folder_name.unwrap_or_else(|| {
        // ターゲットファイル名のステム（拡張子なし）をベースに
        let stem = target
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("New Folder");
        // 共通プレフィックスがあれば使う
        let all_names: Vec<String> = std::iter::once(target_path.clone())
            .chain(drag_paths.iter().cloned())
            .filter_map(|p| {
                Path::new(&p)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
            })
            .collect();

        if let Some(prefix) = find_common_prefix(&all_names) {
            if prefix.len() >= 3 {
                return prefix;
            }
        }
        stem.to_string()
    });

    // 重複しないフォルダ名を生成
    let mut folder_path = parent.join(&name);
    let mut counter = 1;
    while folder_path.exists() {
        folder_path = parent.join(format!("{} ({})", name, counter));
        counter += 1;
    }

    // フォルダ作成
    fs::create_dir_all(&folder_path)
        .map_err(|e| format!("Failed to create folder: {}", e))?;

    // ファイルを移動
    let all_paths: Vec<&str> = std::iter::once(target_path.as_str())
        .chain(drag_paths.iter().map(|s| s.as_str()))
        .collect();

    for path_str in all_paths {
        let src = Path::new(path_str);
        let file_name = src.file_name().ok_or("Invalid file name")?;
        let dest = folder_path.join(file_name);
        fs::rename(src, &dest)
            .map_err(|e| format!("Failed to move {}: {}", path_str, e))?;
    }

    Ok(folder_path.to_string_lossy().to_string())
}

fn find_common_prefix(names: &[String]) -> Option<String> {
    if names.is_empty() {
        return None;
    }
    let first = &names[0];
    let mut prefix_len = first.len();
    for name in &names[1..] {
        prefix_len = prefix_len.min(name.len());
        for (i, (a, b)) in first.chars().zip(name.chars()).enumerate() {
            if a != b {
                prefix_len = prefix_len.min(i);
                break;
            }
        }
    }
    if prefix_len == 0 {
        return None;
    }
    // 末尾の区切り文字を除去
    let prefix: String = first.chars().take(prefix_len).collect();
    let trimmed = prefix.trim_end_matches(|c: char| c == '_' || c == '-' || c == ' ' || c == '.');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[tauri::command]
pub fn search_files(path: String, query: String, max_results: Option<usize>, max_depth: Option<usize>) -> Result<Vec<FileEntry>, String> {
    let max = max_results.unwrap_or(DEFAULT_SEARCH_MAX_RESULTS);
    let depth = max_depth.unwrap_or(DEFAULT_SEARCH_MAX_DEPTH);
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    for entry in WalkDir::new(&path).max_depth(depth).into_iter().filter_map(|e| e.ok()) {
        if results.len() >= max {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().contains(&query_lower) {
            continue;
        }
        let file_path = entry.path().to_path_buf();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
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

        results.push(FileEntry {
            name,
            path: file_path.to_string_lossy().to_string(),
            size: if metadata.is_dir() { 0 } else { metadata.len() },
            modified,
            is_dir: metadata.is_dir(),
            is_hidden: is_hidden(&file_path),
            is_symlink: metadata.is_symlink(),
            extension,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn read_text_file(path: String, max_bytes: Option<usize>) -> Result<String, String> {
    let max = max_bytes.unwrap_or(DEFAULT_READ_MAX_BYTES);
    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buf = vec![0u8; max];
    let n = file.read(&mut buf).map_err(|e| format!("Failed to read file: {}", e))?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

/// Google Drive等のCloud Filesプレースホルダーからdoc_idを取得する
/// 通常のファイル読み込みが失敗する仮想ファイル向け
#[tauri::command]
pub fn read_cloud_doc_id(path: String, extension: String) -> Result<String, String> {
    // Step 1: 通常のファイル読み込みを試す（ローカル/ミラーモード用）
    match fs::read_to_string(&path) {
        Ok(content) => {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(doc_id) = data.get("doc_id").and_then(|v| v.as_str()) {
                    return Ok(doc_id.to_string());
                }
                if let Some(url) = data.get("url").and_then(|v| v.as_str()) {
                    return Ok(format!("url:{}", url));
                }
            }
            Err("No doc_id or url found in file".to_string())
        }
        Err(e) if e.raw_os_error() == Some(1) => {
            // ERROR_INVALID_FUNCTION - Cloud Filesプレースホルダー
            // Google DriveのローカルメタデータDBからdoc_idを検索
            let file_name = Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "Invalid file name".to_string())?;
            lookup_google_drive_doc_id(file_name, &extension)
        }
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

/// Google Docs 拡張子 → MIMEタイプ変換
fn gdocs_mime_type(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "gdoc" => Some("application/vnd.google-apps.document"),
        "gsheet" => Some("application/vnd.google-apps.spreadsheet"),
        "gslides" => Some("application/vnd.google-apps.presentation"),
        _ => None,
    }
}

/// DriveFS メタデータDBへの接続を一括で開く
fn open_drivefs_connections() -> Result<Vec<rusqlite::Connection>, String> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA not set".to_string())?;
    let drivefs_dir = Path::new(&local_app_data).join("Google").join("DriveFS");

    if !drivefs_dir.exists() {
        return Err("Google DriveFS directory not found".to_string());
    }

    let mut conns = Vec::new();
    if let Ok(entries) = fs::read_dir(&drivefs_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let db_path = entry.path().join("metadata_sqlite_db");
                if db_path.exists() {
                    let db_uri = format!(
                        "file:///{}?mode=ro&nolock=1&immutable=1",
                        db_path.to_string_lossy().replace('\\', "/")
                    );
                    if let Ok(c) = rusqlite::Connection::open_with_flags(
                        &db_uri,
                        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                            | rusqlite::OpenFlags::SQLITE_OPEN_URI,
                    ) {
                        conns.push(c);
                    }
                }
            }
        }
    }

    if conns.is_empty() {
        return Err("No Google DriveFS metadata database found".to_string());
    }
    Ok(conns)
}

/// 開いた接続群から doc_id を検索
fn lookup_doc_id_from_connections(
    conns: &[rusqlite::Connection],
    file_name: &str,
    ext: &str,
) -> Option<String> {
    let mime_type = gdocs_mime_type(ext)?;
    for conn in conns {
        let result: Result<String, _> = conn.query_row(
            "SELECT id FROM items WHERE local_title = ?1 AND mime_type = ?2 LIMIT 1",
            rusqlite::params![file_name, mime_type],
            |row| row.get(0),
        );
        if let Ok(doc_id) = result {
            return Some(doc_id);
        }
    }
    None
}

/// Google Drive for DesktopのローカルSQLiteメタデータDBからdoc_idを検索
fn lookup_google_drive_doc_id(file_name: &str, extension: &str) -> Result<String, String> {
    let conns = open_drivefs_connections()?;
    lookup_doc_id_from_connections(&conns, file_name, extension).ok_or_else(|| {
        format!(
            "Document not found in Google Drive metadata: {}",
            file_name
        )
    })
}

/// Google Drive for Desktop の検出状態を返す
#[derive(Debug, Serialize)]
pub struct GoogleDriveStatus {
    pub available: bool,
    pub account_count: usize,
}

#[tauri::command]
pub fn check_google_drive_status() -> GoogleDriveStatus {
    match open_drivefs_connections() {
        Ok(conns) => GoogleDriveStatus {
            available: true,
            account_count: conns.len(),
        },
        Err(_) => GoogleDriveStatus {
            available: false,
            account_count: 0,
        },
    }
}

/// 複数の Google Docs ファイルからサムネイルURLをバッチ取得
#[tauri::command]
pub async fn get_google_docs_thumbnails(
    paths: Vec<String>,
    size: Option<u32>,
) -> Result<std::collections::HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sz = size.unwrap_or(256);
        let conns = open_drivefs_connections()?;
        let mut result = std::collections::HashMap::new();

        for path_str in &paths {
            let p = Path::new(path_str);
            let file_name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            let ext = match p.extension().and_then(|e| e.to_str()) {
                Some(e) => e,
                None => continue,
            };

            if let Some(doc_id) = lookup_doc_id_from_connections(&conns, file_name, ext) {
                let url = format!(
                    "https://drive.google.com/thumbnail?authuser=0&sz=w{}&id={}",
                    sz, doc_id
                );
                result.insert(path_str.clone(), url);
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn read_image_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

#[derive(Debug, Serialize)]
pub struct FileProperties {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: f64,
    pub modified: f64,
    pub accessed: f64,
    pub is_dir: bool,
    pub is_readonly: bool,
    pub is_hidden: bool,
    pub is_system: bool,
    pub file_count: u64,
    pub dir_count: u64,
}

#[tauri::command]
pub fn get_file_properties(path: String) -> Result<FileProperties, String> {
    let p = Path::new(&path);
    let metadata = fs::metadata(p).map_err(|e| format!("Failed to get metadata: {}", e))?;

    let name = p.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let created = metadata.created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);

    let modified = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);

    let accessed = metadata.accessed()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);

    let (is_readonly, is_hidden_flag, is_system);

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let attrs = metadata.file_attributes();
        is_readonly = attrs & 0x1 != 0;
        is_hidden_flag = attrs & 0x2 != 0;
        is_system = attrs & 0x4 != 0;
    }

    #[cfg(not(windows))]
    {
        is_readonly = metadata.permissions().readonly();
        is_hidden_flag = name.starts_with('.');
        is_system = false;
    }

    let (mut size, mut file_count, mut dir_count) = (0u64, 0u64, 0u64);

    if metadata.is_dir() {
        // Calculate total size and counts for directories
        for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
            if entry.path() == p {
                continue;
            }
            if let Ok(m) = entry.metadata() {
                if m.is_dir() {
                    dir_count += 1;
                } else {
                    file_count += 1;
                    size += m.len();
                }
            }
        }
    } else {
        size = metadata.len();
    }

    Ok(FileProperties {
        name,
        path: path.clone(),
        size,
        created,
        modified,
        accessed,
        is_dir: metadata.is_dir(),
        is_readonly,
        is_hidden: is_hidden_flag,
        is_system,
        file_count,
        dir_count,
    })
}

/// テンプレートノード
#[derive(Debug, Deserialize)]
pub struct TemplateNode {
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String, // "directory" or "file"
    pub children: Option<Vec<TemplateNode>>,
    pub content: Option<String>,
}

/// テンプレートからフォルダ構造を作成
/// base_path: 作成先のベースディレクトリ
/// nodes: テンプレートノードのツリー
/// 戻り値: 作成されたパスの一覧
#[tauri::command]
pub fn create_from_template(base_path: String, nodes: Vec<TemplateNode>) -> Result<Vec<String>, String> {
    let base = Path::new(&base_path);
    if !base.is_dir() {
        return Err(format!("Directory not found: {}", base_path));
    }

    let mut created_paths = Vec::new();
    create_nodes_recursive(base, &nodes, &mut created_paths)?;
    Ok(created_paths)
}

fn create_nodes_recursive(
    parent: &Path,
    nodes: &[TemplateNode],
    created_paths: &mut Vec<String>,
) -> Result<(), String> {
    for node in nodes {
        validate_name(&node.name)?;
        let path = parent.join(&node.name);

        if node.node_type == "directory" {
            fs::create_dir_all(&path)
                .map_err(|e| format!("Failed to create directory {}: {}", node.name, e))?;
            created_paths.push(path.to_string_lossy().to_string());

            if let Some(children) = &node.children {
                create_nodes_recursive(&path, children, created_paths)?;
            }
        } else {
            // file
            let content = node.content.as_deref().unwrap_or("");
            fs::write(&path, content)
                .map_err(|e| format!("Failed to create file {}: {}", node.name, e))?;
            created_paths.push(path.to_string_lossy().to_string());
        }
    }
    Ok(())
}

/// フォルダサイズ計算結果
#[derive(Debug, Clone, Serialize)]
pub struct DirSizeEntry {
    pub path: String,
    pub size: u64,
}

/// キャッシュTTL: 10分
const DIR_SIZE_CACHE_TTL: i64 = 600;
/// 1フォルダあたりのタイムアウト: 5秒
const DIR_SIZE_PER_DIR_TIMEOUT: u64 = 5;
/// 全体のタイムアウト: 60秒
const DIR_SIZE_TOTAL_TIMEOUT: u64 = 60;

/// 複数フォルダのサイズを計算（キャッシュ付き、イベントで逐次通知）
/// バックグラウンドスレッドで実行し、メインスレッドをブロックしない
#[tauri::command]
pub async fn calculate_directory_sizes(
    paths: Vec<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Database>();
        let total_start = Instant::now();

        for dir_path in &paths {
            // 全体タイムアウトチェック
            if total_start.elapsed().as_secs() >= DIR_SIZE_TOTAL_TIMEOUT {
                break;
            }

            // キャッシュ確認
            if let Some(cached_size) = state.get_cached_dir_size(dir_path, DIR_SIZE_CACHE_TTL) {
                app.emit(
                    "dir-size-calculated",
                    DirSizeEntry {
                        path: dir_path.clone(),
                        size: cached_size,
                    },
                )
                .ok();
                continue;
            }

            // フォルダでなければスキップ
            let p = Path::new(dir_path);
            if !p.is_dir() {
                app.emit(
                    "dir-size-calculated",
                    DirSizeEntry {
                        path: dir_path.clone(),
                        size: 0,
                    },
                )
                .ok();
                continue;
            }

            // WalkDirで再帰計算
            let start = Instant::now();
            let mut size = 0u64;
            for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
                if start.elapsed().as_secs() >= DIR_SIZE_PER_DIR_TIMEOUT {
                    break;
                }
                if entry.path() == p {
                    continue;
                }
                if let Ok(m) = entry.metadata() {
                    if !m.is_dir() {
                        size += m.len();
                    }
                }
            }

            // キャッシュに保存
            state.save_dir_size(dir_path, size).ok();
            app.emit(
                "dir-size-calculated",
                DirSizeEntry {
                    path: dir_path.clone(),
                    size,
                },
            )
            .ok();
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 煩雑度（整理度）スコア
#[derive(Debug, Serialize)]
pub struct TidinessScore {
    pub total: u32,
    pub ext_score: u32,
    pub age_score: u32,
    pub count_score: u32,
    pub nest_score: u32,
    pub ext_count: u32,
    pub file_count: u64,
    pub dir_count: u64,
    pub max_depth: u32,
    pub old_file_count: u64,
}

const TIDINESS_MAX_FILES: u64 = 50_000;
const TIDINESS_MAX_DEPTH: usize = 6;
const TIDINESS_TIMEOUT_SECS: u64 = 5;

const DAY_SECS: f64 = 86400.0;

/// ディレクトリの煩雑度スコアを計算（WalkDirでネスト構造も走査）
#[tauri::command]
pub fn calculate_tidiness_score(path: String) -> Result<TidinessScore, String> {
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let start = Instant::now();
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);

    let mut file_count: u64 = 0;
    let mut dir_count: u64 = 0;
    let mut max_depth: u32 = 0;
    let mut extensions = std::collections::HashSet::new();
    let mut count_30d: u64 = 0;
    let mut count_90d: u64 = 0;
    let mut count_365d: u64 = 0;
    let mut total_walked: u64 = 0;

    // 直下アイテム数（count_scoreに使用）
    let direct_items = fs::read_dir(dir_path)
        .map(|rd| rd.count())
        .unwrap_or(0) as u32;

    for entry in WalkDir::new(dir_path)
        .max_depth(TIDINESS_MAX_DEPTH)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        // タイムアウトチェック
        if start.elapsed().as_secs() >= TIDINESS_TIMEOUT_SECS {
            break;
        }

        let entry_path = entry.path();
        if entry_path == dir_path {
            continue;
        }

        total_walked += 1;
        if total_walked > TIDINESS_MAX_FILES {
            break;
        }

        let depth = entry.depth() as u32;
        if depth > max_depth {
            max_depth = depth;
        }

        if let Ok(m) = entry.metadata() {
            if m.is_dir() {
                dir_count += 1;
            } else {
                file_count += 1;

                // 拡張子
                if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                    extensions.insert(ext.to_lowercase());
                } else {
                    extensions.insert(String::new());
                }

                // ファイルの古さ
                if let Ok(modified) = m.modified() {
                    if let Ok(age) = modified.duration_since(UNIX_EPOCH) {
                        let age_secs = now_secs - age.as_secs_f64();
                        if age_secs > 30.0 * DAY_SECS {
                            count_30d += 1;
                        }
                        if age_secs > 90.0 * DAY_SECS {
                            count_90d += 1;
                        }
                        if age_secs > 365.0 * DAY_SECS {
                            count_365d += 1;
                        }
                    }
                }
            }
        }
    }

    let ext_count = extensions.len() as u32;

    // S_ext
    let ext_score = if file_count <= 1 {
        100
    } else {
        let base = if ext_count <= 2 { 100 }
        else if ext_count <= 4 { 85 }
        else if ext_count <= 6 { 70 }
        else if ext_count <= 10 { 50 }
        else if ext_count <= 15 { 30 }
        else { (30i32 - (ext_count as i32 - 15) * 2).max(5) as u32 };

        let ratio = ext_count as f64 / file_count as f64;
        let bonus = if ratio < 0.05 { 10 } else if ratio < 0.1 { 5 } else { 0 };
        (base + bonus).min(100)
    };

    // S_age
    let age_score = if file_count == 0 {
        100
    } else {
        let r30 = count_30d as f64 / file_count as f64;
        let r90 = count_90d as f64 / file_count as f64;
        let r365 = count_365d as f64 / file_count as f64;
        let penalty = r30 * 20.0 + r90 * 30.0 + r365 * 40.0;
        (100.0 - penalty).max(0.0).round() as u32
    };

    // S_count（直下アイテム数ベース）
    let count_score = if direct_items <= 10 { 100 }
    else if direct_items <= 30 { 90 }
    else if direct_items <= 50 { 80 }
    else if direct_items <= 100 { 65 }
    else if direct_items <= 200 { 50 }
    else if direct_items <= 500 { 30 }
    else if direct_items <= 1000 { 15 }
    else { 5 };

    // S_nest
    let depth_score: f64 = match max_depth {
        0 | 1 => 90.0,
        2 | 3 => 100.0,
        4 | 5 => 85.0,
        6 | 7 | 8 => 60.0,
        _ => 30.0,
    };

    let flatness_penalty: f64 = if dir_count == 0 && file_count > 20 {
        ((file_count - 20) as f64 * 0.5).min(40.0)
    } else {
        0.0
    };

    let total_items = file_count + dir_count;
    let dir_ratio = if total_items > 0 { dir_count as f64 / total_items as f64 } else { 0.0 };
    let ratio_score: f64 = if total_items < 5 {
        100.0
    } else if dir_ratio < 0.1 && file_count > 30 {
        70.0
    } else if dir_ratio > 0.8 {
        75.0
    } else {
        100.0
    };

    let nest_score = (depth_score * 0.5 + ratio_score * 0.5 - flatness_penalty).max(0.0).round() as u32;

    // 総合スコア
    let total = (0.30 * ext_score as f64
        + 0.20 * age_score as f64
        + 0.30 * count_score as f64
        + 0.20 * nest_score as f64)
        .round() as u32;

    Ok(TidinessScore {
        total,
        ext_score,
        age_score,
        count_score,
        nest_score,
        ext_count,
        file_count,
        dir_count,
        max_depth,
        old_file_count: count_365d,
    })
}
