use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// タブ転送の状態管理
pub struct TabDragState {
    pub active: Mutex<bool>,
    pub data: Mutex<Option<TabTransferData>>,
    /// 新規ウィンドウ向けの保留タブデータ（ウィンドウラベル → タブデータ）
    pub pending_tabs: Mutex<HashMap<String, serde_json::Value>>,
}

impl TabDragState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(false),
            data: Mutex::new(None),
            pending_tabs: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TabTransferData {
    pub source_window: String,
    pub tab_id: String,
    pub tab_data: serde_json::Value,
}

/// タブ転送を開始する（フロントエンドからマウスがウィンドウ外に出た時に呼ばれる）
#[tauri::command]
pub async fn start_tab_transfer(
    app: AppHandle,
    state: State<'_, TabDragState>,
    source_window: String,
    tab_id: String,
    tab_data: serde_json::Value,
) -> Result<(), String> {
    let transfer_data = TabTransferData {
        source_window,
        tab_id,
        tab_data,
    };

    {
        let mut active = state
            .active
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *active = true;
    }
    {
        let mut data = state
            .data
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *data = Some(transfer_data.clone());
    }

    let app_clone = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        poll_mouse_loop(&app_clone, &transfer_data);
    });

    Ok(())
}

/// タブ転送をキャンセルする（Escキーで呼ばれる）
#[tauri::command]
pub fn cancel_tab_transfer(state: State<'_, TabDragState>) {
    let mut active = state
        .active
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *active = false;
}

/// 新規ウィンドウ起動時に保留中のタブデータを取得する
#[tauri::command]
pub fn check_pending_tab(
    window: tauri::WebviewWindow,
    state: State<'_, TabDragState>,
) -> Option<serde_json::Value> {
    let label = window.label().to_string();
    let mut pending = state
        .pending_tabs
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    pending.remove(&label)
}

/// マウスポーリングループ（Win32 API使用）
#[cfg(windows)]
fn poll_mouse_loop(app: &AppHandle, transfer_data: &TabTransferData) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut last_hover_window: Option<String> = None;

    loop {
        // キャンセルチェック
        let state = app.state::<TabDragState>();
        {
            let active = state
                .active
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if !*active {
                app.emit("tab-drag-cancel", ()).ok();
                break;
            }
        }

        // カーソル位置取得
        let mut point = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
        let cursor_ok = unsafe { GetCursorPos(&mut point) };
        if cursor_ok == 0 {
            std::thread::sleep(std::time::Duration::from_millis(16));
            continue;
        }

        let cursor_x = point.x as f64;
        let cursor_y = point.y as f64;

        // マウスボタン解放チェック (VK_LBUTTON = 0x01)
        let lbutton_down = unsafe { GetAsyncKeyState(0x01) } & (1i16 << 15) != 0;

        // 全ウィンドウを走査してカーソル位置にあるウィンドウを探す
        let mut hover_window: Option<(String, f64, f64)> = None;
        for (label, window) in app.webview_windows() {
            if label == transfer_data.source_window {
                continue;
            }
            // 非表示ウィンドウ（×で隠されたウィンドウ等）はスキップ
            if !window.is_visible().unwrap_or(false) {
                continue;
            }
            if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                let wx = pos.x as f64;
                let wy = pos.y as f64;
                let ww = size.width as f64;
                let wh = size.height as f64;

                if cursor_x >= wx
                    && cursor_x < wx + ww
                    && cursor_y >= wy
                    && cursor_y < wy + wh
                {
                    let local_x = cursor_x - wx;
                    let local_y = cursor_y - wy;
                    hover_window = Some((label.clone(), local_x, local_y));
                    break;
                }
            }
        }

        // ホバーイベント送信
        match &hover_window {
            Some((label, x, y)) => {
                if let Some(window) = app.get_webview_window(label) {
                    window
                        .emit("tab-drag-hover", serde_json::json!({ "x": x, "y": y }))
                        .ok();
                }
                if last_hover_window.as_deref() != Some(label) {
                    if let Some(prev_label) = &last_hover_window {
                        if let Some(prev_window) = app.get_webview_window(prev_label) {
                            prev_window.emit("tab-drag-leave", ()).ok();
                        }
                    }
                    last_hover_window = Some(label.clone());
                }
            }
            None => {
                if let Some(prev_label) = &last_hover_window {
                    if let Some(prev_window) = app.get_webview_window(prev_label) {
                        prev_window.emit("tab-drag-leave", ()).ok();
                    }
                    last_hover_window = None;
                }
            }
        }

        if !lbutton_down {
            // マウスボタン解放 → ドロップ
            match hover_window {
                Some((label, _, _)) => {
                    // ターゲットウィンドウにドロップ
                    if let Some(window) = app.get_webview_window(&label) {
                        window
                            .emit(
                                "tab-drag-drop",
                                serde_json::json!({ "tab_data": transfer_data.tab_data }),
                            )
                            .ok();
                    }
                }
                None => {
                    // どのウィンドウにも属さない → 新ウィンドウ作成
                    match super::window::create_new_window_at(app, cursor_x, cursor_y) {
                        Ok(new_label) => {
                            // 新ウィンドウのReactマウント時にcheck_pending_tabで取得する
                            let mut pending = state
                                .pending_tabs
                                .lock()
                                .unwrap_or_else(|e| e.into_inner());
                            pending
                                .insert(new_label, transfer_data.tab_data.clone());
                        }
                        Err(e) => {
                            eprintln!("新ウィンドウ作成に失敗: {}", e);
                            app.emit("tab-drag-cancel", ()).ok();
                        }
                    }
                }
            }

            // 状態リセット
            {
                let mut active = state
                    .active
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                *active = false;
            }
            {
                let mut data = state
                    .data
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                *data = None;
            }
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(16));
    }
}

#[cfg(not(windows))]
fn poll_mouse_loop(_app: &AppHandle, _transfer_data: &TabTransferData) {
    // Windows以外では未対応
}
