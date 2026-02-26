# Filer - オリジナルファイラー

## プロジェクト概要
美しくて、ファイル整理が気持ちいいタブ型ファイラー。軽量・高速・拡張性を重視。

## 技術スタック
- **バックエンド**: Rust (Tauri v2)
- **フロントエンド**: React 19 + TypeScript + Vite
- **スタイリング**: Tailwind CSS v4 (CSS-first config、tailwind.config不要)
- **状態管理**: Zustand
- **リンター/フォーマッター**: Biome v2 (`biome.json`)
- **テスト**: Vitest + happy-dom (フロントエンド) / cargo test (バックエンド)
- **i18n**: 自前実装 (`src/i18n/` — ja.ts/en.ts)
- **CI/CD**: GitHub Actions (タグpushで自動ビルド・リリース)
- **pre-commit**: husky + lint-staged (Biome check)
- **パッケージマネージャ**: pnpm

## ディレクトリ構成
```
filer/
├── .github/workflows/  # GitHub Actions
│   └── release.yml     # タグpush → 自動ビルド・リリース
├── src-tauri/          # Rust バックエンド (Tauri)
│   ├── src/
│   │   ├── main.rs     # エントリポイント
│   │   ├── lib.rs      # Tauriアプリ初期化・コマンド登録
│   │   ├── commands/   # Tauri コマンド (IPC)
│   │   │   ├── fs.rs   # ファイル操作 (読取・作成・削除・リネーム・テンプレート展開)
│   │   │   ├── ai.rs   # AI自動整理 (Claude API連携)
│   │   │   ├── clipboard.rs # クリップボード→ファイル生成
│   │   │   ├── copy_queue.rs # コピーキュー (バックグラウンドコピー)
│   │   │   ├── icons.rs # Windows Shellアイコン抽出
│   │   │   └── system.rs # システム情報 (ドライブ一覧等)
│   │   ├── db/         # SQLite データベース
│   │   │   ├── mod.rs  # DB初期化・マイグレーション
│   │   │   ├── rules.rs # ルール管理
│   │   │   ├── history.rs # 操作履歴
│   │   │   └── usage.rs # AI使用量トラッキング
│   │   └── watcher/    # ファイル監視・ルール自動適用
│   │       ├── mod.rs
│   │       ├── engine.rs  # ルールマッチングエンジン
│   │       └── directory.rs # ディレクトリ監視
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # React フロントエンド
│   ├── components/     # UIコンポーネント
│   │   ├── Panel/      # ファイルパネル (リスト/グリッド表示)
│   │   ├── TabBar/     # タブ管理
│   │   ├── NavigationBar/ # パンくずリスト・検索
│   │   ├── Sidebar/    # サイドバー (お気に入り・ドライブ)
│   │   ├── StatusBar/  # ステータスバー
│   │   ├── BookmarkBar/ # ブックマークバー
│   │   ├── AiOrganizer/ # AI自動整理ダイアログ
│   │   ├── AiSettings/ # AI設定 (APIキー・予算)
│   │   ├── RuleManager/ # ルール管理・エディタ
│   │   ├── RuleWizard/ # ルール作成ウィザード
│   │   ├── RuleSuggestion/ # ルール提案バナー
│   │   ├── QuickLook/  # ファイルプレビュー
│   │   ├── PreviewPanel/ # プレビューパネル
│   │   ├── ContextMenu/ # 右クリックメニュー
│   │   ├── DragSuggestion/ # ドラッグ時の移動先サジェスト
│   │   ├── PropertiesDialog/ # プロパティダイアログ
│   │   ├── SettingsDialog/ # 設定ダイアログ
│   │   ├── CommandPalette/ # コマンドパレット (Ctrl+K)
│   │   ├── CopyQueue/    # コピーキューパネル
│   │   ├── TemplateManager/ # テンプレート管理ダイアログ
│   │   └── HomeView/     # ホーム画面
│   ├── stores/         # Zustand ストア
│   │   ├── panelStore.ts # パネル・タブ・ファイル一覧
│   │   ├── aiStore.ts  # AI整理状態
│   │   ├── ruleStore.ts # ルール管理
│   │   ├── bookmarkStore.ts # ブックマーク
│   │   ├── settingsStore.ts # アプリ設定
│   │   ├── undoStore.ts # Undo/Redoスタック
│   │   ├── toastStore.ts # グローバル通知
│   │   ├── copyQueueStore.ts # コピーキュー状態
│   │   ├── commandPaletteStore.ts # コマンドパレット状態
│   │   ├── templateStore.ts # テンプレート管理
│   │   ├── iconStore.ts # アイコンキャッシュ
│   │   ├── thumbnailStore.ts # サムネイルキャッシュ
│   │   ├── suggestionStore.ts # ドラッグ移動先サジェスト
│   │   ├── ruleSuggestionStore.ts # ルール提案状態
│   │   └── ruleWizardStore.ts # ルール作成ウィザード状態
│   ├── i18n/           # 国際化 (ja.ts/en.ts)
│   ├── commands/       # コマンドレジストリ (コマンドパレット用)
│   ├── types/          # TypeScript 型定義
│   ├── utils/          # ユーティリティ
│   ├── test/           # テスト基盤
│   │   ├── setup.ts    # Tauri APIモック等
│   │   └── __mocks__/  # lucide-react軽量モック
│   ├── App.tsx
│   └── main.tsx
├── vitest.config.ts    # Vitest テスト設定
├── biome.json          # Biome リンター設定
├── CLAUDE.md
├── REQUIREMENTS.md
├── PLAN.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 環境設定 (Windows)
Rust ビルドには MSVC 環境変数が必要。`pnpm tauri dev` 実行前に以下を設定:
```bash
export PATH="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64:$HOME/.cargo/bin:$PATH"
export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64"
export INCLUDE="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\include;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\ucrt;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\shared"
```

**注意**: WSL2環境ではcargoが利用不可。Rustビルドの確認はWindows側で実行する。

## 開発コマンド
```bash
# 開発サーバー起動 (Tauri + Vite)
pnpm tauri dev

# プロダクションビルド (インストーラー生成)
pnpm tauri build

# フロントエンドのみ (ブラウザ確認用)
pnpm dev

# テスト
pnpm test                    # フロントエンド (Vitest)
cd src-tauri && cargo test   # バックエンド

# リント・フォーマット (Biome)
pnpm lint                    # チェックのみ
pnpm lint:fix                # 自動修正
pnpm format                  # フォーマット
pnpm check                   # lint:fix + tsc --noEmit
```

## リリース
タグをpushすると GitHub Actions が自動でビルド・リリースを作成する:
```bash
git tag -a v1.1.0 -m "v1.1.0: 説明" && git push origin v1.1.0
```
`.github/workflows/release.yml` が Windows ランナー上で `pnpm tauri build` を実行し、MSI/EXEをGitHub Releaseに添付する。

## 開発フロー
機能追加・バグ修正などの作業を始める前に、以下を必ず行う:
1. **GitHub Issue作成**: 作業内容をIssueとして登録する（`gh issue create`）
2. **ブランチ作成**: Issue番号を含むブランチを切る（例: `feat/#19-custom-titlebar`）
3. masterへの直接コミットは避ける

## 並列実装ルール
### セッション内（Taskエージェント並列起動）
- 複数のTaskエージェントで同時にコード変更を行う場合は `isolation: "worktree"` を必ず使う
- 調査・検索のみのエージェントには不要
- worktree完了後のマージはメインコンテキストで行う

### 独立セッション間（複数ターミナルで同時作業）
- **セッション開始時に `git worktree list` を確認する**。他のworktreeが存在する場合、別セッションが作業中の可能性があるため、同じファイルを触らないよう注意する
- 各セッションは必ず別ブランチで作業する
- 同じディレクトリで複数セッションを同時に走らせない。2つ目以降は `git worktree` で分離する:
  ```bash
  git worktree add ../filer-<作業名> <ブランチ名>
  # 例: git worktree add ../filer-sidebar feat/#30-sidebar
  ```
- 作業完了後は worktree を削除する: `git worktree remove ../filer-<作業名>`

## コーディング規約
- 日本語コメントOK（ユーザーが日本語話者）
- コンポーネントはfunction宣言 + named export
- Rustは`snake_case`、TypeScriptは`camelCase`（型は`PascalCase`）
- エラーハンドリング: Rustは`Result`型 + `eprintln!`ログ、TSはtry-catch + `toast.error()`
- Mutex: `.lock().unwrap_or_else(|e| e.into_inner())` でpoisoning時も回復（`.unwrap()` は使わない）
- TSのcatch: `catch (err: unknown)` + `err instanceof Error ? err.message : String(err)`
- Tauri IPC コマンドは `commands/` 配下にモジュール分割
- 1ファイル1責務を意識、大きくなったら分割
- ユーザー通知は `toast.success/error/info` (toastStore) を使用、`console.error` は使わない

## 重要な設計方針
- **パフォーマンス最優先**: 大量ファイル（10万件以上）でも快適に動作
- **キーボードファースト**: 全操作をキーボードで完結可能に
- **プラグイン拡張**: 将来的にプラグインシステムを導入可能な設計に
- **非同期処理**: ファイル操作はすべて非同期。UIをブロックしない
- **セキュリティ**: APIキーはkeyring（Windows Credential Manager）で管理。ファイル名にはvalidate_name()、パス操作にはcanonicalize + starts_with検証でパストラバーサル防止

## テスト基盤の注意事項
- **DOM環境**: WSL2ではjsdomが極端に遅い（30秒以上ハング）。`happy-dom`を使用すること
- **lucide-react**: 3308個のbarrel exportがvitestのモジュール解決をハングさせる。`vitest.config.ts`の`resolve.alias`で`src/test/__mocks__/lucide-react.ts`にリダイレクト必須。`vi.mock()`ではコンポーネント経由の間接importを防げない
- **Tauri APIモック**: `src/test/setup.ts`で`@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-dialog`をモック
- **新しいアイコン使用時**: `src/test/__mocks__/lucide-react.ts`にexportを追加すること
