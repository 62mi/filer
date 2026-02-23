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
    open::that(&path).map_err(|e| format!("Failed to open: {}", e))
}
