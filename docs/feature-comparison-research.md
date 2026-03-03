# ファイラー機能比較調査 (2026-03-01)

TomaFilerと世の中の主要ファイラーを比較し、未実装の機能を洗い出した調査結果。

## 調査対象ファイラー

- **Windows**: Windows 11 Explorer, Total Commander, Directory Opus, XYplorer, Q-Dir, One Commander, Tablacus Explorer
- **クロスプラットフォーム**: Double Commander, FreeCommander
- **Mac**: Finder, Path Finder, ForkLift, Commander One
- **モダン系**: Sigma File Manager, Files App, Flow Launcher

---

## TomaFilerに未実装の機能（優先度順）

### Tier 1: ほぼ全ファイラーが搭載

| 機能 | 搭載ファイラー | 概要 |
|------|--------------|------|
| **デュアルペイン** | TC, DOpus, XYplorer, Q-Dir, One Commander, DC, FC, Path Finder, ForkLift | 左右2パネルでファイル操作 |
| **バッチリネーム** | TC, DOpus, XYplorer, DC, FC, Path Finder, ForkLift, One Commander | 正規表現・連番・日付・置換等で複数ファイルを一括リネーム |
| **アーカイブ操作** | TC, DOpus, DC, FC, Win11 Explorer, One Commander | ZIP/7z/RAR/TARの閲覧・展開・作成 |

### Tier 2: 上級ファイラーの標準機能

| 機能 | 搭載ファイラー | 概要 |
|------|--------------|------|
| **フォルダ比較・同期** | TC, DOpus, DC, FC, Path Finder, ForkLift | 2フォルダの差分表示＋同期 |
| **カラータグ/ラベル** | Finder(7色), DOpus, XYplorer, Files App | ファイルに色やラベルを付けて視覚的に整理 |
| **Flat View / Branch View** | DOpus, XYplorer | サブフォルダの中身を展開して一覧表示 |
| **FTP/SFTP接続** | TC, DOpus, DC, FC, Path Finder, ForkLift, Commander One | リモートサーバーのファイル操作 |
| **ファイル内容検索** | TC, DC, FC | ファイル名だけでなくテキスト内容でも検索 → **#78 で対応予定** |
| **Git統合** | Files App, ForkLift | ファイルリストにGitステータス・コミット情報を表示 |

### Tier 3: 差別化ポイントになりうる機能

| 機能 | 搭載ファイラー | 概要 |
|------|--------------|------|
| **カスタムキーバインド** | DOpus, Files App, TC | ショートカットキーを自由に変更 |
| **ワークスペース/Tabsets** | XYplorer, Sigma | タブの組み合わせを保存・復元 |
| **重複ファイル検索** | DOpus, Path Finder | 同一内容のファイルを検出 |
| **Miller Columns** | One Commander, Finder, Files App | 階層をカラムで横に展開するビュー |
| **ファイルハッシュ/チェックサム** | FC, Files App | MD5/SHA256でファイル整合性検証 |
| **プラグインシステム** | TC, DOpus, Tablacus, DC | 第三者が機能を拡張可能 |
| **スクリプティング** | DOpus, XYplorer, One Commander | カスタムスクリプトで操作を自動化 |

### Tier 4: ユニーク/ニッチ

| 機能 | 搭載ファイラー | 概要 |
|------|--------------|------|
| **内蔵ノート** | Sigma | フォルダやファイルにメモ付与 |
| **ファイル分割/結合** | FreeCommander | 大きなファイルを分割→後で結合 |
| **安全削除(シュレッダー)** | FreeCommander | 復元不可能なファイル削除 |
| **ワイヤレスファイル共有** | Sigma | LAN内でブラウザ経由の共有 |
| **類似画像検索** | XYplorer | 見た目が似ている画像を検出 |
| **Paper Folders** | XYplorer | 異なる場所のファイルを仮想フォルダにまとめる |
| **Hexビューア** | TC, DOpus, DC, FC | バイナリファイルのHex表示 |
| **カスタム背景画像** | Sigma, Files App | 背景を画像や動画でカスタマイズ |
| **タッチジェスチャー** | Files App | スワイプで戻る/進む |

---

## TomaFilerの独自の強み

他のファイラーにあまりない、TomaFiler独自の機能:

- **AI自動整理（Claude連携）** — ファイル整理プランのAI生成＋実行
- **煩雑度スコア** — フォルダの散らかり具合を数値化
- **ルール自動適用 + パターン自動検出** — 拡張子パターンからルール提案
- **ドラッグ時の移動先サジェスト** — 履歴・ブックマークから候補表示

---

## 各ファイラーの詳細機能

### Total Commander
- デュアルペイン（Orthodox型）、マルチタブ
- 内蔵ファイルビューア（Lister）: 任意サイズのファイルをHex/Binary/Textで表示
- FTPクライアント（FTPS/SSL/TLS対応、HTTPプロキシ）
- バッチリネーム（正規表現対応）
- ディレクトリ同期（FTP対応）
- ファイル比較（エディタ付き）
- アーカイブ: ZIP/7ZIP/ARJ/LZH/RAR/UC2/TAR/GZ/CAB/ACE
- プラグインAPI: WCX/WDX/WFX/WLX
- ツールバー・メニュー・キーボードショートカットのカスタマイズ
- 多言語・Unicode対応

### Directory Opus
- デュアルペイン・デュアルツリー・マルチタブ
- キューイングファイルコピー
- バッチリネーム（Evaluator式・サジェスト付き）
- Flat View（サブフォルダ展開表示）
- File Collections（仮想フォルダ）
- ラベル（複数・カテゴリ付き）
- ステータスアイコン（done/watched/urgent/to-do）
- ファイルの評価・タグ・説明、メタデータ編集
- 高速内蔵画像ビューア、Hexビューア
- 完全なスクリプトインターフェース
- 重複ファイル検索、フォルダ同期
- フルマルチスレッド、ネイティブ64bit

### XYplorer
- デュアルペイン（オプション）、タブ・Tabsets
- Mini Tree（使用パスのみ表示）
- Branch View（サブフォルダ一覧表示）
- タグ・カラーラベル・コメント（ファイル/フォルダ個別）
- カラーフィルタ（名前/サイズ/日付/年齢/属性）
- 独自スクリプトエンジン
- Paper Folders（仮想アイテムコレクション）
- 類似画像検索
- ポータブル（インストール不要）

### One Commander
- デュアルペイン、Miller Columns（macOS Finder改良版）
- Spacebar起動のインスタントプレビュー（画像メタデータ/GPS、PDFスクロール）
- PowerShell/Batch/Pythonスクリプト実行
- テーマエンジン（Dark/Light、XAML編集可能）
- 高度な正規表現リネーム、バッチ画像変換
- アーカイブ: ZIP/RAR/7Z対応（抽出不要でリスト表示）
- 長いUnicodeパス対応（260文字制限なし）

### macOS Finder
- アイコン/リスト/カラム/ギャラリーの4表示モード
- Quick Look: スペースキーでプレビュー（PDF/HTML/QuickTime/テキスト/iWork/MS Office/RAW画像）
- カラータグ（7色）
- Smart Folders（保存検索、条件自動更新）
- Spotlight統合、AirDrop、iCloud Drive、スタック

### Sigma File Manager
- スマート検索（タイポ補正・大文字小文字無視・語順不問・拡張子省略対応）
- ワークスペース（独立タブ+事前定義アクション）
- ダッシュボード（ピン留め/保護/タグ付きアイテム、タイムライン）
- 内蔵ノートエディタ（画像/数式KaTeX/リスト/チェックボックス）
- ワイヤレスファイル共有（LAN内ブラウザアクセス）
- カスタムメディア背景（画像/動画/ビルトインアートワーク）

### Files App（WinAppSDK）
- タブ、デュアルペイン、カラムレイアウト
- ファイルタグ（カラー付き）
- Git統合（ステータス/コミットハッシュ/著者カラム表示、GitHub URLクローン）
- ハッシュ比較（ファイル整合性検証）
- コマンドパレット（Ctrl+Shift+P、150以上のアクション）
- Omnibar（統合検索/コマンド）
- カスタムキーボードショートカット
- スワイプジェスチャー

### Double Commander / FreeCommander
- デュアルペイン、マルチタブ
- 内蔵テキストエディタ（シンタックスハイライト）
- ファイルビューア（テキスト/バイナリ/Hex）
- アーカイブを仮想サブディレクトリとして扱う
- Total Commander互換プラグインAPI
- FTP/SFTP/SMB対応
- ファイル分割/結合（FreeCommander）
- ファイルシュレッダー（FreeCommander）
- チェックサム計算（FreeCommander）

### Path Finder / ForkLift / Commander One
- デュアルペイン、タブ、ブックマーク
- Drop Stack/Shelf（一時ファイル置き場）
- フォルダ比較・同期
- バッチリネーム、重複ファイル検索
- 内蔵ターミナル、Hexエディタ（Path Finder）
- クラウド統合（Google Drive/Dropbox/S3/Backblaze等）
- SFTP/FTP/WebDAV/SMB/AFP/NFS（ForkLift）
- Git統合（ForkLift: ファイルステータス表示）
- ACLエディタ（Path Finder）

---

## 関連Issue

- #78 ファイル内容検索
