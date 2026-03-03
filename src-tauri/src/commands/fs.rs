use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use walkdir::WalkDir;

const DEFAULT_SEARCH_MAX_RESULTS: usize = 200;
const DEFAULT_SEARCH_MAX_DEPTH: usize = 5;
const DEFAULT_READ_MAX_BYTES: usize = 50_000;

/// 宛先に同名ファイル/フォルダが存在する場合、「name (N).ext」形式のユニークなパスを生成
/// is_dir=true の場合は拡張子を分離せず名前全体をステムとして扱う
pub fn generate_unique_path(dest_dir: &Path, file_name: &std::ffi::OsStr, is_dir: bool) -> PathBuf {
    let target = dest_dir.join(file_name);
    if !target.exists() {
        return target;
    }

    let name_str = file_name.to_string_lossy();

    // ディレクトリ: 名前全体をステムとして扱う（"folder.bak" → "folder.bak (1)"）
    // ファイル: ステムと拡張子を分離（"file.txt" → "file (1).txt"）
    let (stem, ext): (&str, Option<&str>) = if is_dir {
        (&name_str, None)
    } else {
        match name_str.rfind('.') {
            Some(dot_pos) if dot_pos > 0 => (&name_str[..dot_pos], Some(&name_str[dot_pos..])),
            _ => (&name_str, None),
        }
    };

    let mut counter = 1;
    loop {
        let new_name = match ext {
            Some(ext) => format!("{} ({}){}", stem, counter, ext),
            None => format!("{} ({})", stem, counter),
        };
        let new_target = dest_dir.join(&new_name);
        if !new_target.exists() {
            return new_target;
        }
        counter += 1;
    }
}

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
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_files(sources: Vec<String>, dest: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest_path = Path::new(&dest);
        let mut actual_paths = Vec::with_capacity(sources.len());
        for source in &sources {
            let src_path = Path::new(source);
            let file_name = src_path
                .file_name()
                .ok_or_else(|| "Invalid source path".to_string())?;
            let target = generate_unique_path(dest_path, file_name, src_path.is_dir());

            if src_path.is_dir() {
                copy_dir_recursive(src_path, &target)?;
            } else {
                fs::copy(src_path, &target)
                    .map_err(|e| format!("Failed to copy {}: {}", source, e))?;
            }
            actual_paths.push(target.to_string_lossy().to_string());
        }
        Ok(actual_paths)
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn move_files(sources: Vec<String>, dest: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest_path = Path::new(&dest);
        let mut actual_paths = Vec::with_capacity(sources.len());
        for source in &sources {
            let src_path = Path::new(source);
            let file_name = src_path
                .file_name()
                .ok_or_else(|| "Invalid source path".to_string())?;
            let target = generate_unique_path(dest_path, file_name, src_path.is_dir());
            match fs::rename(src_path, &target) {
                Ok(()) => {}
                Err(_) => {
                    // rename失敗（クロスドライブ等）: コピー→削除でフォールバック
                    if src_path.is_dir() {
                        copy_dir_recursive(src_path, &target)
                            .map_err(|e| format!("Failed to move {}: {}", source, e))?;
                        fs::remove_dir_all(src_path)
                            .map_err(|e| format!("Failed to remove source dir {}: {}", source, e))?;
                    } else {
                        fs::copy(src_path, &target)
                            .map_err(|e| format!("Failed to move {}: {}", source, e))?;
                        fs::remove_file(src_path)
                            .map_err(|e| format!("Failed to remove source {}: {}", source, e))?;
                    }
                }
            }
            actual_paths.push(target.to_string_lossy().to_string());
        }
        Ok(actual_paths)
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn search_files(path: String, query: String, max_results: Option<usize>, max_depth: Option<usize>) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn read_image_base64(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&data))
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn get_file_properties(path: String) -> Result<FileProperties, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| e.to_string())?
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

/// 画像を回転・反転して上書き保存する
#[tauri::command]
pub async fn transform_image(
    path: String,
    rotation: u32,
    flip_h: bool,
    flip_v: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img_path = Path::new(&path);
        let ext = img_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        // 対応フォーマットの確認（image crateでエンコード可能な形式のみ）
        let is_jpeg = matches!(ext.as_str(), "jpg" | "jpeg" | "jpe" | "jfif");
        if !is_jpeg && !matches!(ext.as_str(), "png" | "gif" | "webp") {
            return Err(format!("この形式は保存に対応していません: {}", ext));
        }

        let mut img = image::open(&path)
            .map_err(|e| format!("画像のデコードに失敗: {}", e))?;

        // 回転（時計回り）
        img = match rotation % 360 {
            90 => img.rotate90(),
            180 => img.rotate180(),
            270 => img.rotate270(),
            _ => img,
        };

        // 反転
        if flip_h {
            img = img.fliph();
        }
        if flip_v {
            img = img.flipv();
        }

        // 保存
        if is_jpeg {
            use std::io::BufWriter;
            let file = fs::File::create(&path)
                .map_err(|e| format!("ファイルを作成できませんでした: {}", e))?;
            let writer = BufWriter::new(file);
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, 90);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("画像の保存に失敗: {}", e))?;
        } else {
            img.save(&path)
                .map_err(|e| format!("画像の保存に失敗: {}", e))?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
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

/// ドラッグアイコン用の一時PNGファイルを保存し、パスを返す
#[tauri::command]
pub fn save_temp_drag_icon(data: Vec<u8>) -> Result<String, String> {
    let path = std::env::temp_dir().join("filer_drag_icon.png");
    fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

// ───────────────────────────────────────────────────────
//  整理スコア (Organization Score)
// ───────────────────────────────────────────────────────

/// 整理スコア計算結果
#[derive(Debug, Serialize)]
pub struct OrganizationScore {
    pub score: u32,
    pub naming_score: u32,
    pub folder_ratio_score: u32,
    pub diversity_score: u32,
    pub duplicate_score: u32,
}

/// 重複疑いパターン: (1), (2), Copy, コピー 等
fn is_suspected_duplicate(name: &str) -> bool {
    // " (数字)" パターン
    if let Some(paren_pos) = name.rfind(" (") {
        if let Some(close_pos) = name[paren_pos..].find(')') {
            let inner = &name[paren_pos + 2..paren_pos + close_pos];
            if inner.chars().all(|c| c.is_ascii_digit()) && !inner.is_empty() {
                return true;
            }
        }
    }
    let lower = name.to_lowercase();
    lower.contains(" - copy")
        || lower.contains(" copy")
        || lower.contains("コピー")
        || lower.contains(" - コピー")
}

/// フォルダの整理スコアを計算する（0-100、100が最も整理されている）
#[tauri::command]
pub async fn calculate_organization_score(path: String) -> Result<OrganizationScore, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir_path = Path::new(&path);
        if !dir_path.is_dir() {
            return Err(format!("Not a directory: {}", path));
        }

        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut file_count = 0u32;
        let mut dir_count = 0u32;
        let mut no_ext_count = 0u32;
        let mut duplicate_count = 0u32;
        let mut extensions: HashMap<String, u32> = HashMap::new();
        let mut naming_styles: [u32; 4] = [0; 4]; // 0=all_lower, 1=all_upper, 2=camel, 3=mixed

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();

            if metadata.is_dir() {
                dir_count += 1;
                continue;
            }
            file_count += 1;

            // 拡張子チェック
            let ext = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext.is_empty() {
                no_ext_count += 1;
            } else {
                *extensions.entry(ext).or_insert(0) += 1;
            }

            // 命名スタイル判定（拡張子を除いたステム部分）
            let stem = Path::new(&name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&name);
            let alpha_chars: String = stem.chars().filter(|c| c.is_alphabetic()).collect();
            if !alpha_chars.is_empty() {
                if alpha_chars == alpha_chars.to_lowercase() {
                    naming_styles[0] += 1;
                } else if alpha_chars == alpha_chars.to_uppercase() {
                    naming_styles[1] += 1;
                } else if alpha_chars.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
                    naming_styles[2] += 1; // CamelCase / Title
                } else {
                    naming_styles[3] += 1;
                }
            }

            // 重複疑い
            if is_suspected_duplicate(&name) {
                duplicate_count += 1;
            }
        }

        let total = file_count + dir_count;
        if total == 0 {
            // 空フォルダは満点
            return Ok(OrganizationScore {
                score: 100,
                naming_score: 100,
                folder_ratio_score: 100,
                diversity_score: 100,
                duplicate_score: 100,
            });
        }

        // 1. 命名規則の統一度 (25pt)
        //    拡張子なしファイルのペナルティ + 命名スタイル一貫性
        let naming_score = if file_count == 0 {
            100
        } else {
            let no_ext_ratio = no_ext_count as f64 / file_count as f64;
            let no_ext_penalty = (no_ext_ratio * 40.0) as u32; // 最大40pt減点

            // 最も多い命名スタイルの割合
            let max_style = *naming_styles.iter().max().unwrap_or(&0);
            let style_total: u32 = naming_styles.iter().sum();
            let consistency = if style_total > 0 {
                max_style as f64 / style_total as f64
            } else {
                1.0
            };
            let style_score = (consistency * 100.0) as u32;
            style_score.saturating_sub(no_ext_penalty).min(100)
        };

        // 2. フォルダ分類率 (25pt)
        //    ファイル数 / (フォルダ数 + 1) — 低いほど良い（ファイルがフォルダに分類されている）
        let folder_ratio_score = {
            let ratio = file_count as f64 / (dir_count as f64 + 1.0);
            if ratio <= 5.0 {
                100 // 5ファイル以下/フォルダなら十分整理されている
            } else if ratio <= 10.0 {
                80
            } else if ratio <= 20.0 {
                60
            } else if ratio <= 50.0 {
                40
            } else {
                20
            }
        };

        // 3. ファイル種類の多様性 (25pt)
        //    拡張子の種類が少ないほど良い（同質なフォルダ）
        let diversity_score = {
            let ext_count = extensions.len() as u32;
            if ext_count <= 2 {
                100
            } else if ext_count <= 4 {
                80
            } else if ext_count <= 8 {
                60
            } else if ext_count <= 15 {
                40
            } else {
                20
            }
        };

        // 4. 重複疑い (25pt)
        let duplicate_score = if file_count == 0 {
            100
        } else {
            let dup_ratio = duplicate_count as f64 / file_count as f64;
            if dup_ratio == 0.0 {
                100
            } else if dup_ratio < 0.05 {
                80
            } else if dup_ratio < 0.1 {
                60
            } else if dup_ratio < 0.2 {
                40
            } else {
                20
            }
        };

        // 総合スコア（4項目の加重平均）
        let score = (naming_score + folder_ratio_score + diversity_score + duplicate_score) / 4;

        Ok(OrganizationScore {
            score,
            naming_score,
            folder_ratio_score,
            diversity_score,
            duplicate_score,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ───────────────────────────────────────────────────────
//  重複ファイル検出 (Duplicate File Detection)
// ───────────────────────────────────────────────────────

/// 重複ファイルグループ内のファイル情報
#[derive(Debug, Serialize, Clone)]
pub struct DuplicateFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: f64,
}

/// 重複ファイルのグループ
#[derive(Debug, Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub files: Vec<DuplicateFileInfo>,
}

/// 重複検出結果
#[derive(Debug, Serialize)]
pub struct DuplicateResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_wasted_bytes: u64,
    pub scanned_files: u32,
}

/// 100MB上限
const DUPLICATE_MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;
/// 先頭チャンクサイズ（4KB）
const HASH_CHUNK_SIZE: usize = 4096;

/// ファイルの先頭4KBのblake3ハッシュを計算
fn hash_file_head(path: &Path) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let mut buf = vec![0u8; HASH_CHUNK_SIZE];
    let n = file.read(&mut buf)?;
    buf.truncate(n);
    Ok(blake3::hash(&buf).to_hex().to_string())
}

/// 重複ファイルを検出する
/// 1. サイズでグルーピング
/// 2. 同サイズファイルの先頭4KBをblake3でハッシュ比較
#[tauri::command]
pub async fn find_duplicate_files(path: String, recursive: Option<bool>) -> Result<DuplicateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir_path = Path::new(&path);
        if !dir_path.is_dir() {
            return Err(format!("Not a directory: {}", path));
        }

        let is_recursive = recursive.unwrap_or(true);
        let max_depth = if is_recursive { usize::MAX } else { 1 };

        // Phase 1: サイズでグルーピング
        let mut size_groups: HashMap<u64, Vec<PathBuf>> = HashMap::new();
        let mut scanned_files = 0u32;

        for entry in WalkDir::new(dir_path)
            .max_depth(max_depth)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if metadata.is_dir() || metadata.is_symlink() {
                continue;
            }
            let size = metadata.len();
            // 0バイトファイルとサイズ上限超過はスキップ
            if size == 0 || size > DUPLICATE_MAX_FILE_SIZE {
                continue;
            }
            scanned_files += 1;
            size_groups
                .entry(size)
                .or_default()
                .push(entry.into_path());
        }

        // Phase 2: 同サイズファイルのハッシュ比較
        let mut groups = Vec::new();
        let mut total_wasted_bytes = 0u64;

        for (size, paths) in &size_groups {
            if paths.len() < 2 {
                continue;
            }

            // ハッシュでグルーピング
            let mut hash_groups: HashMap<String, Vec<&PathBuf>> = HashMap::new();
            for p in paths {
                match hash_file_head(p) {
                    Ok(hash) => {
                        hash_groups.entry(hash).or_default().push(p);
                    }
                    Err(e) => {
                        eprintln!("[fs] Failed to hash {}: {}", p.display(), e);
                    }
                }
            }

            for (hash, matched_paths) in hash_groups {
                if matched_paths.len() < 2 {
                    continue;
                }

                let files: Vec<DuplicateFileInfo> = matched_paths
                    .iter()
                    .map(|p| {
                        let modified = fs::metadata(p)
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_secs_f64())
                            .unwrap_or(0.0);
                        DuplicateFileInfo {
                            path: p.to_string_lossy().to_string(),
                            name: p.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default(),
                            size: *size,
                            modified,
                        }
                    })
                    .collect();

                // 重複分のバイト数（ファイル数 - 1）× サイズ
                total_wasted_bytes += (files.len() as u64 - 1) * size;

                groups.push(DuplicateGroup {
                    hash,
                    size: *size,
                    files,
                });
            }
        }

        // サイズ降順でソート
        groups.sort_by(|a, b| b.size.cmp(&a.size));

        Ok(DuplicateResult {
            groups,
            total_wasted_bytes,
            scanned_files,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

