use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// 新しいウィンドウを内部的に作成する（トレイメニューからも呼べるユーティリティ）
/// ×ボタンの hide 処理はアプリレベルの on_window_event で一括処理するため、ここでは不要
pub fn create_new_window_internal(app: &AppHandle) -> Result<String, String> {
    let label = format!("window-{}", uuid::Uuid::new_v4());
    WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("TomaFiler")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 500.0)
        .decorations(false)
        .build()
        .map_err(|e| format!("ウィンドウ作成に失敗: {}", e))?;

    Ok(label)
}

/// 指定座標に新しいウィンドウを作成する（タブのウィンドウ外ドロップ用）
pub fn create_new_window_at(app: &AppHandle, x: f64, y: f64) -> Result<String, String> {
    let label = format!("window-{}", uuid::Uuid::new_v4());
    WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("TomaFiler")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 500.0)
        .decorations(false)
        .position(x, y)
        .build()
        .map_err(|e| format!("ウィンドウ作成に失敗: {}", e))?;

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
