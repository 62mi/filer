<#
.SYNOPSIS
  TomaFiler のアクティブウィンドウを Microsoft Store 用スクリーンショットとしてキャプチャする。
.PARAMETER Name
  ファイル名サフィックス (例: 01-main, 02-ai-organize)
.EXAMPLE
  pwsh ./scripts/capture-tomafiler.ps1 -Name 01-main
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Name,
    [string]$OutDir = "C:\Users\mezzo\Pictures\Screenshots",
    [int]$ResizeWidth  = 1920,
    [int]$ResizeHeight = 1080,
    [switch]$NoResize
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool r);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@

# TomaFiler ウィンドウを探す
$proc = Get-Process | Where-Object {
    $_.MainWindowTitle -match 'TomaFiler' -or $_.ProcessName -eq 'filer'
} | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if (-not $proc) {
    throw 'TomaFiler ウィンドウが見つかりません。アプリが起動しているか確認してください。'
}

$hwnd = $proc.MainWindowHandle
[W]::ShowWindow($hwnd, 9) | Out-Null  # SW_RESTORE
[W]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 400

# モニター解像度に収まる範囲で目標サイズにリサイズ
if (-not $NoResize) {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $tw = [Math]::Min($ResizeWidth,  $screen.Width)
    $th = [Math]::Min($ResizeHeight, $screen.Height)
    $x = [Math]::Max(0, ($screen.Width  - $tw) / 2)
    $y = [Math]::Max(0, ($screen.Height - $th) / 2)
    [void][W]::MoveWindow($hwnd, [int]$x, [int]$y, [int]$tw, [int]$th, $true)
    Start-Sleep -Milliseconds 500
}

$rect = New-Object 'W+RECT'
[void][W]::GetWindowRect($hwnd, [ref]$rect)
$width  = $rect.R - $rect.L
$height = $rect.B - $rect.T

if ($width -lt 1366 -or $height -lt 768) {
    Write-Warning "ウィンドウサイズが ${width}x${height} です。Microsoft Store 推奨は 1366x768 以上。"
}

$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.L, $rect.T, 0, 0, $bmp.Size)

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$ts = (Get-Date).ToString('yyyyMMdd-HHmmss')
$out = Join-Path $OutDir "tomafiler-store-$Name-$ts.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $bmp.Dispose()

Write-Host "[OK] $out  (${width} x ${height})" -ForegroundColor Green
