use std::fs;
use std::path::Path;

/// クリップボードデータをファイルとして保存
/// data: バイナリデータ
/// extension: ファイル拡張子 (png, txt等)
/// 戻り値: 作成されたファイルのフルパス
#[tauri::command]
pub fn write_clipboard_file(dir: String, data: Vec<u8>, extension: String) -> Result<String, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.is_dir() {
        return Err(format!("Directory not found: {}", dir));
    }

    // タイムスタンプベースのファイル名
    let now = chrono::Local::now();
    let base_name = now.format("clipboard_%Y%m%d_%H%M%S").to_string();
    let file_name = format!("{}.{}", base_name, extension);
    let mut file_path = dir_path.join(&file_name);

    // 重複時はカウンター付与
    let mut counter = 1;
    while file_path.exists() {
        let name = format!("{}_{}.{}", base_name, counter, extension);
        file_path = dir_path.join(&name);
        counter += 1;
    }

    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to write clipboard file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}
