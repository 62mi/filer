use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;
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

#[tauri::command]
pub fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    for path_str in &paths {
        let path = Path::new(path_str);
        if to_trash {
            trash::delete(path).map_err(|e| format!("Failed to trash {}: {}", path_str, e))?;
        } else if path.is_dir() {
            fs::remove_dir_all(path)
                .map_err(|e| format!("Failed to delete {}: {}", path_str, e))?;
        } else {
            fs::remove_file(path)
                .map_err(|e| format!("Failed to delete {}: {}", path_str, e))?;
        }
    }
    Ok(())
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
