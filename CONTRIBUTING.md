# Contributing

TomaFiler へのコントリビューションありがとうございます。

## 始める前に

まず [README の Philosophy セクション](./README.md#philosophy) を読んでください。TomaFiler が大切にしている思想を理解した上でコントリビューションをお願いします。

## Issue

- バグ報告や機能リクエストは [GitHub Issues](https://github.com/62mi/filer/issues) から
- 大きな変更を始める前に、Issue で方向性を相談してください

## Pull Request

1. リポジトリをフォーク
2. feature ブランチを作成（`feat/機能名` や `fix/バグ名`）
3. 変更をコミット
4. PR を作成

### コードの品質基準

PRは以下を満たす必要があります：

```bash
pnpm check    # Biome lint + TypeScript 型チェック（エラー0件）
pnpm test     # テスト通過
```

### コーディング規約

- **TypeScript**: camelCase（型は PascalCase）
- **Rust**: snake_case
- **コンポーネント**: function 宣言 + named export
- **エラーハンドリング**: Rust は `Result` 型、TS は try-catch + `toast.error()`
- **非同期処理**: ファイル操作はすべて非同期。UI をブロックしない
- **日本語コメント OK**

### 思想に沿った変更を

以下のような変更を歓迎します：

- パフォーマンスの改善
- キーボード操作の拡充
- ファイル整理体験の向上
- バグ修正

以下のような変更は慎重に検討します：

- 大量の依存関係を追加する変更（軽量性を損なう）
- UI の大幅な変更（デザインの一貫性を確認する必要がある）

## 開発環境

Windows + MSVC 環境が必要です。詳しいセットアップは [README](./README.md#セットアップ) を参照してください。

## ライセンス

コントリビューションは [MIT ライセンス](./LICENSE) の下で提供されます。
