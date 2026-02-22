use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct DriveInfo {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn get_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();

    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = std::path::Path::new(&drive);
            if path.exists() {
                drives.push(DriveInfo {
                    name: format!("{}:", letter as char),
                    path: drive,
                });
            }
        }
    }

    #[cfg(not(windows))]
    {
        drives.push(DriveInfo {
            name: "/".to_string(),
            path: "/".to_string(),
        });
    }

    drives
}

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[tauri::command]
pub fn get_parent_dir(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    p.parent()
        .map(|parent| parent.to_string_lossy().to_string())
        .ok_or_else(|| "No parent directory".to_string())
}

#[tauri::command]
pub fn open_in_default_app(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open: {}", e))
}
