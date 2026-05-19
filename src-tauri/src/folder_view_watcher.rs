/// フォルダビューのリアルタイム更新用ウォッチャー
///
/// 各タブが表示しているフォルダを監視し、ファイルの追加・削除・リネームが
/// 発生したら `folder-changed` イベントをフロントエンドに送信する。
/// 既存の WatcherManager（ルール自動実行用）とは独立した別のウォッチャー。
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// `folder-changed` イベントのペイロード
#[derive(Debug, Clone, Serialize)]
pub struct FolderChangedPayload {
    /// 変更があったフォルダのパス
    pub folder_path: String,
}

/// タブごとのウォッチャーエントリ
struct WatchEntry {
    /// notify のウォッチャー（Dropされると監視解除）
    _watcher: RecommendedWatcher,
    /// 最後にイベントを発行した時刻（デバウンス用）
    last_emit: Arc<Mutex<Instant>>,
}

pub struct FolderViewWatcher {
    app_handle: AppHandle,
    /// フォルダパス → ウォッチエントリ
    entries: Mutex<HashMap<String, WatchEntry>>,
}

impl FolderViewWatcher {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// 指定フォルダの監視を開始する（既に監視中なら何もしない）
    pub fn watch(&self, folder_path: &str) -> Result<(), String> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        // 既に監視中なら何もしない
        if entries.contains_key(folder_path) {
            return Ok(());
        }

        let path = PathBuf::from(folder_path);
        if !path.is_dir() {
            return Err(format!("Not a directory: {}", folder_path));
        }

        let handle = self.app_handle.clone();
        let folder = folder_path.to_string();

        // デバウンス用: 最後のemit時刻
        let last_emit: Arc<Mutex<Instant>> =
            Arc::new(Mutex::new(Instant::now() - Duration::from_secs(10)));
        let last_emit_ref = last_emit.clone();

        let debounce_duration = Duration::from_millis(300);

        let mut watcher =
            notify::recommended_watcher(move |res: Result<notify::Event, _>| {
                let event = match res {
                    Ok(e) => e,
                    Err(err) => {
                        eprintln!("[FolderViewWatcher] watch error: {}", err);
                        return;
                    }
                };

                // 対象イベント: 作成・削除・リネーム・変更（メタデータのみは除外）
                let is_relevant = matches!(
                    event.kind,
                    EventKind::Create(_)
                        | EventKind::Remove(_)
                        | EventKind::Modify(notify::event::ModifyKind::Name(_))
                        | EventKind::Modify(notify::event::ModifyKind::Data(_))
                );
                if !is_relevant {
                    return;
                }

                // デバウンス: 300ms 以内の連続イベントはスキップ
                {
                    let mut last = last_emit_ref
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    let now = Instant::now();
                    if now.duration_since(*last) < debounce_duration {
                        return;
                    }
                    *last = now;
                }

                // フロントエンドへ通知
                handle
                    .emit(
                        "folder-changed",
                        FolderChangedPayload {
                            folder_path: folder.clone(),
                        },
                    )
                    .ok();
            })
            .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(&path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        entries.insert(
            folder_path.to_string(),
            WatchEntry {
                _watcher: watcher,
                last_emit,
            },
        );

        Ok(())
    }

    /// 指定フォルダの監視を解除する
    pub fn unwatch(&self, folder_path: &str) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        // Drop で notify の unwatch が自動実行される
        entries.remove(folder_path);
    }

    /// 現在監視中のフォルダ一覧を返す（デバッグ用）
    #[allow(dead_code)]
    pub fn watched_folders(&self) -> Vec<String> {
        let entries = self
            .entries
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        entries.keys().cloned().collect()
    }
}

// ── Tauri コマンド ──

/// 指定フォルダの監視を開始する
#[tauri::command]
pub fn watch_folder(
    folder_path: String,
    state: tauri::State<FolderViewWatcher>,
) -> Result<(), String> {
    // home: やスマートフォルダなど仮想パスは無視
    if folder_path.starts_with("home:")
        || folder_path.starts_with("smart-folder:")
        || folder_path.is_empty()
    {
        return Ok(());
    }
    state.watch(&folder_path)
}

/// 指定フォルダの監視を解除する
#[tauri::command]
pub fn unwatch_folder(folder_path: String, state: tauri::State<FolderViewWatcher>) {
    state.unwatch(&folder_path);
}
