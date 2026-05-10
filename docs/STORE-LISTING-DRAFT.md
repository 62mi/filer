# Microsoft Store 掲載情報ドラフト

Partner Center → TomaFiler → **Store 登録情報** で入力する内容のドラフト。
日本語・英語の2言語分用意してある。実際の入力前に文言は調整してください。

---

## 共通設定

| 項目 | 値 | メモ |
|---|---|---|
| カテゴリ | Productivity | |
| サブカテゴリ | File managers | |
| プライバシーポリシー URL | (要設定) | `docs/PRIVACY-POLICY.md` を Web 公開した URL。GitHub Pages か Cloudflare R2 など |
| サポート連絡先 | tomako@tomatobiyori.com | |
| Web サイト | https://github.com/62mi/filer | |
| 著作権・商標情報 | © 2026 Tomako | |

---

## 日本語 (ja-JP)

### 製品名
```
TomaFiler
```

### 短い説明文 (200文字以下)
```
美しくて、ファイル整理が気持ちいいタブ型ファイラー。
タブ・キーボード操作・AI自動整理・スマートルールで、散らかったフォルダが快適に整います。
```

### 説明文 (3500文字以下)
```
TomaFiler は、ファイル整理を「退屈な作業」から「気持ちいい体験」へ変えるタブ型ファイラーです。

■ なぜ TomaFiler か

エクスプローラーの代替品ではなく、触った瞬間に「これは違う」と感じる独自の体験を目指しました。10万件のファイルがあっても快適に動く軽量設計、全操作をキーボードで完結できるショートカット、そして AI とルールによる自動整理。散らかっていたものが整っていく快感を、毎日のファイル管理に。

■ 主な機能

【タブ管理】
ブラウザ風のタブで複数フォルダを並行操作。タブをドラッグして並び替え、Ctrl+W で閉じる、Ctrl+Shift+T で再オープン。

【キーボードファースト】
すべての操作をキーボードで完結。Vim 風のナビゲーション、コマンドパレット (Ctrl+K) でファイル検索・コマンド実行。

【AI 自動整理】
Anthropic Claude API と連携し、ダウンロードフォルダなどの混沌を一瞬で整える。「このフォルダを整理して」と指示するだけ。
※ AI 機能の利用にはご自身の Anthropic API キーが必要です。

【スマートルール】
「.zip は ~/Downloads/Archives へ」のような条件ベース自動整理を GUI で設定。新規ファイルが到着するたびに自動適用。

【ドラッグ&ドロップで自動フォルダ化】
ファイル on ファイルでドロップすると自動でフォルダを作成。整理しながら構造を作っていける。

【クイックルック】
画像・テキスト・PDF・Markdown を Space キーで即座にプレビュー。ファイルを開かずに中身を確認。

【Undo / Redo】
ファイル操作を即座に取り消し・やり直し。誤った移動や削除も安心。

【コピーキュー】
大量ファイルのコピーをバックグラウンドで実行。一時停止・再開対応。

【ブックマークバー】
よく使うフォルダをワンクリックでジャンプ。ホットキーバインドも可能。

【グリッド/リスト表示】
画像フォルダはサムネイル付きグリッド、ドキュメントはリスト、と切替自在。

■ 動作環境

- Windows 10 (バージョン 2004 以降) または Windows 11
- 64bit (x64)
- WebView2 ランタイム（Windows 11 標準搭載）

■ プライバシー

本アプリは、AI 自動整理機能を有効にした場合のみファイル名等のメタ情報を Anthropic API に送信します。ファイルの中身は送信されません。広告・テレメトリ・第三者解析サービスは一切組み込まれていません。詳細はプライバシーポリシーをご覧ください。

■ オープンソース

TomaFiler は MIT ライセンスのオープンソースソフトウェアです。
ソースコード: https://github.com/62mi/filer
```

### 検索ターム (7個まで)
```
ファイラー
タブ型ファイラー
ファイル管理
エクスプローラー
ファイル整理
タブ
AI 整理
```

### システム要件
```
最低: Windows 10 (バージョン 2004 以降) / x64 / 4GB RAM / WebView2 ランタイム
推奨: Windows 11 / x64 / 8GB RAM
```

---

## 英語 (en-US)

### Product name
```
TomaFiler
```

### Short description (200 chars max)
```
A beautiful tabbed file manager that makes organizing files feel good.
Tabs, keyboard-first controls, AI-powered organization, and smart rules.
```

### Description (3500 chars max)
```
TomaFiler turns file management from a chore into a satisfying experience. It's a modern tabbed file manager built for people who want their files organized with the same care they bring to their code or their desk.

■ Why TomaFiler

Not just an Explorer replacement — TomaFiler aims to feel different from the moment you touch it. Lightweight enough to handle 100,000+ files smoothly, fully keyboard-navigable, and equipped with AI and rule-based automation. Watch your downloads folder become tidy in seconds.

■ Key Features

[Tab management]
Browser-style tabs for browsing multiple folders side by side. Drag to reorder, Ctrl+W to close, Ctrl+Shift+T to reopen.

[Keyboard-first]
Every action is keyboard-accessible. Vim-style navigation, plus a Ctrl+K command palette for quickly searching files and running commands.

[AI auto-organization]
Integrates with the Anthropic Claude API to clean up chaos in seconds. Just say "organize this folder."
* Requires your own Anthropic API key.

[Smart rules]
Set up condition-based auto-sorting in a GUI ("move all .zip files to ~/Downloads/Archives"). Rules apply automatically as new files arrive.

[Drag-and-drop into folders]
Drop a file onto another file to instantly create a folder containing both. Build structure while you organize.

[Quick Look]
Press Space to preview images, text, PDFs, and Markdown without opening any app.

[Undo / Redo]
Instantly undo or redo any file operation. Worry-free moves and deletes.

[Copy queue]
Run large copies in the background with pause/resume support.

[Bookmark bar]
One-click jump to your favorite folders. Hotkey bindings supported.

[Grid / List views]
Switch between thumbnail grids for image folders and lists for documents on the fly.

■ System Requirements

- Windows 10 (version 2004 or later) or Windows 11
- 64-bit (x64)
- WebView2 Runtime (built into Windows 11)

■ Privacy

When you opt in to AI auto-organization, file name metadata is sent to the Anthropic API. The contents of files are never sent. There are no ads, telemetry, or third-party analytics. See our Privacy Policy for details.

■ Open Source

TomaFiler is open source under the MIT license.
Source code: https://github.com/62mi/filer
```

### Search terms (up to 7)
```
file manager
tabbed file manager
explorer
file organizer
tabs
AI organize
keyboard-first
```

### System requirements
```
Minimum: Windows 10 (2004+) / x64 / 4GB RAM / WebView2 Runtime
Recommended: Windows 11 / x64 / 8GB RAM
```

---

## スクリーンショット要件

- **必須サイズ**: 1366×768 以上
- **推奨サイズ**: 1920×1080
- **最低枚数**: 1枚 / **最大**: 10枚
- **形式**: PNG または JPEG

### 撮影してほしい画面（優先順）

1. **メイン画面 (デュアルパネル + タブ)** — タブが複数開いていて、片側にグリッドビュー、もう片側にリストビュー
2. **AI 自動整理ダイアログ** — ダウンロードフォルダの分類提案が表示されている状態
3. **コマンドパレット (Ctrl+K)** — 検索結果が出ている状態
4. **スマートルール管理画面** — ルールがいくつか登録されている状態
5. **クイックルック** — 画像プレビューが開いている状態
6. **ブックマークバー** — よく使うパスが並んでいる
7. **コピーキュー** — 進行中のコピー操作が見える状態
8. **設定画面 / テーマ切替** — ダーク・ライトテーマ両方を見せる場合

撮影時の Tips:
- ウィンドウサイズを 1920×1080 に固定（`pnpm tauri dev` で起動後に手動でリサイズ）
- 個人情報が映らないようにダミーフォルダ構成を使う
- ダーク背景のスクリーンショットの方がストアで映える

---

## 年齢区分 (IARC)

Partner Center で IARC アンケートに回答する。TomaFiler は機能的に該当するものがないため、すべて「該当なし」を選んでいけば最低区分（3歳以上 / 全年齢）になる。

回答指針:
- 暴力表現: なし
- 性的表現: なし
- 不適切な言語: なし
- ギャンブル: なし
- ユーザー生成コンテンツ: なし（ファイル管理は含まれない）
- データ収集: あり（Anthropic API 送信について「機能のために必要なデータ送信」を選択）
- ユーザー間通信: なし

---

## 提出前チェックリスト

- [ ] プライバシーポリシーを Web 公開し、URL を取得
- [ ] スクリーンショット 5枚以上を 1920×1080 で撮影
- [ ] アプリ説明文（日英）を Partner Center に貼り付け
- [ ] カテゴリを Productivity / File managers に設定
- [ ] 年齢区分 IARC アンケート完了
- [ ] 価格を Free に設定、Markets を Japan + 必要なら他国
- [ ] WACK 検証通過（パッケージアップロード時に自動）
