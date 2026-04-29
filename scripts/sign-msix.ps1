#requires -Version 5.1
<#
.SYNOPSIS
    create-signing-cert.ps1 で生成した .pfx を使って MSIX パッケージに署名する。

.DESCRIPTION
    Windows SDK の signtool.exe を使って .msix / .msixbundle / .appx ファイルに
    SHA256 で署名する。署名後の MSIX は Microsoft Store にアップロードできる。

    詳細手順は docs/microsoft-store-signing.md を参照。

.PARAMETER MsixPath
    署名する .msix / .msixbundle / .appx ファイルのパス。

.PARAMETER PfxPath
    create-signing-cert.ps1 で生成した .pfx ファイルのパス。

.PARAMETER TimestampUrl
    タイムスタンプサーバの URL。
    デフォルト: http://timestamp.digicert.com

.EXAMPLE
    .\scripts\sign-msix.ps1 `
        -MsixPath ".\TomaFiler.msix" `
        -PfxPath "$HOME\Downloads\code_sign_certificate.pfx"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MsixPath,

    [Parameter(Mandatory = $true)]
    [string]$PfxPath,

    [Parameter(Mandatory = $false)]
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = 'Stop'

Write-Host "=== TomaFiler MSIX 署名スクリプト ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $MsixPath)) {
    Write-Error "MSIX ファイルが見つかりません: $MsixPath"
    exit 1
}
if (-not (Test-Path $PfxPath)) {
    Write-Error ".pfx ファイルが見つかりません: $PfxPath"
    exit 1
}

# signtool.exe を Windows SDK から探す
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
    $candidates = @(
        "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe",
        "C:\Program Files\Windows Kits\10\bin\*\x64\signtool.exe"
    )
    foreach ($pattern in $candidates) {
        $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) {
            $signtool = $found
            break
        }
    }
}

if (-not $signtool) {
    Write-Error "signtool.exe が見つかりません。Windows SDK をインストールしてください。"
    exit 1
}

$signtoolPath = if ($signtool -is [System.Management.Automation.CommandInfo]) {
    $signtool.Source
} else {
    $signtool.FullName
}

Write-Host "signtool : $signtoolPath" -ForegroundColor DarkGray
Write-Host "msix     : $MsixPath" -ForegroundColor DarkGray
Write-Host "pfx      : $PfxPath" -ForegroundColor DarkGray
Write-Host "tsa      : $TimestampUrl" -ForegroundColor DarkGray
Write-Host ""

$password = Read-Host -AsSecureString ".pfx のパスワードを入力"
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
    $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

Write-Host "署名実行中..." -ForegroundColor Green
& $signtoolPath sign `
    /fd SHA256 `
    /a `
    /f $PfxPath `
    /p $plainPassword `
    /tr $TimestampUrl `
    /td SHA256 `
    $MsixPath

# パスワードをメモリから消去
$plainPassword = $null
[System.GC]::Collect()

if ($LASTEXITCODE -ne 0) {
    Write-Error "署名に失敗しました (exit code: $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "署名完了: $MsixPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "署名内容を確認するには:" -ForegroundColor Yellow
Write-Host "  & '$signtoolPath' verify /pa /v `"$MsixPath`""
