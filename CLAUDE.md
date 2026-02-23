# Filer - オリジナルファイラー

## プロジェクト概要
Windows向けデュアルパネルファイラー。軽量・高速・拡張性を重視。

## 技術スタック
- **バックエンド**: Rust (Tauri v2)
- **フロントエンド**: React 19 + TypeScript + Vite
- **スタイリング**: Tailwind CSS v4
- **状態管理**: Zustand
- **テスト**: Vitest (フロントエンド) / cargo test (バックエンド)
- **パッケージマネージャ**: pnpm

## ディレクトリ構成
```
filer/
├── src-tauri/          # Rust バックエンド (Tauri)
│   ├── src/
│   │   ├── main.rs     # エントリポイント
│   │   ├── commands/   # Tauri コマンド (IPC)
│   │   ├── fs/         # ファイルシステム操作
│   │   └── watcher/    # ファイル監視
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # React フロントエンド
│   ├── components/     # UIコンポーネント
│   │   ├── Panel/      # ファイルパネル
│   │   ├── Tabs/       # タブ管理
│   │   ├── Toolbar/    # ツールバー
│   │   ├── StatusBar/  # ステータスバー
│   │   └── Dialog/     # ダイアログ系
│   ├── hooks/          # カスタムフック
│   ├── stores/         # Zustand ストア
│   ├── types/          # TypeScript 型定義
│   ├── utils/          # ユーティリティ
│   ├── App.tsx
│   └── main.tsx
├── CLAUDE.md
├── REQUIREMENTS.md
├── PLAN.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

## 環境設定 (Windows)
Rust ビルドには MSVC 環境変数が必要。`pnpm tauri dev` 実行前に以下を設定:
```bash
export PATH="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64:$HOME/.cargo/bin:$PATH"
export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64"
export INCLUDE="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\include;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\ucrt;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\shared"
```

## 開発コマンド
```bash
# 開発サーバー起動
pnpm tauri dev

# ビルド
pnpm tauri build

# フロントエンドのみ (ブラウザ確認用)
pnpm dev

# テスト
pnpm test                    # フロントエンド
cd src-tauri && cargo test   # バックエンド

# リント・フォーマット (Biome)
pnpm lint                    # チェックのみ
pnpm lint:fix                # 自動修正
pnpm format                  # フォーマットのみ
pnpm check                   # lint + format + tsc
```

## コーディング規約
- 日本語コメントOK（ユーザーが日本語話者）
- コンポーネントはfunction宣言 + named export
- Rustは`snake_case`、TypeScriptは`camelCase`（型は`PascalCase`）
- エラーハンドリング: Rustは`Result`型、TSは適切なtry-catch
- Tauri IPC コマンドは `commands/` 配下にモジュール分割
- 1ファイル1責務を意識、大きくなったら分割

## 開発ワークフロー

### ブランチ運用
- `feature/*` / `fix/*` / `chore/*` / `release/*`
- PRは squash merge（1 PR = 1 コミット）

### CI/CD
- **PR / master push**: Biome lint + TypeScript型チェック + Vitest（GitHub Actions）
- **タグ `v*` push**: Tauri ビルド + GitHub Release ドラフト作成

### pre-commit フック
- Husky + lint-staged でステージファイルに Biome check --write を自動適用

### リリース手順
1. バージョンを `package.json` / `tauri.conf.json` で更新
2. master にマージ
3. `git tag v0.x.x && git push --tags`
4. GitHub Actions が自動ビルド → Release ドラフト作成
5. Release ページでドラフトを確認・公開

## 重要な設計方針
- **パフォーマンス最優先**: 大量ファイル（10万件以上）でも快適に動作
- **キーボードファースト**: 全操作をキーボードで完結可能に
- **プラグイン拡張**: 将来的にプラグインシステムを導入可能な設計に
- **非同期処理**: ファイル操作はすべて非同期。UIをブロックしない
