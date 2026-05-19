use base64::Engine;
use serde::Serialize;

/// 実行後の cwd を stdout に出力する際のマーカー。
/// フロントエンドはこの行を検出して cwd を更新し、表示からは除去する。
pub const CWD_MARKER: &str = "__FILER_CWD__:";

#[derive(Debug, Serialize)]
pub struct TerminalCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    /// マーカー経由で取得した実行後の作業ディレクトリ
    pub final_cwd: Option<String>,
}

/// サポートするシェル種別
#[derive(Debug, Clone, Copy)]
enum Shell {
    PowerShell,
    Cmd,
}

impl Shell {
    fn parse(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "cmd" => Shell::Cmd,
            _ => Shell::PowerShell,
        }
    }
}

/// 簡易ターミナル: PowerShell でコマンドを単発実行する
///
/// - cwd を current_dir として実行
/// - 出力は UTF-8 として取得（EncodedCommand 経由で文字化け回避）
/// - GUI から呼ぶためコンソールウィンドウは隠す
/// - 重い処理になり得るため spawn_blocking でバックグラウンド化
#[tauri::command]
pub async fn run_terminal_command(
    cwd: String,
    command: String,
    shell: Option<String>,
) -> Result<TerminalCommandResult, String> {
    if command.trim().is_empty() {
        return Err("command is empty".into());
    }

    let cwd_path = std::path::PathBuf::from(&cwd);
    if !cwd_path.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }
    if !cwd_path.is_dir() {
        return Err(format!("Not a directory: {}", cwd));
    }

    let shell_kind = shell
        .as_deref()
        .map(Shell::parse)
        .unwrap_or(Shell::PowerShell);

    let cwd_for_thread = cwd.clone();
    let command_for_thread = command.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<TerminalCommandResult, String> {
        run_command_blocking(&cwd_for_thread, &command_for_thread, shell_kind)
    })
    .await
    .map_err(|e| format!("Join error: {}", e))?
}

#[cfg(windows)]
fn run_command_blocking(
    cwd: &str,
    command: &str,
    shell: Shell,
) -> Result<TerminalCommandResult, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // GUIアプリから子プロセスを起動するときコンソール窓を出さない
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let output = match shell {
        Shell::PowerShell => {
            // PowerShell の出力エンコーディングを UTF-8 に固定したラッパースクリプトを組み立て、
            // 引用符の問題を避けるため -EncodedCommand (Base64 UTF-16LE) で渡す。
            // try/finally で、ユーザーコマンドが terminating error を出してもマーカーは必ず出る。
            let wrapper = format!(
                "$ErrorActionPreference = 'Continue'; \
                 [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); \
                 [Console]::InputEncoding  = [System.Text.UTF8Encoding]::new(); \
                 $OutputEncoding           = [System.Text.UTF8Encoding]::new(); \
                 try {{ {user} }} finally {{ Write-Output \"{marker}$((Get-Location).Path)\" }}",
                user = command,
                marker = CWD_MARKER,
            );
            let utf16: Vec<u8> = wrapper
                .encode_utf16()
                .flat_map(|c| c.to_le_bytes())
                .collect();
            let encoded = base64::engine::general_purpose::STANDARD.encode(&utf16);

            Command::new("powershell")
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    // 出力を CLIXML でラップしないようテキスト形式に固定する
                    "-OutputFormat",
                    "Text",
                    "-EncodedCommand",
                    &encoded,
                ])
                .current_dir(cwd)
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("Failed to run powershell: {}", e))?
        }
        Shell::Cmd => {
            // cmd では `&` で前のコマンドの成否に関わらず次が実行されるため、
            // 末尾の cwd マーカーは必ず出力される。
            // chcp 65001 で active code page を UTF-8 に切り替え、子プロセスにも UTF-8 を促す。
            // /U は子プロセスの出力エンコーディングを制御できず、cmd 内部出力との混在で
            // 化けるので使わない（chcp 65001 + UTF-8 読み取りに統一）。
            let wrapper = format!(
                "chcp 65001 >nul & {user} & echo {marker}%CD%",
                user = command,
                marker = CWD_MARKER,
            );

            Command::new("cmd")
                .args(["/D", "/C", &wrapper])
                .current_dir(cwd)
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("Failed to run cmd: {}", e))?
        }
    };

    // PowerShell / cmd ともに UTF-8 ベースで読む（PowerShell はラッパで強制、cmd は chcp 65001）
    let raw_stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let raw_stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let (stdout, final_cwd) = strip_cwd_marker(&raw_stdout);

    Ok(TerminalCommandResult {
        stdout,
        stderr: raw_stderr,
        exit_code: output.status.code(),
        final_cwd,
    })
}

#[cfg(not(windows))]
fn run_command_blocking(
    cwd: &str,
    command: &str,
    _shell: Shell,
) -> Result<TerminalCommandResult, String> {
    use std::process::Command;

    // POSIX シェルでも同様にマーカーを末尾に出す
    let wrapper = format!(
        "{{ {user} }}; __status=$?; printf '%s%s\\n' \"{marker}\" \"$(pwd)\"; exit $__status",
        user = command,
        marker = CWD_MARKER,
    );

    let output = Command::new("sh")
        .args(["-c", &wrapper])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run shell: {}", e))?;

    let raw_stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let (stdout, final_cwd) = strip_cwd_marker(&raw_stdout);

    Ok(TerminalCommandResult {
        stdout,
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code(),
        final_cwd,
    })
}

/// stdout の末尾にあるはずの `__FILER_CWD__:<path>` 行を取り出し、
/// 戻り値の stdout からは除去する。マーカーが見つからない場合は元の文字列をそのまま返す。
fn strip_cwd_marker(stdout: &str) -> (String, Option<String>) {
    let mut lines: Vec<&str> = stdout.lines().collect();
    // 末尾行から逆順に走査（複数行のコマンドでも最後のマーカーを拾えるように）
    for idx in (0..lines.len()).rev() {
        if let Some(path) = lines[idx].strip_prefix(CWD_MARKER) {
            let path = path.trim_end_matches(['\r', '\n']).to_string();
            lines.remove(idx);
            return (lines.join("\n"), Some(path));
        }
    }
    (stdout.to_string(), None)
}
