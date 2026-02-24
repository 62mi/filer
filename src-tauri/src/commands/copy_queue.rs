use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

const CHUNK_SIZE: usize = 8 * 1024; // 8KB

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyQueueItem {
    pub id: String,
    pub sources: Vec<String>,
    pub dest: String,
    pub operation: String, // "copy" or "move"
    pub total_bytes: u64,
    pub copied_bytes: u64,
    pub file_count: usize,
    pub files_done: usize,
    pub status: String, // "calculating", "pending", "running", "paused", "completed", "cancelled", "error"
    pub error: Option<String>,
    pub current_file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CopyProgress {
    pub id: String,
    pub total_bytes: u64,
    pub copied_bytes: u64,
    pub file_count: usize,
    pub files_done: usize,
    pub status: String,
    pub error: Option<String>,
    pub current_file: Option<String>,
}

struct QueueItemState {
    id: String,
    sources: Vec<String>,
    dest: String,
    operation: String,
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
    total_bytes: Arc<AtomicU64>,
    copied_bytes: Arc<AtomicU64>,
    file_count: Arc<AtomicU64>,
    files_done: Arc<AtomicU64>,
    current_file: Arc<Mutex<Option<String>>>,
    status: Arc<Mutex<String>>,
    error: Arc<Mutex<Option<String>>>,
}

pub struct CopyQueueManager {
    items: Arc<Mutex<Vec<Arc<QueueItemState>>>>,
}

impl CopyQueueManager {
    pub fn new() -> Self {
        Self {
            items: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

fn calculate_total_bytes(sources: &[String]) -> u64 {
    let mut total = 0u64;
    for source in sources {
        let path = Path::new(source);
        if path.is_dir() {
            for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                if entry.path().is_file() {
                    total += entry.metadata().map(|m| m.len()).unwrap_or(0);
                }
            }
        } else if path.is_file() {
            total += fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        }
    }
    total
}

fn copy_file_chunked(
    src: &Path,
    dst: &Path,
    copied_bytes: &Arc<AtomicU64>,
    paused: &Arc<AtomicBool>,
    cancelled: &Arc<AtomicBool>,
) -> Result<(), String> {
    let mut reader = fs::File::open(src)
        .map_err(|e| format!("Failed to open {}: {}", src.display(), e))?;
    let mut writer = fs::File::create(dst)
        .map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;

    let mut buf = [0u8; CHUNK_SIZE];
    loop {
        // 一時停止チェック
        while paused.load(Ordering::Relaxed) {
            if cancelled.load(Ordering::Relaxed) {
                return Err("Cancelled".to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        // キャンセルチェック
        if cancelled.load(Ordering::Relaxed) {
            return Err("Cancelled".to_string());
        }

        let n = reader.read(&mut buf)
            .map_err(|e| format!("Read error: {}", e))?;
        if n == 0 {
            break;
        }
        writer.write_all(&buf[..n])
            .map_err(|e| format!("Write error: {}", e))?;
        copied_bytes.fetch_add(n as u64, Ordering::Relaxed);
    }
    Ok(())
}

fn copy_dir_recursive_chunked(
    src: &Path,
    dst: &Path,
    copied_bytes: &Arc<AtomicU64>,
    files_done: &Arc<AtomicU64>,
    current_file: &Arc<Mutex<Option<String>>>,
    paused: &Arc<AtomicBool>,
    cancelled: &Arc<AtomicBool>,
) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir: {}", e))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read dir: {}", e))? {
        if cancelled.load(Ordering::Relaxed) {
            return Err("Cancelled".to_string());
        }
        let entry = entry.map_err(|e| format!("Entry error: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive_chunked(&src_path, &dst_path, copied_bytes, files_done, current_file, paused, cancelled)?;
        } else {
            *current_file.lock().unwrap_or_else(|e| e.into_inner()) = Some(src_path.to_string_lossy().to_string());
            copy_file_chunked(&src_path, &dst_path, copied_bytes, paused, cancelled)?;
            files_done.fetch_add(1, Ordering::Relaxed);
        }
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, state: &QueueItemState) {
    let progress = CopyProgress {
        id: state.id.clone(),
        total_bytes: state.total_bytes.load(Ordering::Relaxed),
        copied_bytes: state.copied_bytes.load(Ordering::Relaxed),
        file_count: state.file_count.load(Ordering::Relaxed) as usize,
        files_done: state.files_done.load(Ordering::Relaxed) as usize,
        status: state.status.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        error: state.error.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        current_file: state.current_file.lock().unwrap_or_else(|e| e.into_inner()).clone(),
    };
    let _ = app.emit("copy-progress", &progress);
}

#[tauri::command]
pub fn enqueue_copy(
    app: AppHandle,
    sources: Vec<String>,
    dest: String,
    operation: String,
) -> Result<String, String> {
    let queue_manager = app.state::<CopyQueueManager>();

    let id = uuid::Uuid::new_v4().to_string();

    let state = Arc::new(QueueItemState {
        id: id.clone(),
        sources: sources.clone(),
        dest: dest.clone(),
        operation: operation.clone(),
        paused: Arc::new(AtomicBool::new(false)),
        cancelled: Arc::new(AtomicBool::new(false)),
        total_bytes: Arc::new(AtomicU64::new(0)),
        copied_bytes: Arc::new(AtomicU64::new(0)),
        file_count: Arc::new(AtomicU64::new(0)),
        files_done: Arc::new(AtomicU64::new(0)),
        current_file: Arc::new(Mutex::new(None)),
        status: Arc::new(Mutex::new("calculating".to_string())),
        error: Arc::new(Mutex::new(None)),
    });

    queue_manager.items.lock().unwrap_or_else(|e| e.into_inner()).push(state.clone());

    // 即座にcalculatingステータスを通知
    emit_progress(&app, &state);

    // バックグラウンドで計算→実行
    let app_clone = app.clone();
    let state_clone = state.clone();
    std::thread::spawn(move || {
        // サイズ計算とファイル数カウント
        let total_bytes = calculate_total_bytes(&state_clone.sources);
        let mut file_count = 0u64;
        for source in &state_clone.sources {
            let p = Path::new(source);
            if p.is_dir() {
                for entry in walkdir::WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
                    if entry.path().is_file() {
                        file_count += 1;
                    }
                }
            } else {
                file_count += 1;
            }
        }
        state_clone.total_bytes.store(total_bytes, Ordering::Relaxed);
        state_clone.file_count.store(file_count, Ordering::Relaxed);

        *state_clone.status.lock().unwrap_or_else(|e| e.into_inner()) = "running".to_string();
        emit_progress(&app_clone, &state_clone);

        let mut had_error = false;
        let dest_path = Path::new(&state_clone.dest);

        for source in &state_clone.sources {
            if state_clone.cancelled.load(Ordering::Relaxed) {
                break;
            }

            let src_path = Path::new(source);
            let file_name = match src_path.file_name() {
                Some(n) => n,
                None => continue,
            };
            let target = dest_path.join(file_name);

            let result = if src_path.is_dir() {
                copy_dir_recursive_chunked(
                    src_path,
                    &target,
                    &state_clone.copied_bytes,
                    &state_clone.files_done,
                    &state_clone.current_file,
                    &state_clone.paused,
                    &state_clone.cancelled,
                )
            } else {
                *state_clone.current_file.lock().unwrap_or_else(|e| e.into_inner()) = Some(source.clone());
                let r = copy_file_chunked(
                    src_path,
                    &target,
                    &state_clone.copied_bytes,
                    &state_clone.paused,
                    &state_clone.cancelled,
                );
                if r.is_ok() {
                    state_clone.files_done.fetch_add(1, Ordering::Relaxed);
                }
                r
            };

            if let Err(e) = result {
                if e == "Cancelled" {
                    *state_clone.status.lock().unwrap_or_else(|e| e.into_inner()) = "cancelled".to_string();
                } else {
                    *state_clone.error.lock().unwrap_or_else(|e| e.into_inner()) = Some(e);
                    *state_clone.status.lock().unwrap_or_else(|e| e.into_inner()) = "error".to_string();
                    had_error = true;
                }
                emit_progress(&app_clone, &state_clone);
                break;
            }

            emit_progress(&app_clone, &state_clone);
        }

        if !had_error && !state_clone.cancelled.load(Ordering::Relaxed) {
            // Move操作: コピー完了後にソースを削除
            if state_clone.operation == "move" {
                for source in &state_clone.sources {
                    let src_path = Path::new(source);
                    if src_path.is_dir() {
                        let _ = fs::remove_dir_all(src_path);
                    } else {
                        let _ = fs::remove_file(src_path);
                    }
                }
            }
            *state_clone.status.lock().unwrap_or_else(|e| e.into_inner()) = "completed".to_string();
            emit_progress(&app_clone, &state_clone);
        }
    });

    Ok(id)
}

#[tauri::command]
pub fn pause_copy(app: AppHandle, id: String) -> Result<(), String> {
    let queue = app.state::<CopyQueueManager>();
    let items = queue.items.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(item) = items.iter().find(|i| i.id == id) {
        item.paused.store(true, Ordering::Relaxed);
        *item.status.lock().unwrap_or_else(|e| e.into_inner()) = "paused".to_string();
        emit_progress(&app, item);
        Ok(())
    } else {
        Err("Queue item not found".to_string())
    }
}

#[tauri::command]
pub fn resume_copy(app: AppHandle, id: String) -> Result<(), String> {
    let queue = app.state::<CopyQueueManager>();
    let items = queue.items.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(item) = items.iter().find(|i| i.id == id) {
        item.paused.store(false, Ordering::Relaxed);
        *item.status.lock().unwrap_or_else(|e| e.into_inner()) = "running".to_string();
        emit_progress(&app, item);
        Ok(())
    } else {
        Err("Queue item not found".to_string())
    }
}

#[tauri::command]
pub fn cancel_copy(app: AppHandle, id: String) -> Result<(), String> {
    let queue = app.state::<CopyQueueManager>();
    let items = queue.items.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(item) = items.iter().find(|i| i.id == id) {
        item.cancelled.store(true, Ordering::Relaxed);
        *item.status.lock().unwrap_or_else(|e| e.into_inner()) = "cancelled".to_string();
        emit_progress(&app, item);
        Ok(())
    } else {
        Err("Queue item not found".to_string())
    }
}

#[tauri::command]
pub fn get_copy_queue(app: AppHandle) -> Vec<CopyQueueItem> {
    let queue = app.state::<CopyQueueManager>();
    let items = queue.items.lock().unwrap_or_else(|e| e.into_inner());
    items
        .iter()
        .map(|item| CopyQueueItem {
            id: item.id.clone(),
            sources: item.sources.clone(),
            dest: item.dest.clone(),
            operation: item.operation.clone(),
            total_bytes: item.total_bytes.load(Ordering::Relaxed),
            copied_bytes: item.copied_bytes.load(Ordering::Relaxed),
            file_count: item.file_count.load(Ordering::Relaxed) as usize,
            files_done: item.files_done.load(Ordering::Relaxed) as usize,
            status: item.status.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            error: item.error.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            current_file: item.current_file.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        })
        .collect()
}

#[tauri::command]
pub fn clear_completed_copies(app: AppHandle) {
    let queue = app.state::<CopyQueueManager>();
    let mut items = queue.items.lock().unwrap_or_else(|e| e.into_inner());
    items.retain(|item| {
        let status = item.status.lock().unwrap_or_else(|e| e.into_inner()).clone();
        status != "completed" && status != "cancelled" && status != "error"
    });
}
