import type { FileEntry, TidinessScore } from "../types";

const W_EXT = 0.3;
const W_AGE = 0.2;
const W_COUNT = 0.3;
const W_NEST = 0.2;

const NEUTRAL_NEST = 75;

/** S_ext: 拡張子の種類数スコア（0-100） */
function calcExtScore(entries: FileEntry[]): { score: number; extCount: number } {
  const files = entries.filter((e) => !e.is_dir);
  if (files.length <= 1) return { score: 100, extCount: files.length > 0 ? 1 : 0 };

  const exts = new Set<string>();
  for (const f of files) {
    exts.add(f.extension || "__none__");
  }
  const count = exts.size;
  const ratio = count / files.length;

  let score: number;
  if (count <= 2) score = 100;
  else if (count <= 4) score = 85;
  else if (count <= 6) score = 70;
  else if (count <= 10) score = 50;
  else if (count <= 15) score = 30;
  else score = Math.max(5, 30 - (count - 15) * 2);

  // 比率ボーナス
  if (ratio < 0.05) score = Math.min(100, score + 10);
  else if (ratio < 0.1) score = Math.min(100, score + 5);

  return { score, extCount: count };
}

/** S_age: 古いファイルの割合スコア（0-100） */
function calcAgeScore(entries: FileEntry[]): { score: number; oldCount: number } {
  const files = entries.filter((e) => !e.is_dir && e.modified > 0);
  if (files.length === 0) return { score: 100, oldCount: 0 };

  const now = Date.now() / 1000;
  const DAY = 86400;
  let count30 = 0;
  let count90 = 0;
  let count365 = 0;

  for (const f of files) {
    const age = now - f.modified;
    if (age > 30 * DAY) count30++;
    if (age > 90 * DAY) count90++;
    if (age > 365 * DAY) count365++;
  }

  const ratio30 = count30 / files.length;
  const ratio90 = count90 / files.length;
  const ratio365 = count365 / files.length;

  const penalty = ratio30 * 20 + ratio90 * 30 + ratio365 * 40;
  return { score: Math.max(0, Math.round(100 - penalty)), oldCount: count365 };
}

/** S_count: ファイル数の多さスコア（0-100） */
function calcCountScore(totalItems: number): number {
  if (totalItems <= 10) return 100;
  if (totalItems <= 30) return 90;
  if (totalItems <= 50) return 80;
  if (totalItems <= 100) return 65;
  if (totalItems <= 200) return 50;
  if (totalItems <= 500) return 30;
  if (totalItems <= 1000) return 15;
  return 5;
}

/** Phase A: フロントエンド即時計算（nest_scoreは中立値） */
export function calculateQuickTidiness(entries: FileEntry[]): TidinessScore {
  const { score: extScore, extCount } = calcExtScore(entries);
  const { score: ageScore, oldCount } = calcAgeScore(entries);
  const countScore = calcCountScore(entries.length);
  const fileCount = entries.filter((e) => !e.is_dir).length;
  const dirCount = entries.filter((e) => e.is_dir).length;

  const total = Math.round(
    W_EXT * extScore + W_AGE * ageScore + W_COUNT * countScore + W_NEST * NEUTRAL_NEST,
  );

  return {
    total,
    ext_score: extScore,
    age_score: ageScore,
    count_score: countScore,
    nest_score: NEUTRAL_NEST,
    ext_count: extCount,
    file_count: fileCount,
    dir_count: dirCount,
    max_depth: 0,
    old_file_count: oldCount,
  };
}

/** スコアに応じた色クラスを返す */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

/** スコアを★☆表示に変換（5段階） */
export function getStars(score: number): string {
  const filled = Math.round(score / 20);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}
