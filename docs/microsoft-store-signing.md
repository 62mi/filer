# Microsoft Store 経由での無料コード署名ガイド

通常、Windows アプリのコード署名には商用 EV/OV 証明書が必要で、年額数万円〜十数万円かかる。Microsoft Store にアプリを公開すると、Microsoft 側のインフラを使って **無料で署名・配布** できる。本ガイドはその手順をまとめたもの。

参考: [無料で署名できる！Microsoft Storeで配布するアプリの署名方法](https://zenn.dev/abeshunyah/articles/cd060b96924517)

> 本ガイドの対象は Microsoft Store で公開する MSIX パッケージのみ。  
> 直接配布する .msi / .exe には適用できない (それらには SignPath や商用証明書を使う)。

## 前提

1. **Microsoft 開発者アカウント** を [パートナーセンター](https://partner.microsoft.com/dashboard) に登録済みであること。
2. パートナーセンターで対象の **製品 (アプリ) を登録済み** であること。

## 手順

### 1. パートナーセンターから情報を取得

パートナーセンターにログイン → 対象製品 → **製品 ID** ページから以下 3 値をコピーする:

| 項目 | 例 |
| --- | --- |
| `Package/Identity/Name` | `12345TomakoSoftware.TomaFiler` |
| `Package/Identity/Publisher` | `CN=E1234567-1234-1234-1234-1234567890` |
| `Package/Properties/PublisherDisplayName` | `Tomako Software` |

このうち `Publisher` の `CN=` 以降が次のステップで使う値。

### 2. 自己署名コード署名証明書 (.pfx) を作成

Windows の PowerShell で以下を実行:

```powershell
.\scripts\create-signing-cert.ps1 -Cn "E1234567-1234-1234-1234-1234567890"
```

- `Cn` には手順 1 で取得した `CN=` 以降の文字列を指定する。
- 実行すると `.pfx` のパスワードを聞かれるので入力する (画面には表示されない)。
- デフォルトでは `%USERPROFILE%\Downloads\code_sign_certificate.pfx` に出力される。出力先を変えるには `-OutputPath` を指定。

> **重要**: `.pfx` は秘密鍵を含む機密ファイル。`*.pfx` は `.gitignore` で除外済みだが、誤ってコミットしないこと。パスワードもパスワードマネージャ等に安全に保管する。

### 3. MSIX パッケージを作成

Tauri は現状 MSIX バンドルを直接出力できないため、`pnpm tauri build` で生成された `.msi` を **MSIX Packaging Tool** で `.msix` に変換する。

1. Microsoft Store から [MSIX Packaging Tool](https://apps.microsoft.com/detail/9N5LW3JBCXKF) をインストール。
2. ツールを起動 → "Application package" → "Create package on this computer" を選択。
3. インストーラとして `src-tauri/target/release/bundle/msi/TomaFiler_<version>_x64_en-US.msi` を指定。
4. "Package information" の各項目には手順 1 でコピーした値を入力:
   - Package name: `Package/Identity/Name`
   - Publisher: `Package/Identity/Publisher` (CN= から始まる完全な文字列)
   - Publisher display name: `Package/Properties/PublisherDisplayName`
5. ウィザードに従ってパッケージを作成し、`.msix` として保存。

### 4. MSIX に署名

```powershell
.\scripts\sign-msix.ps1 `
    -MsixPath ".\TomaFiler.msix" `
    -PfxPath "$HOME\Downloads\code_sign_certificate.pfx"
```

- `.pfx` のパスワードを聞かれるので、手順 2 で設定したパスワードを入力。
- 内部で Windows SDK の `signtool.exe` を使って SHA256 で署名する。
- タイムスタンプサーバはデフォルトで `http://timestamp.digicert.com`。変更するには `-TimestampUrl` を指定。

署名内容を確認するには:

```powershell
& "C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\signtool.exe" verify /pa /v ".\TomaFiler.msix"
```

### 5. パートナーセンターにアップロード

パートナーセンターの対象製品 → "パッケージ" から、署名済みの `.msix` をアップロードして審査に提出する。

## トラブルシューティング

### `signtool.exe が見つかりません`

Windows SDK がインストールされていない。Visual Studio Installer から "Windows 10/11 SDK" を追加するか、[スタンドアロンの Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/) をインストールする。

### `New-SelfSignedCertificate : ...パラメーター名 'Type' は...`

PowerShell 5.1 以降が必要。`$PSVersionTable.PSVersion` で確認。

### MSIX Packaging Tool が起動しない

Windows 10 バージョン 1809 以降が必要。Windows Update を実行する。

## 関連ファイル

- `scripts/create-signing-cert.ps1` - 自己署名証明書 (.pfx) 生成
- `scripts/sign-msix.ps1` - MSIX 署名
- `.gitignore` - `*.pfx`, `*.p12`, `*.cer` を除外
