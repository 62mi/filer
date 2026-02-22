# Filer - 実装プラン

## フェーズ概要

| フェーズ | 内容 | 目標 |
|---------|------|------|
| Phase 0 | プロジェクトセットアップ | 開発環境の構築 |
| Phase 1 | MVP（コア機能） | 基本的なデュアルパネルファイラー |
| Phase 2 | 拡張機能 | タブ・検索・プレビュー |
| Phase 3 | 高度な機能 | バッチ操作・アーカイブ・テーマ |

---

## Phase 0: プロジェクトセットアップ

### Step 0.1: Tauri + React プロジェクト初期化
- [ ] `pnpm create tauri-app` でプロジェクト作成（React + TypeScript テンプレート）
- [ ] Tailwind CSS v4 の導入
- [ ] Zustand の導入
- [ ] ESLint + Prettier 設定
- [ ] Vitest の設定
- [ ] ディレクトリ構成の整備

### Step 0.2: 基本的なウィンドウ設定
- [ ] Tauri ウィンドウ設定（タイトル、最小サイズ、アイコン）
- [ ] ダークテーマのベースCSS
- [ ] フォント設定（等幅フォント: JetBrains Mono / Noto Sans JP）

---

## Phase 1: MVP（コア機能）

### Step 1.1: デュアルパネルレイアウト
**フロントエンド:**
- [ ] `App.tsx` - メインレイアウト（ツールバー + パネルエリア + ステータスバー）
- [ ] `Panel` コンポーネント - ファイル一覧を表示するパネル
- [ ] `Splitter` コンポーネント - パネル間のリサイザー
- [ ] パネルフォーカス管理（アクティブパネルの状態管理）

**ストア:**
- [ ] `panelStore` - パネルの状態（パス、選択、ソート等）

### Step 1.2: ファイルシステムバックエンド
**Rust (src-tauri):**
- [ ] `commands/fs.rs` - ファイル一覧取得コマンド
  - `list_directory(path)` → `Vec<FileEntry>`
  - `FileEntry` 構造体: name, path, size, modified, is_dir, is_hidden, extension
- [ ] `commands/fs.rs` - ファイル操作コマンド
  - `copy_files(sources, dest)`
  - `move_files(sources, dest)`
  - `delete_files(paths, to_trash)` ※ゴミ箱対応
  - `rename_file(path, new_name)`
  - `create_directory(path, name)`
  - `create_file(path, name)`
- [ ] `commands/system.rs` - システム情報
  - `get_drives()` → ドライブ一覧
  - `get_home_dir()` → ホームディレクトリ
  - `open_in_explorer(path)` → エクスプローラーで開く
  - `open_file(path)` → デフォルトアプリで開く

### Step 1.3: ファイル一覧表示
**フロントエンド:**
- [ ] `FileList` コンポーネント - 仮想スクロール対応のファイル一覧
- [ ] `FileRow` コンポーネント - 1ファイルの行表示
- [ ] `FileIcon` コンポーネント - ファイル種別アイコン
- [ ] ソート機能（カラムヘッダクリック）
- [ ] 隠しファイル表示トグル

### Step 1.4: ファイル選択と操作
**フロントエンド:**
- [ ] 単一選択（クリック / j,k移動）
- [ ] 複数選択（Space / Ctrl+Click / Shift+Click）
- [ ] 範囲選択（Shift+j/k）
- [ ] 全選択 / 選択反転
- [ ] コピー・移動の進捗ダイアログ
- [ ] 削除確認ダイアログ
- [ ] リネームインライン編集

### Step 1.5: ナビゲーション
**フロントエンド:**
- [ ] `AddressBar` コンポーネント - パス表示・入力
- [ ] パンくずリスト表示
- [ ] ディレクトリ移動（Enter / ダブルクリック）
- [ ] 親ディレクトリへ移動（Backspace / h）
- [ ] 戻る/進む（Alt+Left/Right）
- [ ] ナビゲーション履歴管理

**ストア:**
- [ ] `navigationStore` - 履歴スタック管理

### Step 1.6: キーボード操作基盤
- [ ] キーバインドシステム（アクション→キー のマッピング）
- [ ] Vim風ナビゲーション（h/j/k/l）
- [ ] ファンクションキー操作（F2,F5,F6,F7,F8）
- [ ] フォーカス管理（パネル間、ダイアログ等）
- [ ] コマンドパレット（Ctrl+P）

### Step 1.7: ステータスバー
- [ ] 選択ファイル数 / 合計ファイル数の表示
- [ ] 選択ファイルの合計サイズ
- [ ] 現在のディスク空き容量
- [ ] 操作中の進捗表示

---

## Phase 2: 拡張機能

### Step 2.1: タブ機能
- [ ] `TabBar` コンポーネント
- [ ] タブの追加 / 閉じる / 切り替え
- [ ] タブのドラッグ&ドロップ並び替え
- [ ] 閉じたタブの復元
- [ ] タブの状態管理（`tabStore`）

### Step 2.2: 高速検索・フィルタ
**Rust:**
- [ ] `commands/search.rs`
  - `search_files(path, query, recursive, regex)` → 非同期ストリーム
  - ファジーマッチング対応

**フロントエンド:**
- [ ] `SearchBar` コンポーネント（インクリメンタル検索）
- [ ] `FilterBar` コンポーネント（拡張子/サイズ/日付フィルタ）
- [ ] 検索結果のハイライト表示
- [ ] 再帰検索のプログレス表示

### Step 2.3: プレビュー機能
- [ ] `PreviewPanel` コンポーネント
- [ ] テキストファイルプレビュー（シンタックスハイライト）
- [ ] 画像プレビュー（サムネイル表示）
- [ ] プレビューのトグル表示（F3）

### Step 2.4: ブックマーク
**Rust:**
- [ ] `commands/bookmarks.rs` - ブックマークの CRUD

**フロントエンド:**
- [ ] `BookmarkPanel` コンポーネント
- [ ] ブックマークの追加 / 削除 / ジャンプ

### Step 2.5: ファイル監視
**Rust:**
- [ ] `watcher/mod.rs` - notify crate を使ったファイル監視
- [ ] ディレクトリ変更時の自動リフレッシュ
- [ ] 監視対象の動的な切り替え

---

## Phase 3: 高度な機能

### Step 3.1: バッチリネーム
- [ ] バッチリネームダイアログ
- [ ] パターン指定（連番、日付、正規表現置換）
- [ ] プレビュー表示

### Step 3.2: アーカイブ対応
**Rust:**
- [ ] ZIP/7z/tar.gz の一覧取得
- [ ] アーカイブの展開
- [ ] アーカイブの作成

### Step 3.3: 外部ツール連携
- [ ] ターミナルを開く（Ctrl+`）
- [ ] 外部エディタ設定
- [ ] カスタムコマンド登録

### Step 3.4: テーマシステム
- [ ] テーマ定義フォーマット
- [ ] ダーク/ライトテーマの切り替え
- [ ] カスタムテーマの読み込み

### Step 3.5: 設定画面
- [ ] 設定画面UI
- [ ] キーバインド設定
- [ ] 外観設定
- [ ] 動作設定

---

## 技術的な注意点

### パフォーマンス
- ファイル一覧は**仮想スクロール**（react-window or 自作）で大量ファイルに対応
- Rust側でのファイル一覧取得は `rayon` による並列処理
- IPC通信の最小化: 必要なデータのみをフロントに送る
- ファイルアイコンはSVGでバンドルし、ネットワーク不要に

### Rust crates（主要な依存）
```toml
[dependencies]
tauri = { version = "2", features = [...] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
notify = "7"                    # ファイル監視
trash = "5"                     # ゴミ箱操作
walkdir = "2"                   # 再帰的ディレクトリ走査
rayon = "1"                     # 並列処理
fuzzy-matcher = "0.3"           # ファジー検索
chrono = "0.4"                  # 日時処理
```

### フロントエンド依存（主要）
```json
{
  "@tauri-apps/api": "^2",
  "react": "^19",
  "zustand": "^5",
  "lucide-react": "^0.400",
  "clsx": "^2",
  "tailwind-merge": "^2"
}
```

---

## 最初の実装ターゲット

**Phase 0 → Phase 1.1 ~ 1.3** を最初のマイルストーンとする。

ゴール: デュアルパネルでファイル一覧を表示し、ディレクトリ移動ができる状態。
これにより、アプリの骨格が完成し、以降の機能追加がスムーズになる。
