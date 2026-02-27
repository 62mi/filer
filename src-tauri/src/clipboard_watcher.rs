//! クリップボード監視 — WM_CLIPBOARDUPDATE で OS クリップボードの変更を検知し、
//! Tauri イベント "clipboard-changed" としてフロントエンドへ通知する。

#[cfg(windows)]
mod inner {
    use crate::commands::clipboard::read_clipboard_files_sync;
    use serde::Serialize;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::sync::Arc;
    use std::thread::JoinHandle;
    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::DataExchange::{
        AddClipboardFormatListener, RemoveClipboardFormatListener,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    const WM_CLIPBOARDUPDATE: u32 = 0x031D;

    #[derive(Clone, Serialize)]
    struct ClipboardChangedPayload {
        paths: Vec<String>,
        operation: String,
    }

    /// クリップボード監視ハンドル。Drop 時に安全にスレッドを停止する。
    pub struct ClipboardWatcher {
        hwnd: Arc<AtomicIsize>,
        thread: Option<JoinHandle<()>>,
    }

    impl ClipboardWatcher {
        pub fn start(app_handle: AppHandle) -> Self {
            let hwnd = Arc::new(AtomicIsize::new(0));
            let hwnd_clone = hwnd.clone();

            let thread = std::thread::spawn(move || {
                unsafe {
                    run_message_loop(app_handle, hwnd_clone);
                }
            });

            ClipboardWatcher {
                hwnd,
                thread: Some(thread),
            }
        }
    }

    impl Drop for ClipboardWatcher {
        fn drop(&mut self) {
            let h = self.hwnd.load(Ordering::SeqCst);
            if h != 0 {
                unsafe {
                    PostMessageW(h as HWND, WM_CLOSE, 0, 0);
                }
            }
            if let Some(t) = self.thread.take() {
                t.join().ok();
            }
        }
    }

    /// ウィンドウプロシージャ
    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_CLIPBOARDUPDATE => {
                // GWLP_USERDATA から AppHandle を取得
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
                if ptr != 0 {
                    let app_handle = &*(ptr as *const AppHandle);
                    let payload = match read_clipboard_files_sync() {
                        Ok(Some((paths, operation))) => ClipboardChangedPayload { paths, operation },
                        _ => ClipboardChangedPayload {
                            paths: vec![],
                            operation: "none".to_string(),
                        },
                    };
                    app_handle.emit("clipboard-changed", payload).ok();
                }
                0
            }
            WM_CLOSE => {
                // AppHandle を解放
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
                if ptr != 0 {
                    SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                    drop(Box::from_raw(ptr as *mut AppHandle));
                }
                RemoveClipboardFormatListener(hwnd);
                DestroyWindow(hwnd);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    /// 隠しメッセージウィンドウを作成してメッセージポンプを回す
    unsafe fn run_message_loop(app_handle: AppHandle, hwnd_out: Arc<AtomicIsize>) {
        let class_name: Vec<u16> = "FilerClipboardWatcher\0".encode_utf16().collect();

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: 0,
            lpfnWndProc: Some(wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: 0 as _,
            hIcon: 0 as _,
            hCursor: 0 as _,
            hbrBackground: 0 as _,
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
            hIconSm: 0 as _,
        };

        if RegisterClassExW(&wc) == 0 {
            eprintln!("ClipboardWatcher: RegisterClassExW failed");
            return;
        }

        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            0 as _,
            0 as _,
            std::ptr::null(),
        );

        if hwnd.is_null() {
            eprintln!("ClipboardWatcher: CreateWindowExW failed");
            return;
        }

        // AppHandle を GWLP_USERDATA に格納
        let boxed = Box::new(app_handle);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(boxed) as isize);

        // クリップボード監視を登録
        AddClipboardFormatListener(hwnd);

        // hwnd を外部から参照可能にする（Drop での WM_CLOSE 送信用）
        hwnd_out.store(hwnd as isize, Ordering::SeqCst);

        // メッセージポンプ
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, 0 as _, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

#[cfg(windows)]
pub use inner::ClipboardWatcher;

// 非Windowsプラットフォーム用のスタブ
#[cfg(not(windows))]
pub struct ClipboardWatcher;

#[cfg(not(windows))]
impl ClipboardWatcher {
    pub fn start(_app_handle: tauri::AppHandle) -> Self {
        ClipboardWatcher
    }
}
