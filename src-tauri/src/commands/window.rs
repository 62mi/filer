use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// EXEリソースからアイコンを読み込み、WM_SETICONでウィンドウに設定する。
/// Tauriのset_icon()はICON_SMALL(タイトルバー用)のみ設定し、
/// ICON_BIG(タスクバー用)が未設定になるため、Win32 APIで直接設定する。
#[cfg(windows)]
pub fn apply_taskbar_icon(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        LoadImageW, SendMessageW, IMAGE_ICON, LR_DEFAULTSIZE, WM_SETICON,
    };

    const ICON_BIG: usize = 1;
    const ICON_SMALL: usize = 0;

    let hwnd = match window.hwnd() {
        Ok(h) => h.0 as isize,
        Err(_) => return,
    };

    unsafe {
        let hinstance = GetModuleHandleW(std::ptr::null());

        // タスクバー用大アイコン（OSがICOから適切なサイズを自動選択）
        let hicon_big = LoadImageW(
            hinstance,
            1 as *const u16, // MAKEINTRESOURCE(1) = アプリアイコン
            IMAGE_ICON,
            0,
            0, // 0,0 → SM_CXICON x SM_CYICON（通常32x32）
            LR_DEFAULTSIZE,
        );
        if hicon_big != 0 {
            SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big as isize);
        }

        // タイトルバー用小アイコン（16x16）
        let hicon_small = LoadImageW(
            hinstance,
            1 as *const u16,
            IMAGE_ICON,
            16,
            16,
            0,
        );
        if hicon_small != 0 {
            SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small as isize);
        }
    }
}

/// 新しいウィンドウを内部的に作成する（トレイメニューからも呼べるユーティリティ）
/// ×ボタンの hide 処理はアプリレベルの on_window_event で一括処理するため、ここでは不要
pub fn create_new_window_internal(app: &AppHandle) -> Result<String, String> {
    let label = format!("window-{}", uuid::Uuid::new_v4());
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("TomaFiler")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 500.0)
        .decorations(false)
        .build()
        .map_err(|e| format!("ウィンドウ作成に失敗: {}", e))?;

    #[cfg(windows)]
    apply_taskbar_icon(&window);

    Ok(label)
}

/// 指定座標に新しいウィンドウを作成する（タブのウィンドウ外ドロップ用）
pub fn create_new_window_at(app: &AppHandle, x: f64, y: f64) -> Result<String, String> {
    let label = format!("window-{}", uuid::Uuid::new_v4());
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("TomaFiler")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 500.0)
        .decorations(false)
        .position(x, y)
        .build()
        .map_err(|e| format!("ウィンドウ作成に失敗: {}", e))?;

    #[cfg(windows)]
    apply_taskbar_icon(&window);

    Ok(label)
}

#[tauri::command]
pub fn create_new_window(app: AppHandle) -> Result<String, String> {
    create_new_window_internal(&app)
}

#[tauri::command]
pub fn get_window_label(window: tauri::WebviewWindow) -> String {
    window.label().to_string()
}
