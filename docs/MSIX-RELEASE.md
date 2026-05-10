# Microsoft Store リリースガイド (MSIX)

TomaFiler を Microsoft Store に公開するための手順書。Partner Center 登録から
初回審査提出までを **逆引きしやすい単位** に分解している。

---

## TL;DR — フェーズ一覧

| Phase | 主体 | 内容 | 想定時間 |
|---|---|---|---|
| 1 | ユーザー | Partner Center 登録 (Individual / 無料) | 即〜数分 |
| 2 | ユーザー | 本人確認 (Government ID + 自撮り) | 1〜7営業日 |
| 3 | ユーザー | アプリ予約 → Identity 値の確認 | 即 |
| 4 | ユーザー | GitHub repo Variables に Identity を登録 | 即 |
| 5 | 開発 | ローカルで MSIX ビルド検証 | 5分 |
| 6 | CI | タグ push → 自動で MSIX 生成 | 10分 |
| 7 | ユーザー | Partner Center に MSIX アップロード → ストア掲載情報入力 | 30分〜1h |
| 8 | MS | 審査 | 2〜7営業日 |

---

## Phase 1 — Partner Center 登録

### 入口（おすすめ順）

1. **直リン (確実)**: https://developer.microsoft.com/microsoft-store/register/
2. Partner Center ホーム画面の Workspace パネルで「**+ (新規)**」 → Microsoft Store を選択
3. https://partner.microsoft.com/dashboard/registration

### 入力内容

- Account type: **Individual** (個人・無料)
- Country/region: **Japan**
- Publisher Display Name: **`Tomako`** ← ストアに表示される名前。**後から変更が困難**なので慎重に
- 名前・住所・電話番号: 本人確認書類と一致させる

> ⚠️ 法人テナント所属の MS アカウントだと Account type が出ないことがある。その場合は
> 個人用の MS アカウントで入り直すか、テナントから一旦外してもらう。

---

## Phase 2 — 本人確認

Microsoft の本人確認パートナーが、提出した政府発行 ID + 自撮り画像を照合する。

- **必要書類**: 運転免許証 / マイナンバーカード / パスポート のいずれか
- **撮影のコツ**: ID は四隅すべて写す。反射で文字が読めないと弾かれる
- **承認時間**: 通常 1〜3 営業日。混雑時 1 週間
- **ステータス確認**: Partner Center → Account settings → Legal info

承認されると Partner Center で「Apps and games」 Workspace が利用可能になる。

---

## Phase 3 — アプリ予約と Identity 値の確認

### 予約手順

1. Partner Center → **Apps and games** → **+ New product** → **MSIX or PWA app**
2. アプリ名に `TomaFiler` を入力 → **Reserve product name**
3. 予約済み一覧に TomaFiler が出れば成功（似た名前が既存だと拒否される。その場合は `TomaFiler — タブ型ファイラー` のような副題付きにする）

### Identity 値を取り出す

予約直後の画面、または:

**TomaFiler → Product identity** → 以下4つの値が表示される。

```xml
<!-- ここに表示される実際の値を控える -->
<Package>
  <Identity Name="62mi.TomaFiler"
            Publisher="CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            Version="..."
            ProcessorArchitecture="x64" />
  <Properties>
    <PublisherDisplayName>Tomako</PublisherDisplayName>
  </Properties>
</Package>
```

| ラベル | 値の例 | repo Variables の name |
|---|---|---|
| Package/Identity/Name | `62mi.TomaFiler` | `MSIX_IDENTITY_NAME` |
| Package/Identity/Publisher | `CN=XXXX-XXXX-...` | `MSIX_IDENTITY_PUBLISHER` |
| Package/Properties/PublisherDisplayName | `Tomako` | `MSIX_PUBLISHER_DISPLAY` |
| Package Family Name (PFN) | `62mi.TomaFiler_xxxxxxxxxxxxx` | （参考用、CI には不要） |

---

## Phase 4 — GitHub repo Variables に登録

リポジトリ → Settings → Secrets and variables → **Actions** → **Variables** タブ → **New repository variable**

3つ追加:

```
MSIX_IDENTITY_NAME       = 62mi.TomaFiler           ← Phase 3 でコピーした値
MSIX_IDENTITY_PUBLISHER  = CN=XXXX-XXXX-...         ← Phase 3 でコピーした値
MSIX_PUBLISHER_DISPLAY   = Tomako
```

> Secrets ではなく Variables。Identity は機密ではないので。
> これら未設定だと CI 上の `build-msix` ジョブは自動 skip される。

---

## Phase 5 — ローカルで MSIX ビルド検証

実機 (Windows) で動かす:

```pwsh
# 自己署名で署名 (ローカル動作確認用)
pwsh ./scripts/build-msix.ps1 -SelfSign

# 出力: src-tauri/target/msix/TomaFiler_<version>_x64.msix
```

自己署名 MSIX をローカルで起動するには証明書を信頼ルートに登録する必要がある:

```pwsh
# 1. 証明書を export
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -eq "CN=Tomako"
Export-Certificate -Cert $cert -FilePath toma-test.cer

# 2. 信頼ルートにインポート (管理者 PowerShell)
Import-Certificate -FilePath toma-test.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople

# 3. インストール
Add-AppxPackage src-tauri/target/msix/TomaFiler_*.msix
```

### 確認項目チェックリスト

- [ ] アプリが起動する
- [ ] スタートメニューに TomaFiler が出る
- [ ] 全ドライブ (C:\, D:\) を一覧できる ← `runFullTrust` が効いていればOK
- [ ] エクスプローラー / ターミナル / その他の外部プロセス起動が動く
- [ ] クリップボード経由のコピペ (CF_HDROP) が動く
- [ ] アンインストール → 設定が AppData に残らないか確認

---

## Phase 6 — タグ push → CI で MSIX 生成

```bash
git tag -a v1.6.1 -m "v1.6.1: Microsoft Store 初回提出"
git push origin v1.6.1
```

`.github/workflows/release.yml` の `build-msix` ジョブが起動 → Artifact `tomafiler-msix` に
`.msix` がアップロードされる。

ダウンロード手順: GitHub → Actions → 該当 Workflow run → Artifacts → `tomafiler-msix`

---

## Phase 7 — Partner Center に MSIX アップロード

1. Partner Center → TomaFiler → **Packages** → **Upload package**
2. Phase 6 でダウンロードした `.msix` をアップロード
3. WACK 検証が自動で走る (数分)

### 同じ画面で必要になる情報

#### Store listings (ja-JP / en-US の2言語)

- **Description**: アプリ説明文 (3500文字以下)
- **Short description**: 200文字以下のサマリ
- **Screenshots**: 最低1枚〜最大10枚 (1366×768 以上 / 推奨 1920×1080)
- **Store logos**: 自動でパッケージから抽出される
- **Search terms**: 7個まで (例: `ファイラー`, `エクスプローラー`, `タブ`, `tabbed file manager`)
- **Copyright and trademark info**: `© 2026 Tomako`

#### Properties

- **Category**: `Productivity` (推奨)
- **Subcategory**: `File managers`
- **Privacy policy URL**: 必須。AI機能 (Claude API) があるので必ず必要
- **Website**: 任意 (`https://github.com/62mi/filer` 等)
- **Support contact info**: メールアドレス

#### Age ratings

- IARC アンケートに回答 → 自動で各国レーティングを取得
- TomaFiler は機能的には全年齢相当

#### Pricing and availability

- **Markets**: 全世界 or 日本のみ
- **Price**: Free
- **Free trial**: なし
- **Visibility**: Public

---

## Phase 8 — 審査の典型的な指摘と対応

### 1. `broadFileSystemAccess` 申請理由

**現状の TomaFiler は AppxManifest で `broadFileSystemAccess` を宣言していない**
（`runFullTrust` のみ）。runFullTrust だけで全ドライブにアクセスできるので
通常は不要だが、もし審査で指摘された場合は以下の理由文を準備:

> TomaFiler is a file manager application. Access to user-selected directories
> across all drives is the core functionality of the product. Without broad
> file system access, the application cannot fulfill its primary purpose of
> browsing, organizing, and managing files anywhere on the system.

### 2. プライバシーポリシー

AI 自動整理 (Claude API) を提供するため必須。最小構成:

- 何のデータを送信するか (ファイル名・ディレクトリ構造)
- どこに送信するか (Anthropic API)
- ローカル保存される情報 (操作履歴 SQLite, 設定)
- API キーの保管場所 (Windows Credential Manager)

### 3. WACK 警告

Tauri アプリで `S Mode Compatibility` 警告が出ることがある。
Microsoft Store は S Mode 警告を許容するので無視可能。

### 4. autostart が動かない

現状の `tauri-plugin-autostart` は HKCU\Run 書き込みベースで MSIX 環境では
レジストリ仮想化により実際には起動しない。manifest 側で
`<uap5:StartupTask>` は宣言済みなので、フォローアップ Issue で
WinRT `Windows.ApplicationModel.StartupTask` API への置き換えを行う。

---

## トラブルシューティング

### Q. `MakeAppx pack` が `error: 0x80080204` で失敗する

→ AppxManifest.xml の Identity 値がストアの予約と一致していない。Phase 3 の値を
再確認すること。

### Q. ローカル自己署名 MSIX のインストールで「このパッケージは信頼されていない発行元によって...」

→ 証明書を `Cert:\LocalMachine\TrustedPeople` にインポートしていない。Phase 5 のスクリプト参照。

### Q. Store 提出後に `Package full name` の競合エラー

→ 同じ Identity Name で別のパッケージが既に提出済み。Phase 3 の予約名を変える必要あり。

### Q. CI の `build-msix` ジョブが skip される

→ repo Variables に `MSIX_IDENTITY_NAME` が未設定。Phase 4 を確認。
