use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct DriveInfo {
    pub name: String,
    pub path: String,
    pub display_name: String,
    pub icon: Option<String>,
}

#[tauri::command]
pub fn get_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();

    #[cfg(windows)]
    {
        use std::mem;
        use windows_sys::Win32::UI::Shell::{
            SHGetFileInfoW, SHFILEINFOW, SHGFI_DISPLAYNAME, SHGFI_ICON, SHGFI_SMALLICON,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::DestroyIcon;

        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = std::path::Path::new(&drive);
            if path.exists() {
                let drive_wide: Vec<u16> = drive.encode_utf16().chain(std::iter::once(0)).collect();

                // Get display name
                let mut shfi: SHFILEINFOW = unsafe { mem::zeroed() };
                let result = unsafe {
                    SHGetFileInfoW(
                        drive_wide.as_ptr(),
                        0,
                        &mut shfi as *mut SHFILEINFOW,
                        mem::size_of::<SHFILEINFOW>() as u32,
                        SHGFI_DISPLAYNAME,
                    )
                };
                let display_name = if result != 0 {
                    let len = shfi.szDisplayName.iter().position(|&c| c == 0).unwrap_or(shfi.szDisplayName.len());
                    String::from_utf16_lossy(&shfi.szDisplayName[..len])
                } else {
                    format!("Local Disk ({}:)", letter as char)
                };

                // Get icon
                let mut shfi_icon: SHFILEINFOW = unsafe { mem::zeroed() };
                let icon_result = unsafe {
                    SHGetFileInfoW(
                        drive_wide.as_ptr(),
                        0,
                        &mut shfi_icon as *mut SHFILEINFOW,
                        mem::size_of::<SHFILEINFOW>() as u32,
                        SHGFI_ICON | SHGFI_SMALLICON,
                    )
                };
                let icon = if icon_result != 0 && !shfi_icon.hIcon.is_null() {
                    let data_url = super::icons::hicon_to_data_url(shfi_icon.hIcon).ok();
                    unsafe { DestroyIcon(shfi_icon.hIcon) };
                    data_url
                } else {
                    None
                };

                drives.push(DriveInfo {
                    name: format!("{}:", letter as char),
                    path: drive,
                    display_name,
                    icon,
                });
            }
        }
    }

    #[cfg(not(windows))]
    {
        drives.push(DriveInfo {
            name: "/".to_string(),
            path: "/".to_string(),
            display_name: "Root".to_string(),
            icon: None,
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
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    // ディレクトリトラバーサル防止: 正規化パスが元パスと一貫しているか確認
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    if !canonical.exists() {
        return Err(format!("Resolved path does not exist: {}", path));
    }
    open::that(canonical.to_string_lossy().as_ref())
        .map_err(|e| format!("Failed to open: {}", e))
}

#[tauri::command]
pub fn get_accent_color() -> String {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(dwm) = hkcu.open_subkey("SOFTWARE\\Microsoft\\Windows\\DWM") {
            if let Ok(abgr) = dwm.get_value::<u32, _>("AccentColor") {
                // ABGR → RGB
                let r = abgr & 0xFF;
                let g = (abgr >> 8) & 0xFF;
                let b = (abgr >> 16) & 0xFF;
                return format!("#{:02x}{:02x}{:02x}", r, g, b);
            }
        }
        "#0078d4".to_string()
    }

    #[cfg(not(windows))]
    {
        "#0078d4".to_string()
    }
}

#[tauri::command]
pub fn open_with_dialog(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const DETACHED_PROCESS: u32 = 0x00000008;

        Command::new("rundll32")
            .args(["shell32.dll,OpenAs_RunDLL", &path])
            .creation_flags(DETACHED_PROCESS)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open dialog: {}", e))
    }

    #[cfg(not(windows))]
    {
        Err("Open With dialog is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn open_terminal(terminal: String, cwd: String) -> Result<(), String> {
    let cwd_path = std::path::Path::new(&cwd);
    if !cwd_path.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        const DETACHED_PROCESS: u32 = 0x00000008;

        let result = match terminal.as_str() {
            "cmd" => Command::new("cmd")
                .arg("/K")
                .current_dir(&cwd)
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn(),
            "powershell" => Command::new("powershell")
                .arg("-NoExit")
                .current_dir(&cwd)
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn(),
            "pwsh" => Command::new("pwsh")
                .arg("-NoExit")
                .current_dir(&cwd)
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn(),
            "wt" => Command::new("wt")
                .arg("-d")
                .arg(&cwd)
                .creation_flags(DETACHED_PROCESS)
                .spawn(),
            _ => return Err(format!("Unknown terminal: {}", terminal)),
        };
        result.map(|_| ()).map_err(|e| format!("Failed to open {}: {}", terminal, e))
    }

    #[cfg(not(windows))]
    {
        Err("Terminal launch is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const DETACHED_PROCESS: u32 = 0x00000008;

        if p.is_dir() {
            // フォルダ: そのフォルダを開く
            Command::new("explorer.exe")
                .arg(&path)
                .creation_flags(DETACHED_PROCESS)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to open explorer: {}", e))
        } else {
            // ファイル: 親フォルダを開いてファイルを選択状態にする
            Command::new("explorer.exe")
                .args(["/select,", &path])
                .creation_flags(DETACHED_PROCESS)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to open explorer: {}", e))
        }
    }

    #[cfg(not(windows))]
    {
        Err("Open in Explorer is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn open_recycle_bin() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const DETACHED_PROCESS: u32 = 0x00000008;

        Command::new("explorer.exe")
            .arg("shell:RecycleBinFolder")
            .creation_flags(DETACHED_PROCESS)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open Recycle Bin: {}", e))
    }

    #[cfg(not(windows))]
    {
        Err("Recycle Bin is only supported on Windows".to_string())
    }
}
