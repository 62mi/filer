<#
.SYNOPSIS
  TomaFiler を Microsoft Store 用 MSIX パッケージにビルドする。

.DESCRIPTION
  pnpm tauri build → ステージング → AppxManifest テンプレート展開 → MakeAppx pack
  → (任意) SignTool sign の流れで src-tauri/target/msix/ に .msix を生成する。

  Identity 値は Partner Center でアプリ予約後に Package identity 画面に表示される
  Name / Publisher / PublisherDisplayName をそのまま渡す（環境変数 or パラメータ）。

.PARAMETER SkipBuild
  pnpm tauri build をスキップ（既ビルド成果物を再パッケージするとき）

.PARAMETER IdentityName
  Package/Identity/Name (例: 62mi.TomaFiler)。未指定時は環境変数 MSIX_IDENTITY_NAME。

.PARAMETER Publisher
  Package/Identity/Publisher の CN (例: "CN=12345678-1234-...")。Partner Center が指定する CN。

.PARAMETER PublisherDisplay
  PublisherDisplayName (例: Tomako)。

.PARAMETER SigningPfx
  コード署名用 PFX ファイルパス。未指定時は無署名（Store提出はストア側が再署名するためOK）。

.PARAMETER SelfSign
  デフォルト発行元で自己署名証明書を作って署名する（ローカル動作確認用）。

.EXAMPLE
  # ローカル動作確認用（自己署名）
  pwsh ./scripts/build-msix.ps1 -SelfSign

.EXAMPLE
  # CI 用（Identity値を環境変数で指定、ストア提出向けに無署名で出力）
  $env:MSIX_IDENTITY_NAME    = "62mi.TomaFiler"
  $env:MSIX_IDENTITY_PUBLISHER = "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
  $env:MSIX_PUBLISHER_DISPLAY  = "Tomako"
  pwsh ./scripts/build-msix.ps1
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [string]$Architecture = "x64",
    [string]$IdentityName     = $env:MSIX_IDENTITY_NAME,
    [string]$Publisher        = $env:MSIX_IDENTITY_PUBLISHER,
    [string]$PublisherDisplay = $env:MSIX_PUBLISHER_DISPLAY,
    [string]$SigningPfx       = $env:MSIX_SIGNING_PFX,
    [string]$SigningPassword  = $env:MSIX_SIGNING_PASSWORD,
    [switch]$SelfSign
)

$ErrorActionPreference = "Stop"

# ──────────────────────────────────────────────────
# プロジェクトルートに移動
# ──────────────────────────────────────────────────
$ProjectRoot = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $ProjectRoot
Write-Host "Project root: $ProjectRoot"

# ──────────────────────────────────────────────────
# 1. プレースホルダ既定値（テストビルド用フォールバック）
# ──────────────────────────────────────────────────
if (-not $IdentityName)     { $IdentityName     = "Tomako.TomaFiler.Dev" }
if (-not $Publisher)        { $Publisher        = "CN=Tomako" }
if (-not $PublisherDisplay) { $PublisherDisplay = "Tomako" }

# ──────────────────────────────────────────────────
# 2. tauri.conf.json から version を取得して 4桁化
# ──────────────────────────────────────────────────
$tauriConfPath = Join-Path $ProjectRoot "src-tauri/tauri.conf.json"
$tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
$semver = $tauriConf.version
$parts = @($semver.Split('.'))
while ($parts.Count -lt 4) { $parts += "0" }
$msixVersion = $parts -join '.'

Write-Host ""
Write-Host "── MSIX build configuration ──"
Write-Host "  Identity Name      : $IdentityName"
Write-Host "  Publisher          : $Publisher"
Write-Host "  Publisher Display  : $PublisherDisplay"
Write-Host "  SemVer             : $semver"
Write-Host "  MSIX Version (x4)  : $msixVersion"
Write-Host "  Architecture       : $Architecture"
Write-Host ""

# ──────────────────────────────────────────────────
# 3. Tauri ビルド
# ──────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Host "Running pnpm tauri build..."
    pnpm tauri build
    if ($LASTEXITCODE -ne 0) { throw "pnpm tauri build failed (exit $LASTEXITCODE)" }
}

# ──────────────────────────────────────────────────
# 4. ステージングディレクトリ準備
# ──────────────────────────────────────────────────
$outputDir = Join-Path $ProjectRoot "src-tauri/target/msix"
$staging   = Join-Path $outputDir "staging"
$msixOut   = Join-Path $outputDir ("TomaFiler_${semver}_${Architecture}.msix")

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path "$staging/images" | Out-Null

# ──────────────────────────────────────────────────
# 5. ビルド成果物を staging にコピー
# ──────────────────────────────────────────────────
$releaseDir = Join-Path $ProjectRoot "src-tauri/target/release"
if (-not (Test-Path $releaseDir)) {
    throw "Release directory not found: $releaseDir (--SkipBuild を外すか先に pnpm tauri build を実行してください)"
}

# main exe を見つけて TomaFiler.exe としてコピー
$exeFile = Get-ChildItem $releaseDir -Filter "*.exe" |
    Where-Object { $_.Name -notmatch '^(build|deps)' } |
    Select-Object -First 1
if (-not $exeFile) {
    throw "Release exe not found in $releaseDir"
}
Write-Host "Found exe: $($exeFile.Name)"
Copy-Item $exeFile.FullName (Join-Path $staging "TomaFiler.exe")

# 同梱が必要な DLL (WebView2Loader 等が release/ 直下に出る場合)
Get-ChildItem $releaseDir -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName $staging
    Write-Host "  + $($_.Name)"
}

# アイコン
$icons = @(
    "Square44x44Logo.png",
    "Square150x150Logo.png",
    "StoreLogo.png"
)
foreach ($icon in $icons) {
    $src = Join-Path $ProjectRoot "src-tauri/icons/$icon"
    if (-not (Test-Path $src)) { throw "Icon not found: $src" }
    Copy-Item $src (Join-Path $staging "images/$icon")
}

# ──────────────────────────────────────────────────
# 6. AppxManifest テンプレート展開
# ──────────────────────────────────────────────────
$tmplPath = Join-Path $ProjectRoot "src-tauri/msix/AppxManifest.xml.template"
$manifest = Get-Content $tmplPath -Raw
$manifest = $manifest.Replace('__MSIX_IDENTITY_NAME__',     $IdentityName)
$manifest = $manifest.Replace('__MSIX_IDENTITY_PUBLISHER__', $Publisher)
$manifest = $manifest.Replace('__MSIX_VERSION__',           $msixVersion)
$manifest = $manifest.Replace('__MSIX_PUBLISHER_DISPLAY__', $PublisherDisplay)

# BOM なし UTF-8 で書き出し（MakeAppx は BOM を許容するが念のため）
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $staging "AppxManifest.xml"), $manifest, $utf8NoBom)

# ──────────────────────────────────────────────────
# 7. Windows SDK ツールを探す (MakeAppx / SignTool)
# ──────────────────────────────────────────────────
function Find-WindowsSdkTool {
    param([Parameter(Mandatory)][string]$ToolName)
    $candidates = @()
    $pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
    $pf   = [Environment]::GetFolderPath('ProgramFiles')
    if ($pf86) { $candidates += (Join-Path $pf86 'Windows Kits\10\bin') }
    if ($pf)   { $candidates += (Join-Path $pf   'Windows Kits\10\bin') }
    $roots = $candidates | Where-Object { Test-Path $_ }

    foreach ($root in $roots) {
        $versions = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^10\.' } |
            Sort-Object Name -Descending
        foreach ($v in $versions) {
            $candidate = Join-Path $v.FullName "x64\$ToolName"
            if (Test-Path $candidate) { return $candidate }
        }
    }
    throw "$ToolName が見つかりません。Windows 10/11 SDK をインストールしてください。"
}

$makeAppx = Find-WindowsSdkTool -ToolName "MakeAppx.exe"
$signTool = Find-WindowsSdkTool -ToolName "SignTool.exe"
Write-Host "MakeAppx: $makeAppx"
Write-Host "SignTool: $signTool"

# ──────────────────────────────────────────────────
# 8. パッケージング
# ──────────────────────────────────────────────────
Write-Host ""
Write-Host "Packing MSIX → $msixOut"
& $makeAppx pack /d $staging /p $msixOut /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx pack failed (exit $LASTEXITCODE)" }

# ──────────────────────────────────────────────────
# 9. 署名（任意）
# ──────────────────────────────────────────────────
if ($SigningPfx) {
    Write-Host "Signing with PFX: $SigningPfx"
    if ($SigningPassword) {
        & $signTool sign /fd SHA256 /a /f $SigningPfx /p $SigningPassword $msixOut
    } else {
        & $signTool sign /fd SHA256 /a /f $SigningPfx $msixOut
    }
    if ($LASTEXITCODE -ne 0) { throw "SignTool sign failed" }
}
elseif ($SelfSign) {
    Write-Host "Generating self-signed cert for local testing..."
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $Publisher `
        -KeyUsage DigitalSignature `
        -FriendlyName "TomaFiler MSIX Test Signing" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    Write-Host "  Subject    : $($cert.Subject)"
    Write-Host "  Thumbprint : $($cert.Thumbprint)"
    & $signTool sign /fd SHA256 /sha1 $cert.Thumbprint $msixOut
    if ($LASTEXITCODE -ne 0) { throw "SignTool sign failed" }
    Write-Host ""
    Write-Host "  ⚠ ローカルで起動するには証明書を信頼ルート (Cert:\LocalMachine\TrustedPeople) に登録する必要があります"
    Write-Host "  Export-Certificate -Cert `"Cert:\CurrentUser\My\$($cert.Thumbprint)`" -FilePath toma.cer"
    Write-Host "  Import-Certificate -FilePath toma.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople"
}
else {
    Write-Host ""
    Write-Host "  (unsigned — Microsoft Store 提出時はストア側で再署名されるため不要)"
}

Write-Host ""
Write-Host "✅ Done: $msixOut" -ForegroundColor Green
