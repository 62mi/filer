#requires -Version 5.1
<#
.SYNOPSIS
    Microsoft Store 配布用の自己署名コード署名証明書 (.pfx) を作成する。

.DESCRIPTION
    Microsoft パートナーセンターに登録した製品の Publisher (CN=...) を使って
    自己署名証明書を作成し、.pfx ファイルとして出力する。
    出力された .pfx を使って MSIX パッケージに署名すれば、
    Microsoft Store 経由で無料で署名・配布できる。

    詳細手順は docs/microsoft-store-signing.md を参照。

.PARAMETER Cn
    パートナーセンター > 製品 > 製品 ID > Package/Identity/Publisher の
    "CN=" 以降の文字列 (例: E1234567-1234-1234-1234-1234567890)。

.PARAMETER OutputPath
    出力する .pfx ファイルのパス。
    デフォルト: $HOME\Downloads\code_sign_certificate.pfx

.EXAMPLE
    .\scripts\create-signing-cert.ps1 -Cn "E1234567-1234-1234-1234-1234567890"

.EXAMPLE
    .\scripts\create-signing-cert.ps1 `
        -Cn "E1234567-1234-1234-1234-1234567890" `
        -OutputPath "C:\certs\tomafiler.pfx"

.NOTES
    生成された .pfx は機密情報なので git に絶対にコミットしないこと。
    .gitignore で *.pfx は除外済み。
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Cn,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = (Join-Path $HOME "Downloads\code_sign_certificate.pfx")
)

$ErrorActionPreference = 'Stop'

Write-Host "=== TomaFiler コード署名証明書ジェネレータ ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Subject : CN=$Cn"
Write-Host "Output  : $OutputPath"
Write-Host ""

# 出力先ディレクトリの存在確認
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
    Write-Host "出力ディレクトリを作成します: $outputDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# 既存ファイルへの上書き確認
if (Test-Path $OutputPath) {
    $answer = Read-Host "既に $OutputPath が存在します。上書きしますか? (y/N)"
    if ($answer -ne 'y' -and $answer -ne 'Y') {
        Write-Host "中断しました。" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[1/3] 自己署名証明書を作成中..." -ForegroundColor Green
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=$Cn" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256

Write-Host "    Thumbprint: $($cert.Thumbprint)" -ForegroundColor DarkGray

Write-Host "[2/3] .pfx 用のパスワードを入力してください (画面には表示されません)" -ForegroundColor Green
$password = Read-Host -AsSecureString "Password"

if ($password.Length -eq 0) {
    Write-Error "パスワードが空です。中断します。"
    exit 1
}

Write-Host "[3/3] .pfx ファイルとしてエクスポート中..." -ForegroundColor Green
Export-PfxCertificate -Cert $cert -FilePath $OutputPath -Password $password | Out-Null

Write-Host ""
Write-Host "完了しました。" -ForegroundColor Cyan
Write-Host "  出力: $OutputPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "注意:" -ForegroundColor Yellow
Write-Host "  - .pfx は機密情報です。git にコミットしないでください。"
Write-Host "  - パスワードは安全な場所 (パスワードマネージャ等) に保管してください。"
Write-Host "  - MSIX パッケージへの署名は scripts/sign-msix.ps1 を使ってください。"
