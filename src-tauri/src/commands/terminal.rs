use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

/// 1セッションぶんの PTY ハンドル一式。
/// master は resize のために保持し、writer は stdin への書き込みに使う。
/// child は kill のために保持する。
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Serialize, Clone)]
struct PtyDataPayload {
    session_id: String,
    /// PTY 出力を base64 で送る（バイト列を安全に JSON に乗せるため）
    data: String,
}

#[derive(Debug, Serialize, Clone)]
struct PtyExitPayload {
    session_id: String,
    exit_code: Option<u32>,
}

/// PTY セッションを開いてシェルを起動する。
/// 戻り値は session_id（フロントが以降の操作で参照）。
#[tauri::command]
pub async fn pty_open(
    state: State<'_, PtyManager>,
    app: AppHandle,
    cwd: String,
    shell: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let cwd_path = std::path::PathBuf::from(&cwd);
    if !cwd_path.exists() || !cwd_path.is_dir() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {}", e))?;

    // シェル選択（cmd / powershell / pwsh）
    let mut cmd = match shell.as_str() {
        "cmd" => CommandBuilder::new("cmd.exe"),
        "pwsh" => CommandBuilder::new("pwsh.exe"),
        _ => CommandBuilder::new("powershell.exe"),
    };
    cmd.cwd(&cwd);
    // ConPTY 経由でも環境変数 TERM がないと一部ツールが色を切る場合があるので入れる
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {}", e))?;

    // slave 側ハンドルは spawn 後に閉じる（子プロセスが EOF を検知できるように）
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer failed: {}", e))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader failed: {}", e))?;

    let session_id = Uuid::new_v4().to_string();

    // PTY 出力を読んでフロントにストリーミングする専用スレッド
    {
        use base64::Engine;
        let app = app.clone();
        let sid = session_id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF: 子プロセス終了
                    Ok(n) => {
                        let encoded = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        let _ = app.emit(
                            "pty-data",
                            PtyDataPayload {
                                session_id: sid.clone(),
                                data: encoded,
                            },
                        );
                    }
                    Err(_) => break, // PTY が閉じられた
                }
            }
            // 終了通知
            let exit_code = app
                .state::<PtyManager>()
                .sessions
                .lock()
                .ok()
                .and_then(|mut map| map.remove(&sid))
                .and_then(|mut s| s.child.wait().ok())
                .map(|status| status.exit_code());
            let _ = app.emit(
                "pty-exit",
                PtyExitPayload {
                    session_id: sid,
                    exit_code,
                },
            );
        });
    }

    let session = PtySession {
        master: pair.master,
        writer,
        child,
    };
    state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(session_id.clone(), session);

    Ok(session_id)
}

/// フロントからのキー入力を PTY に流す。
#[tauri::command]
pub async fn pty_write(
    state: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut map = state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let session = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {}", session_id))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("flush failed: {}", e))?;
    Ok(())
}

/// xterm のリサイズに追従して PTY サイズを変更する。
#[tauri::command]
pub async fn pty_resize(
    state: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let session = map
        .get(&session_id)
        .ok_or_else(|| format!("session not found: {}", session_id))?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {}", e))?;
    Ok(())
}

/// セッションを閉じる（子プロセスを kill して PTY を破棄）。
#[tauri::command]
pub async fn pty_close(
    state: State<'_, PtyManager>,
    session_id: String,
) -> Result<(), String> {
    let mut map = state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(mut session) = map.remove(&session_id) {
        // kill は best-effort（既に死んでいる場合もエラーにしない）
        let _ = session.child.kill();
        let _ = session.child.wait();
        // master を drop すると PTY が閉じられ、リーダースレッドも EOF で抜ける
        drop(session.master);
        drop(session.writer);
    }
    Ok(())
}
