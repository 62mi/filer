use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// コンソールウィンドウを表示しない
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// FFmpegのパスを検出してキャッシュ
static FFMPEG_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

fn find_ffmpeg() -> Option<PathBuf> {
    // 1. PATH上のffmpeg
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-version");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    if cmd
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some(PathBuf::from("ffmpeg"));
    }

    // 2. よくあるインストール先を探索
    let candidates = [
        r"C:\ffmpeg\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
    ];

    for path in &candidates {
        let p = PathBuf::from(path);
        let mut cmd = Command::new(&p);
        cmd.arg("-version");
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        if p.exists()
            && cmd
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        {
            return Some(p);
        }
    }

    // 3. WinGetパッケージ内を検索
    if let Some(local_app) = std::env::var_os("LOCALAPPDATA") {
        let winget_dir = PathBuf::from(local_app).join(r"Microsoft\WinGet\Packages");
        if winget_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&winget_dir) {
                for entry in entries.flatten() {
                    if entry
                        .file_name()
                        .to_string_lossy()
                        .contains("FFmpeg")
                    {
                        // パッケージ内のbin/ffmpeg.exeを探す
                        let pkg_dir = entry.path();
                        if let Some(ffmpeg) = find_ffmpeg_in_dir(&pkg_dir) {
                            return Some(ffmpeg);
                        }
                    }
                }
            }
        }
    }

    None
}

/// ディレクトリ内からffmpeg.exeを再帰的に探す（深さ3まで）
fn find_ffmpeg_in_dir(dir: &std::path::Path) -> Option<PathBuf> {
    find_ffmpeg_recursive(dir, 0)
}

fn find_ffmpeg_recursive(dir: &std::path::Path, depth: u32) -> Option<PathBuf> {
    if depth > 3 {
        return None;
    }
    let candidate = dir.join("ffmpeg.exe");
    if candidate.exists() {
        return Some(candidate);
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if let Some(found) = find_ffmpeg_recursive(&entry.path(), depth + 1) {
                    return Some(found);
                }
            }
        }
    }
    None
}

fn get_ffmpeg() -> Option<&'static PathBuf> {
    FFMPEG_PATH.get_or_init(find_ffmpeg).as_ref()
}

/// FFmpegで動画の先頭フレームをPNGサムネイルとして抽出し、data URIで返す
#[tauri::command]
pub async fn extract_video_thumbnail(path: String, size: u32) -> Result<String, String> {
    let ffmpeg = get_ffmpeg().ok_or("FFmpegが見つかりません")?;
    let ffmpeg = ffmpeg.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&ffmpeg);
        cmd.args([
            "-i",
            &path,
            "-vframes",
            "1",
            "-vf",
            &format!("scale={}:-1", size),
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "pipe:1",
        ]);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd
            .output()
            .map_err(|e| format!("FFmpeg実行エラー: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("FFmpegエラー: {}", stderr));
        }

        let b64 = STANDARD.encode(&output.stdout);
        Ok(format!("data:image/png;base64,{}", b64))
    })
    .await
    .map_err(|e| format!("タスクエラー: {}", e))?
}

/// FFmpegが利用可能か確認
#[tauri::command]
pub fn check_ffmpeg_available() -> bool {
    get_ffmpeg().is_some()
}
