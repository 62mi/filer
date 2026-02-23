mod commands;
mod db;
mod watcher;

use commands::ai::*;
use commands::fs::*;
use commands::icons::*;
use commands::system::*;
use db::history::*;
use db::rules::*;
use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::new().expect("Failed to initialize database");
    database.cleanup_old_entries().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(database)
        .manage(IconCache { cache: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .manage(IconCacheLarge { cache: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .manage(ThumbnailCache { cache: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .setup(|app| {
            let handle = app.handle().clone();
            let watcher_manager = watcher::WatcherManager::new(handle);
            watcher_manager.start()?;
            app.manage(watcher_manager);
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
