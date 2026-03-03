mod clipboard_watcher;
mod commands;
mod db;
#[cfg(windows)]
mod jumplist;
mod watcher;

use commands::ai::*;
use commands::clipboard::*;
use commands::copy_queue::*;
use commands::fs::*;
use commands::icons::*;
use commands::media::*;
use commands::system::*;
use db::history::*;
use db::rules::*;
use db::smart_folder::*;
use db::workspace::*;
use db::Database;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
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

/// メインウィンドウを表示・フォーカスする
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        // 非表示の場合のみshow()を呼ぶ（タスクバーアイコン重複防止）
        let is_visible = w.is_visible().unwrap_or(true);
        if !is_visible {
            w.show().ok();
        }
        w.unminimize().ok();
        w.set_focus().ok();
    }
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

    let app = tauri::Builder::default()
        // single-instance は最初に登録（重要）
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--new-window") {
                // --new-window → 新しいウィンドウを作成
                commands::window::create_new_window_internal(app).ok();
            } else {
                // 通常の2回目起動 → 既存ウィンドウを表示・フォーカス
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .manage(database)
        .manage(IconCache {
            cache: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
        .manage(IconCacheLarge {
            cache: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
        .manage(ThumbnailCache {
            cache: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
        .manage(CopyQueueManager::new())
        .manage(commands::tab_drag::TabDragState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let watcher_manager = watcher::WatcherManager::new(handle.clone());
            watcher_manager.start()?;
            app.manage(watcher_manager);

            // クリップボード監視を開始
            #[cfg(windows)]
            {
                let clip_watcher = clipboard_watcher::ClipboardWatcher::start(handle.clone());
                app.manage(clip_watcher);
            }

            // タスクバー Jump List に「新しいウィンドウ」を追加
            #[cfg(windows)]
            jumplist::setup_jump_list();

            // ── AUMID設定（アイコン設定より前に行う） ──
            #[cfg(windows)]
            {
                let aumid: Vec<u16> = "com.filer.app\0".encode_utf16().collect();
                unsafe {
                    windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(
                        aumid.as_ptr(),
                    );
                }
            }

            // ── アイコン読み込み（ICOをバイナリ埋め込み） ──
            let app_icon =
                tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico"))
                    .unwrap_or_else(|_| {
                        app.default_window_icon()
                            .cloned()
                            .unwrap_or_else(|| tauri::image::Image::new(&[0u8, 0, 0, 0], 1, 1))
                    });

            // ウィンドウアイコン設定
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(app_icon.clone()).ok();
                // Tauriのset_icon()はICON_SMALLのみ設定するため、
                // ICON_BIG(タスクバー用)をWin32 APIで直接設定する
                #[cfg(windows)]
                commands::window::apply_taskbar_icon(&window);
            }

            // ── トレイアイコン構築 ──
            let tray_menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "TomaFilerを表示", true, None::<&str>)?,
                    &MenuItem::with_id(app, "new_window", "新しいウィンドウ", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?,
                ],
            )?;

            TrayIconBuilder::new()
                .tooltip("TomaFiler")
                .menu(&tray_menu)
                .icon(app_icon)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "new_window" => {
                        commands::window::create_new_window_internal(app).ok();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // ── --hidden 起動対応 ──
            let args: Vec<String> = std::env::args().collect();
            let start_hidden = args.iter().any(|a| a == "--hidden");

            if start_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide().ok();
                }
            }

            Ok(())
        })
        // ── ×ボタンで hide（全ウィンドウ共通） ──
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                #[cfg(windows)]
                _window.hide().ok();
                api.prevent_close();
            }
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
            open_with_dialog,
            open_terminal,
            search_files,
            read_text_file,
            read_cloud_doc_id,
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
            generate_folder_thumbnail,
            write_clipboard_file,
            clipboard_write_files,
            clipboard_read_files,
            create_from_template,
            transform_image,
            calculate_directory_sizes,
            enqueue_copy,
            pause_copy,
            resume_copy,
            cancel_copy,
            get_copy_queue,
            clear_completed_copies,
            get_accent_color,
            open_in_explorer,
            open_recycle_bin,
            commands::window::create_new_window,
            commands::window::get_window_label,
            commands::tab_drag::start_tab_transfer,
            commands::tab_drag::cancel_tab_transfer,
            commands::tab_drag::check_pending_tab,
            extract_video_thumbnail,
            check_ffmpeg_available,
            get_google_docs_thumbnails,
            check_google_drive_status,
            save_temp_drag_icon,
            save_workspace,
            load_workspace,
            list_workspaces,
            delete_workspace,
            save_session,
            load_session,
            search_file_contents,
            save_smart_folder,
            list_smart_folders,
            delete_smart_folder,
            execute_smart_folder,
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            let msg = format!("アプリケーションの実行中にエラーが発生しました:\n{}", e);
            eprintln!("{}", msg);
            show_error_dialog("TomaFiler - 実行エラー", &msg);
            std::process::exit(1);
        });

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit(); // トレイ常駐のためプロセス維持
        }
    });
}
