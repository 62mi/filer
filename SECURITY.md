# Security Policy

## サポート対象バージョン

最新のリリース版のみサポートします。脆弱性報告をいただいた際には、最新バージョンで再現するかを確認してください。

## 脆弱性の報告

セキュリティ上の脆弱性を発見された場合、**公開の GitHub Issue には投稿しないでください**。代わりに以下のいずれかで非公開に報告してください。

- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/62mi/filer/security/advisories/new)
- **メール**: tomako@tomatobiyori.com

報告には以下を含めていただけると助かります。

- 脆弱性の概要と影響範囲
- 再現手順
- 影響を受けるバージョン
- 可能であれば修正案

可能な限り速やかに返信し、修正の方向性をご連絡します。

## スコープ

TomaFiler はローカルファイル操作を行うデスクトップアプリです。以下のような経路を特に重視します。

- パストラバーサル（`..` を含むパス操作等）
- ファイル名検証のバイパス
- AI 機能で使う Claude API キーの取り扱い（keyring / Windows Credential Manager 経由で保存）
- Tauri IPC コマンドの入力検証不備
