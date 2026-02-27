mod clipboard_watcher;
mod commands;
mod db;
mod watcher;

use commands::ai::*;
use commands::clipboard::*;
use commands::copy_queue::*;
use commands::fs::*;
use commands::icons::*;
use commands::system::*;
use db::history::*;
use db::rules::*;
use db::Database;
use tauri::Manager;

/// Windows MessageBox でエラーを表示する
#[cfg(windows)]
fn show_error_dialog(title: &str, message: &str) {
    use std::ptr;
    let title_wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    let msg_wide: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            ptr::null_mut(),
            msg_wide.as_ptr(),
            title_wide.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
        );
    }
}

#[cfg(not(windows))]
fn show_error_dialog(_title: &str, message: &str) {
    eprintln!("{}", message);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = match Database::new() {
        Ok(db) => db,
        Err(e) => {
            let msg = format!("データベースの初期化に失敗しました:\n{}", e);
            eprintln!("{}", msg);
            show_error_dialog("TomaFiler - 起動エラー", &msg);
            return;
        }
    };
    database.cleanup_old_entries().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .manage(database)
        .manage(IconCache { cache: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .manage(IconCacheLarge { cache: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .manage(ThumbnailCache { cache: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .manage(CopyQueueManager::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let watcher_manager = watcher::WatcherManager::new(handle.clone());
            watcher_manager.start()?;
            app.manage(watcher_manager);

            // クリップボード監視を開始
            #[cfg(windows)]
            {
                let clip_watcher = clipboard_watcher::ClipboardWatcher::start(handle);
                app.manage(clip_watcher);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_directory,
            copy_files,
            move_files,
            delete_files,
            rename_file,
            create_directory,
            create_file,
            get_drives,
            get_home_dir,
            get_parent_dir,
            open_in_default_app,
            open_terminal,
            search_files,
            read_text_file,
            read_image_base64,
            get_file_properties,
            group_files_into_folder,
            record_move_operation,
            get_move_suggestions,
            detect_rule_patterns,
            get_rules_for_folder,
            get_all_rules,
            create_rule,
            update_rule,
            delete_rule,
            toggle_rule,
            set_rule_auto_execute,
            accept_rule_suggestion,
            watcher::refresh_watcher,
            save_api_key,
            load_api_key,
            delete_api_key,
            has_api_key,
            ai_generate_plan,
            ai_generate_actions,
            ai_execute_actions,
            get_ai_usage,
            set_ai_budget,
            ai_generate_rule,
            get_file_icons,
            get_file_icons_large,
            get_thumbnails,
            write_clipboard_file,
            clipboard_write_files,
            clipboard_read_files,
            create_from_template,
            calculate_tidiness_score,
            calculate_directory_sizes,
            enqueue_copy,
            pause_copy,
            resume_copy,
            cancel_copy,
            get_copy_queue,
            clear_completed_copies,
            get_accent_color,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            let msg = format!("アプリケーションの実行中にエラーが発生しました:\n{}", e);
            eprintln!("{}", msg);
            show_error_dialog("TomaFiler - 実行エラー", &msg);
        });
}
