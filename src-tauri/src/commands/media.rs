use base64::{engine::general_purpose::STANDARD, Engine};
use std::process::Command;

/// FFmpegで動画の先頭フレームをPNGサムネイルとして抽出し、data URIで返す
#[tauri::command]
pub async fn extract_video_thumbnail(path: String, size: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("ffmpeg")
            .args([
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
            ])
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

/// システムPATH上にFFmpegがインストールされているか確認
#[tauri::command]
pub fn check_ffmpeg_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
