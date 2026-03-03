#!/usr/bin/env node
/**
 * バージョン一括更新スクリプト
 *
 * 以下の3ファイルのバージョンを一括更新し、CHANGELOG.mdに雛形を挿入する:
 * - package.json
 * - src-tauri/Cargo.toml
 * - src-tauri/tauri.conf.json
 *
 * Usage: pnpm bump <version>
 * Example: pnpm bump 1.5.0
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const version = process.argv[2];

if (!version) {
  console.error("Error: バージョン番号を指定してください");
  console.error("Usage: pnpm bump <version>");
  console.error("Example: pnpm bump 1.5.0");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Error: 無効なバージョン形式です: ${version}`);
  console.error("semver形式 (例: 1.5.0) で指定してください");
  process.exit(1);
}

const files = [
  {
    path: resolve(root, "package.json"),
    name: "package.json",
    update(content) {
      const json = JSON.parse(content);
      const old = json.version;
      json.version = version;
      return { content: `${JSON.stringify(json, null, 2)}\n`, old };
    },
  },
  {
    path: resolve(root, "src-tauri/Cargo.toml"),
    name: "Cargo.toml",
    update(content) {
      const match = content.match(/^version\s*=\s*"([^"]+)"/m);
      const old = match ? match[1] : "unknown";
      return {
        content: content.replace(
          /^(version\s*=\s*)"[^"]+"/m,
          `$1"${version}"`,
        ),
        old,
      };
    },
  },
  {
    path: resolve(root, "src-tauri/tauri.conf.json"),
    name: "tauri.conf.json",
    update(content) {
      const json = JSON.parse(content);
      const old = json.version;
      json.version = version;
      return { content: `${JSON.stringify(json, null, 2)}\n`, old };
    },
  },
];

console.log(`\nバージョンを ${version} に更新します...\n`);

for (const file of files) {
  const content = readFileSync(file.path, "utf-8");
  const { content: updated, old } = file.update(content);
  writeFileSync(file.path, updated);
  console.log(`  ${file.name}: ${old} → ${version}`);
}

// CHANGELOG.md に新セクション雛形を挿入
const changelogPath = resolve(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf-8");

const today = new Date().toISOString().split("T")[0];
const newSection = `## [${version}] - ${today}\n\n### Added\n\n### Fixed\n\n### Changed\n`;

if (changelog.includes(`## [${version}]`)) {
  console.log(`\n  CHANGELOG.md: v${version} セクションは既に存在します（スキップ）`);
} else {
  const updated = changelog.replace(
    /^(## \[Unreleased\]\s*)$/m,
    `$1\n${newSection}`,
  );
  writeFileSync(changelogPath, updated);
  console.log(`  CHANGELOG.md: v${version} セクション雛形を挿入`);
}

console.log(`
次のステップ:
  1. CHANGELOG.md に変更内容を記入
  2. git add -A && git commit -m "chore: bump version to v${version}"
  3. git tag -a v${version} -m "v${version}"
  4. git push origin master --tags
`);
