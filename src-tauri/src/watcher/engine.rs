use crate::db::rules::FolderRule;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

/// ルールの全条件がファイルにマッチするか判定
pub fn matches_rule(file_path: &Path, rule: &FolderRule) -> bool {
    if rule.conditions.is_empty() {
        return false; // 条件なし = マッチしない（安全策）
    }
    let metadata = match fs::metadata(file_path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if metadata.is_dir() {
        return false; // ディレクトリはルール対象外
    }
    rule.conditions
        .iter()
        .all(|c| matches_condition(file_path, &metadata, &c.cond_type, &c.cond_value))
}

fn matches_condition(
    file_path: &Path,
    metadata: &fs::Metadata,
    cond_type: &str,
    cond_value: &str,
) -> bool {
    match cond_type {
        "extension" => {
            let file_ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            cond_value
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .any(|ext| ext == file_ext)
        }
        "name_glob" => {
            let name = file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            glob::Pattern::new(cond_value)
                .map(|p| {
                    p.matches_with(
                        name,
                        glob::MatchOptions {
                            case_sensitive: false,
                            ..Default::default()
                        },
                    )
                })
                .unwrap_or(false)
        }
        "name_contains" => {
            let name = file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            name.to_lowercase().contains(&cond_value.to_lowercase())
        }
        "size_min" => match cond_value.parse::<u64>() {
            Ok(min) => metadata.len() >= min,
            Err(_) => {
                eprintln!("[rule] Invalid size_min value: {}", cond_value);
                false
            }
        },
        "size_max" => match cond_value.parse::<u64>() {
            Ok(max) => metadata.len() <= max,
            Err(_) => {
                eprintln!("[rule] Invalid size_max value: {}", cond_value);
                false
            }
        },
        "age_days" => match cond_value.parse::<u64>() {
            Ok(days) => metadata
                .modified()
                .ok()
                .and_then(|t| SystemTime::now().duration_since(t).ok())
                .map(|age| age.as_secs() >= days * 86400)
                .unwrap_or(false),
            Err(_) => {
                eprintln!("[rule] Invalid age_days value: {}", cond_value);
                false
            }
        },
        _ => false,
    }
}

/// ルールのアクションを実行。成功時は移動先パス（あれば）を返す
pub fn execute_action(
    file_path: &Path,
    rule: &FolderRule,
) -> Result<Option<String>, String> {
    match rule.action_type.as_str() {
        "move" => {
            let dest_dir = rule
                .action_dest
                .as_deref()
                .ok_or("Move rule has no destination")?;
            let dest = Path::new(dest_dir);
            fs::create_dir_all(dest).map_err(|e| format!("Create dest dir: {}", e))?;
            let file_name = file_path
                .file_name()
                .ok_or("No file name")?;
            let target = dest.join(file_name);
            // 同名ファイルがある場合はリネーム
            let target = deduplicate_path(&target);
            // rename を試行、失敗時はコピー+削除（クロスドライブ対応）
            if fs::rename(file_path, &target).is_err() {
                fs::copy(file_path, &target).map_err(|e| format!("Copy: {}", e))?;
                fs::remove_file(file_path).map_err(|e| format!("Remove: {}", e))?;
            }
            Ok(Some(target.to_string_lossy().to_string()))
        }
        "copy" => {
            let dest_dir = rule
                .action_dest
                .as_deref()
                .ok_or("Copy rule has no destination")?;
            let dest = Path::new(dest_dir);
            fs::create_dir_all(dest).map_err(|e| format!("Create dest dir: {}", e))?;
            let file_name = file_path.file_name().ok_or("No file name")?;
            let target = dest.join(file_name);
            let target = deduplicate_path(&target);
            fs::copy(file_path, &target).map_err(|e| format!("Copy: {}", e))?;
            Ok(Some(target.to_string_lossy().to_string()))
        }
        "delete" => {
            trash::delete(file_path).map_err(|e| format!("Trash: {}", e))?;
            Ok(None)
        }
        _ => Err(format!("Unknown action: {}", rule.action_type)),
    }
}

/// 同名ファイルが存在する場合に "(1)", "(2)" を付与
fn deduplicate_path(path: &Path) -> std::path::PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let parent = path.parent().unwrap_or(Path::new("."));

    for i in 1..1000 {
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, i)
        } else {
            format!("{} ({}).{}", stem, i, ext)
        };
        let candidate = parent.join(&new_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    path.to_path_buf()
}
