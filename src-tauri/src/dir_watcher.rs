use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// フロントエンドに通知するペイロード
#[derive(Debug, Clone, Serialize)]
pub struct FsChangePayload {
    pub path: String,
}

/// 開いているディレクトリのファイル変更を監視し、フロントエンドに通知する
pub struct DirWatcherManager {
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// path → 参照カウント（複数タブで同じディレクトリを開いている場合）
    watched_dirs: Mutex<HashMap<String, u32>>,
}

impl DirWatcherManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let handle = app_handle.clone();

        // デバウンス: 同一ディレクトリへの連続イベントを抑制
        let debounce_map: std::sync::Arc<Mutex<HashMap<PathBuf, Instant>>> =
            std::sync::Arc::new(Mutex::new(HashMap::new()));
        let debounce_ref = debounce_map.clone();

        let watcher =
            notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                // 変更があったディレクトリを特定
                for path in &event.paths {
                    let dir = if path.is_dir() {
                        path.clone()
                    } else {
                        match path.parent() {
                            Some(p) => p.to_path_buf(),
                            None => continue,
                        }
                    };

                    // デバウンス: 500ms以内の同一ディレクトリイベントはスキップ
                    {
                        let mut map = match debounce_ref.lock() {
                            Ok(m) => m,
                            Err(e) => e.into_inner(),
                        };
                        let now = Instant::now();
                        if let Some(last) = map.get(&dir) {
                            if now.duration_since(*last) < Duration::from_millis(500) {
                                continue;
                            }
                        }
                        map.insert(dir.clone(), now);
                    }

                    handle
                        .emit(
                            "fs-change",
                            FsChangePayload {
                                path: dir.to_string_lossy().to_string(),
                            },
                        )
                        .ok();
                }
            });

        let watcher = match watcher {
            Ok(w) => Some(w),
            Err(e) => {
                eprintln!("Failed to create directory watcher: {}", e);
                None
            }
        };

        Self {
            watcher: Mutex::new(watcher),
            watched_dirs: Mutex::new(HashMap::new()),
        }
    }

    /// ディレクトリの監視を追加（参照カウント方式）
    pub fn watch(&self, path: &str) -> Result<(), String> {
        let path_buf = PathBuf::from(path);
        if !path_buf.is_dir() {
            return Ok(()); // 存在しないディレクトリは無視
        }

        let mut dirs = self
            .watched_dirs
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let count = dirs.entry(path.to_string()).or_insert(0);
        *count += 1;

        // 初回追加時のみwatcherに登録
        if *count == 1 {
            let mut w = self.watcher.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(ref mut watcher) = *w {
                watcher
                    .watch(&path_buf, RecursiveMode::NonRecursive)
                    .map_err(|e| format!("Watch error: {}", e))?;
            }
        }

        Ok(())
    }

    /// ディレクトリの監視を解除（参照カウントが0になったら実際に解除）
    pub fn unwatch(&self, path: &str) -> Result<(), String> {
        let path_buf = PathBuf::from(path);

        let mut dirs = self
            .watched_dirs
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        if let Some(count) = dirs.get_mut(path) {
            *count -= 1;
            if *count == 0 {
                dirs.remove(path);
                let mut w = self.watcher.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(ref mut watcher) = *w {
                    watcher.unwatch(&path_buf).ok();
                }
            }
        }

        Ok(())
    }
}

#[tauri::command]
pub fn watch_directory(
    path: String,
    state: tauri::State<DirWatcherManager>,
) -> Result<(), String> {
    state.watch(&path)
}

#[tauri::command]
pub fn unwatch_directory(
    path: String,
    state: tauri::State<DirWatcherManager>,
) -> Result<(), String> {
    state.unwatch(&path)
}
