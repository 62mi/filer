# TomaFiler プライバシーポリシー

最終更新日: 2026-05-10

TomaFiler（以下「本アプリ」）は、ユーザーのプライバシーを尊重し、収集・送信する
情報を最小限に留めることを基本方針としています。本ポリシーは本アプリがどのような
情報を扱うかを説明します。

---

## 1. ローカルに保存される情報

本アプリは以下の情報を **ユーザーの端末内のみ** に保存します。これらは外部に送信されません。

| 種類 | 保存場所 | 内容 |
|---|---|---|
| 操作履歴 | `%APPDATA%\com.filer.app\move_history.db` (SQLite) | ファイルの移動・コピー・リネーム履歴（Undo 用） |
| ルール定義 | 同上 | ユーザーが作成した自動整理ルール |
| ブックマーク・設定 | 同上 | 表示設定・お気に入りパス・ブックマーク |
| AI 使用量 | 同上 | Claude API のトークン使用量（コスト管理用） |
| サムネイル/アイコンキャッシュ | プロセス内メモリのみ | 一覧表示の高速化用 |
| API キー | Windows 資格情報マネージャー (Credential Manager) | Anthropic API キー（OS の暗号化機構で保護） |

本アプリのアンインストール時にこれらの情報を削除したい場合は、
`%APPDATA%\com.filer.app\` フォルダを手動で削除してください。

---

## 2. 外部に送信される情報

本アプリは **AI 自動整理機能を有効にした場合のみ**、ユーザーの明示的な操作に応じて
以下の情報を Anthropic 社の API (`https://api.anthropic.com`) に送信します。

| 送信されるもの | 用途 | 送信先 |
|---|---|---|
| 整理対象のファイル名 / ディレクトリ名 / ファイル拡張子 | AI による分類・移動先提案 | Anthropic API |
| ユーザーが入力した整理指示テキスト | 同上 | 同上 |
| ファイルメタ情報（サイズ・更新日時） | 同上 | 同上 |

**送信されないもの**:
- ファイルの中身（バイナリ・テキスト本文ともに送信しません）
- ユーザー名・メールアドレス・端末識別子等の個人情報
- システム外のパス情報

Anthropic 社の API 利用に関するプライバシー方針は同社の
[Privacy Policy](https://www.anthropic.com/legal/privacy) を参照してください。

AI 機能はデフォルトで無効化されており、利用するためにはユーザーが自身の Anthropic API キーを設定し、
かつ各操作で明示的に AI 整理を実行する必要があります。

---

## 3. 第三者への情報提供

本アプリは、上記 Anthropic 社（AI 機能利用時のみ）以外に、いかなる第三者にも
ユーザーの情報を提供しません。広告ネットワーク・分析サービス・テレメトリ収集等は
一切組み込まれていません。

---

## 4. クラッシュレポート / テレメトリ

本アプリはクラッシュレポートやテレメトリを送信しません。エラーが発生した場合は
ユーザーの端末内でログとして記録されるのみで、自動的な外部送信は行いません。

---

## 5. お問い合わせ

本ポリシーに関するご質問や、ご自身のデータに関するご要望は以下にご連絡ください。

- メール: tomako@tomatobiyori.com
- GitHub Issues: https://github.com/62mi/filer/issues

---

## 6. ポリシーの変更

本ポリシーは予告なく変更されることがあります。変更があった場合は本ファイルの
「最終更新日」を更新します。重要な変更がある場合はリリースノートでも告知します。

---

# Privacy Policy (English)

Last updated: 2026-05-10

TomaFiler (hereinafter "the App") respects user privacy and minimizes the information
it collects and transmits. This policy describes what information the App handles.

## 1. Information Stored Locally

The App stores the following information **only on the user's device**. None of this
data is transmitted externally.

| Type | Location | Content |
|---|---|---|
| Operation history | `%APPDATA%\com.filer.app\move_history.db` (SQLite) | File move/copy/rename history (for Undo) |
| Rule definitions | Same as above | User-defined auto-organization rules |
| Bookmarks and settings | Same as above | Display preferences, favorite paths, bookmarks |
| AI usage | Same as above | Token usage of Claude API (for cost management) |
| Thumbnail/icon cache | In-process memory only | For fast list rendering |
| API key | Windows Credential Manager | Anthropic API key (protected by OS encryption) |

To delete this information when uninstalling the App, manually remove the
`%APPDATA%\com.filer.app\` folder.

## 2. Information Sent Externally

**Only when the AI auto-organization feature is enabled**, and in response to
explicit user actions, the App sends the following to Anthropic's API
(`https://api.anthropic.com`):

| Sent | Purpose | Destination |
|---|---|---|
| Names of target files/directories and extensions | AI-based classification and move suggestions | Anthropic API |
| User-entered organization instructions | Same as above | Same as above |
| File metadata (size, modification date) | Same as above | Same as above |

**Not sent**:
- File contents (neither binary nor text bodies)
- Personal information (username, email, device ID, etc.)
- Path information outside the system

For Anthropic's API privacy practices, see their
[Privacy Policy](https://www.anthropic.com/legal/privacy).

The AI feature is disabled by default. To use it, users must configure their own
Anthropic API key and explicitly invoke AI organization for each operation.

## 3. Third-Party Disclosure

The App does not provide user information to any third party other than Anthropic
(only when AI features are used). It contains no advertising networks, analytics
services, or telemetry collection.

## 4. Crash Reports / Telemetry

The App does not send crash reports or telemetry. Errors are logged only on the
user's device and are never automatically transmitted externally.

## 5. Contact

For questions about this policy or requests regarding your data, please contact:

- Email: tomako@tomatobiyori.com
- GitHub Issues: https://github.com/62mi/filer/issues

## 6. Changes to This Policy

This policy may be changed without notice. The "Last updated" date in this file
will reflect any changes. Significant changes will also be announced in release notes.
