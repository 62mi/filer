mod commands;

use commands::fs::*;
use commands::system::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
