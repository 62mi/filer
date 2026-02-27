use std::fs;
use std::path::Path;

#[cfg(windows)]
mod os_clipboard {
    use serde::Serialize;
    use std::ptr;
    use windows_sys::Win32::Foundation::GlobalFree;
    use windows_sys::Win32::System::DataExchange::*;
    use windows_sys::Win32::System::Memory::*;
    use windows_sys::Win32::System::Ole::CF_HDROP;
    use windows_sys::Win32::UI::Shell::DragQueryFileW;

    /// DROPFILES構造体 (CF_HDROP形式のヘッダ)
    #[repr(C)]
    struct DropFiles {
        p_files: u32, // ファイルリストまでのオフセット (20)
        pt_x: i32,
        pt_y: i32,
        f_nc: i32,    // 0
        f_wide: i32,  // 1 = UTF-16
    }

    /// CloseClipboard確実実行用Dropガード
    struct ClipboardGuard;
    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe { CloseClipboard(); }
        }
    }

    /// "Preferred DropEffect" カスタムフォーマットのID取得
    fn get_drop_effect_format() -> u32 {
        let name: Vec<u16> = "Preferred DropEffect\0".encode_utf16().collect();
        unsafe { RegisterClipboardFormatW(name.as_ptr()) }
    }

    /// OpenClipboardをリトライ付きで呼ぶ (他アプリがロック中の場合)
    fn open_clipboard_with_retry() -> Result<ClipboardGuard, String> {
        for i in 0..3 {
            if unsafe { OpenClipboard(ptr::null_mut()) } != 0 {
                return Ok(ClipboardGuard);
            }
            if i < 2 {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
        Err("Failed to open clipboard after 3 retries".to_string())
    }

    /// CF_HDROP形式でファイルパスをOSクリップボードに書き込む
    pub fn write_files(paths: &[String], operation: &str) -> Result<(), String> {
        if paths.is_empty() {
            return Err("No paths to write".to_string());
        }

        // DROPFILES構造体 + UTF-16パスリスト(各パスの後にNUL) + 終端ダブルNUL
        let header_size = std::mem::size_of::<DropFiles>();
        let mut wide_data: Vec<u16> = Vec::new();
        for p in paths {
            let wide: Vec<u16> = p.encode_utf16().collect();
            wide_data.extend_from_slice(&wide);
            wide_data.push(0); // パス終端NUL
        }
        wide_data.push(0); // リスト終端NUL

        let total_size = header_size + wide_data.len() * 2;

        let _guard = open_clipboard_with_retry()?;

        unsafe {
            if EmptyClipboard() == 0 {
                return Err("EmptyClipboard failed".to_string());
            }

            // CF_HDROP データ
            let h_global = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size);
            if h_global.is_null() {
                return Err("GlobalAlloc failed for HDROP".to_string());
            }
            let ptr = GlobalLock(h_global);
            if ptr.is_null() {
                GlobalFree(h_global);
                return Err("GlobalLock failed".to_string());
            }

            // ヘッダ書き込み
            let drop_files = ptr as *mut DropFiles;
            (*drop_files).p_files = header_size as u32;
            (*drop_files).pt_x = 0;
            (*drop_files).pt_y = 0;
            (*drop_files).f_nc = 0;
            (*drop_files).f_wide = 1;

            // パスリスト書き込み
            let data_ptr = (ptr as *mut u8).add(header_size) as *mut u16;
            std::ptr::copy_nonoverlapping(wide_data.as_ptr(), data_ptr, wide_data.len());

            GlobalUnlock(h_global);

            if SetClipboardData(CF_HDROP as u32, h_global).is_null() {
                GlobalFree(h_global);
                return Err("SetClipboardData(CF_HDROP) failed".to_string());
            }
            // SetClipboardData成功後はシステムがメモリを管理するのでFree不要

            // Preferred DropEffect
            let drop_effect_fmt = get_drop_effect_format();
            if drop_effect_fmt != 0 {
                let effect_value: u32 = match operation {
                    "cut" => 2,  // DROPEFFECT_MOVE
                    _ => 1,      // DROPEFFECT_COPY
                };
                let h_effect = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, 4);
                if !h_effect.is_null() {
                    let effect_ptr = GlobalLock(h_effect);
                    if !effect_ptr.is_null() {
                        *(effect_ptr as *mut u32) = effect_value;
                        GlobalUnlock(h_effect);
                        if SetClipboardData(drop_effect_fmt, h_effect).is_null() {
                            GlobalFree(h_effect);
                        }
                    } else {
                        GlobalFree(h_effect);
                    }
                }
            }
        }

        Ok(())
    }

    #[derive(Serialize)]
    pub struct ClipboardFiles {
        pub paths: Vec<String>,
        pub operation: String,
    }

    /// OSクリップボードからCF_HDROP形式のファイルパスを読み取る
    pub fn read_files() -> Result<Option<ClipboardFiles>, String> {
        let _guard = open_clipboard_with_retry()?;

        unsafe {
            let h_drop = GetClipboardData(CF_HDROP as u32);
            if h_drop.is_null() {
                return Ok(None);
            }

            // ファイル数取得
            let count = DragQueryFileW(h_drop as _, u32::MAX, ptr::null_mut(), 0);
            if count == 0 {
                return Ok(None);
            }

            let mut paths = Vec::with_capacity(count as usize);
            for i in 0..count {
                // 必要なバッファサイズ取得 (NUL含まない文字数)
                let len = DragQueryFileW(h_drop as _, i, ptr::null_mut(), 0);
                if len == 0 {
                    continue;
                }
                let mut buf: Vec<u16> = vec![0u16; (len + 1) as usize];
                DragQueryFileW(h_drop as _, i, buf.as_mut_ptr(), buf.len() as u32);
                // NUL終端を除去して文字列化
                let path = String::from_utf16_lossy(&buf[..len as usize]);
                paths.push(path);
            }

            // Preferred DropEffect 読み取り
            let operation = {
                let fmt = get_drop_effect_format();
                if fmt != 0 {
                    let h_effect = GetClipboardData(fmt);
                    if !h_effect.is_null() {
                        let effect_ptr = GlobalLock(h_effect);
                        if !effect_ptr.is_null() {
                            let val = *(effect_ptr as *const u32);
                            GlobalUnlock(h_effect);
                            if val & 2 != 0 { "cut" } else { "copy" }
                        } else {
                            "copy"
                        }
                    } else {
                        "copy"
                    }
                } else {
                    "copy"
                }
            };

            Ok(Some(ClipboardFiles {
                paths,
                operation: operation.to_string(),
            }))
        }
    }
}

/// 外部モジュール向け: OSクリップボードからCF_HDROP + DropEffectを同期的に読み取る
#[cfg(windows)]
pub fn read_clipboard_files_sync() -> Result<Option<(Vec<String>, String)>, String> {
    os_clipboard::read_files().map(|opt| opt.map(|cf| (cf.paths, cf.operation)))
}

/// OSクリップボードにファイルパスをCF_HDROP形式で書き込む
#[cfg(windows)]
#[tauri::command]
pub fn clipboard_write_files(paths: Vec<String>, operation: String) -> Result<(), String> {
    os_clipboard::write_files(&paths, &operation)
}

#[cfg(not(windows))]
#[tauri::command]
pub fn clipboard_write_files(_paths: Vec<String>, _operation: String) -> Result<(), String> {
    Err("OS clipboard not supported on this platform".to_string())
}

/// OSクリップボードからCF_HDROP形式のファイルパスを読み取る
#[cfg(windows)]
#[tauri::command]
pub fn clipboard_read_files() -> Result<Option<os_clipboard::ClipboardFiles>, String> {
    os_clipboard::read_files()
}

#[cfg(not(windows))]
#[tauri::command]
pub fn clipboard_read_files() -> Result<Option<serde_json::Value>, String> {
    Ok(None)
}

/// クリップボードデータをファイルとして保存
/// data: バイナリデータ
/// extension: ファイル拡張子 (png, txt等)
/// 戻り値: 作成されたファイルのフルパス
#[tauri::command]
pub fn write_clipboard_file(dir: String, data: Vec<u8>, extension: String) -> Result<String, String> {
    // 拡張子のバリデーション（パストラバーサル防止）
    if extension.is_empty()
        || extension.contains('/')
        || extension.contains('\\')
        || extension.contains('\0')
        || extension.contains("..")
    {
        return Err("Invalid extension".to_string());
    }

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
