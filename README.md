# Filer

Windows向けのタブ型ファイルマネージャー。軽量・高速・キーボード操作重視。

## 主要機能

- **タブ管理** — ブラウザ風タブでフォルダを並行操作
- **キーボードファースト** — 全操作をキーボードで完結可能
- **仮置きシェルフ** — ファイルを一時置きして別タブへ移動
- **ドラッグ&ドロップ** — ファイル on ファイルで自動フォルダ化
- **Undo/Redo** — ファイル操作を即座に取り消し・やり直し
- **クイックルック** — Space キーで画像・テキストを即座にプレビュー
- **ブックマークバー** — よく使うフォルダへワンクリックジャンプ
- **スマートルール** — 条件ベースのファイル自動整理
- **AI自動整理** — Claude API連携でフォルダを自動分類
- **グリッド/リスト表示** — サムネイル付きグリッドビュー対応

## 技術スタック

| 分類 | 技術 |
|------|------|
| バックエンド | Rust + Tauri v2 |
| フロントエンド | React 19 + TypeScript |
| ビルド | Vite |
| スタイリング | Tailwind CSS v4 |
| 状態管理 | Zustand |
| リンター | Biome |

## セットアップ

### 必要環境

- Node.js 20+
- pnpm 10+
- Rust (stable)
- Visual Studio Build Tools (MSVC)

### インストール

```bash
pnpm install
```

### 開発

```bash
pnpm tauri dev
```

### ビルド

```bash
pnpm tauri build
```

### テスト

```bash
pnpm test          # フロントエンド
cd src-tauri && cargo test  # バックエンド
```

### リント

```bash
pnpm lint          # Biome チェック
pnpm lint:fix      # 自動修正
```

## ライセンス

MIT
