/**
 * D1 storage for each user's own data: review log, card states, "不做" overrides, notes, settings, and the practice sets
 * of the one-by-one practice page, which is gone; their rows stay for the backup.
 * Every table has a user_id and every query below filters or writes by it, so users never see each other's rows.
 */
import { cardFrom, NEW_CARD, type CardState, type Grade } from "./srs";
import type { Review } from "./stats";
import { shanghaiIso, studyDay, type Day } from "./studyday";

type CardRow = { num: number; level: number; due: string | null; last_grade: string | null; reps: number; lapses: number };
type ReviewRow = { num: number; grade: Grade; reviewed_at: string; study_day: string; mode: string };

const toCard = (r: CardRow): CardState =>
  ({ level: r.level, due: r.due, lastGrade: r.last_grade as Grade | null, reps: r.reps, lapses: r.lapses });
const toReview = (r: ReviewRow): Review =>
  ({ num: r.num, grade: r.grade, reviewedAt: r.reviewed_at, studyDay: r.study_day, mode: r.mode });

export async function getCard(db: D1Database, uid: number, num: number): Promise<CardState> {
  const row = await db.prepare("SELECT * FROM cards WHERE user_id = ? AND num = ?").bind(uid, num).first<CardRow>();
  return row ? toCard(row) : NEW_CARD;
}

export async function allCards(db: D1Database, uid: number): Promise<Map<number, CardState>> {
  const { results } = await db.prepare("SELECT * FROM cards WHERE user_id = ? ORDER BY num").bind(uid).all<CardRow>();
  return new Map(results.map((r) => [r.num, toCard(r)]));
}

export interface ReviewInput {
  num: number;
  grade: Grade;
  at: Date;
  mode: string;
}

/**
 * Grade a question. The first grade of a study day is a new review. Grading it again that day changes that review
 * instead, so a misclick is put right rather than counted twice: the card is worked out again from the days before,
 * and the review keeps its time and mode. The same grade again changes nothing, so a double click is one review.
 */
export async function recordReview(db: D1Database, uid: number, input: ReviewInput): Promise<CardState> {
  const day = studyDay(input.at);
  const historySql = "SELECT id, grade, study_day FROM reviews WHERE user_id = ? AND num = ? ORDER BY reviewed_at, id";
  const snapshotSql = `(SELECT json_group_array(json_array(id, grade, study_day)) FROM (${historySql}))`;
  // A D1 batch is atomic, but a read before the batch can become stale. Only write if the history still matches;
  // otherwise retry from the newly committed history. This also covers requests straddling the 04:00 boundary.
  for (let attempt = 0; attempt < 8; attempt++) {
    const { results: history } = await db.prepare(historySql).bind(uid, input.num)
      .all<{ id: number; grade: Grade; study_day: Day }>();
    const sameDay = history.filter((r) => r.study_day === day);
    const snapshot = JSON.stringify(history.map((r) => [r.id, r.grade, r.study_day]));
    const updated: [Grade, Day][] = history.filter((r) => r.study_day !== day).map((r) => [r.grade, r.study_day]);
    updated.push([input.grade, day]);
    updated.sort((a, b) => a[1].localeCompare(b[1]));
    const card = cardFrom(updated);
    const log = sameDay.length
      ? db.prepare(`UPDATE reviews SET grade = ? WHERE user_id = ? AND id = ? AND ${snapshotSql} = ?`)
        .bind(input.grade, uid, sameDay[0].id, uid, input.num, snapshot)
      : db.prepare("INSERT INTO reviews (user_id, num, grade, reviewed_at, study_day, mode) SELECT ?, ?, ?, ?, ?, ? "
        + `WHERE ${snapshotSql} = ?`)
        .bind(uid, input.num, input.grade, shanghaiIso(input.at), day, input.mode, uid, input.num, snapshot);
    const [written] = await db.batch([
      log,
      // changes() refers to the preceding statement on this same batch/connection. A failed comparison must
      // change neither the card nor any duplicate reviews. Keep these statements adjacent and in this order.
      db.prepare("INSERT INTO cards (user_id, num, level, due, last_grade, reps, lapses) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1 "
        + "ON CONFLICT (user_id, num) DO UPDATE SET level = excluded.level, due = excluded.due, "
        + "last_grade = excluded.last_grade, reps = excluded.reps, lapses = excluded.lapses")
        .bind(uid, input.num, card.level, card.due, card.lastGrade, card.reps, card.lapses),
      db.prepare("DELETE FROM reviews WHERE user_id = ? AND num = ? AND study_day = ? AND id <> ? AND changes() = 1")
        .bind(uid, input.num, day, sameDay[0]?.id ?? -1),
    ].slice(0, sameDay.length ? 3 : 2));
    if (written.meta.changes === 1) return card;
  }
  throw new Error("评价同时更新过于频繁，请重试");
}

/** The grade each question got on a study day (the last one, if it was graded more than once). */
export async function gradedOn(db: D1Database, uid: number, day: Day): Promise<Map<number, Grade>> {
  const { results } = await db.prepare("SELECT num, grade FROM reviews WHERE user_id = ? AND study_day = ? ORDER BY reviewed_at, id")
    .bind(uid, day).all<{ num: number; grade: Grade }>();
  return new Map(results.map((r) => [r.num, r.grade]));
}

export async function reviewLog(db: D1Database, uid: number, since?: Day): Promise<Review[]> {
  const stmt = since
    ? db.prepare("SELECT * FROM reviews WHERE user_id = ? AND study_day >= ? ORDER BY reviewed_at, id").bind(uid, since)
    : db.prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY reviewed_at, id").bind(uid);
  return (await stmt.all<ReviewRow>()).results.map(toReview);
}

/** Today's reviews plus the last N days with actual activity, even after a long break. */
export async function warmupLog(db: D1Database, uid: number, day: Day, days: number): Promise<Review[]> {
  const { results } = await db.prepare("SELECT * FROM reviews WHERE user_id = ? AND (study_day = ? OR study_day IN "
    + "(SELECT DISTINCT study_day FROM reviews WHERE user_id = ? AND study_day < ? ORDER BY study_day DESC LIMIT ?)) ORDER BY reviewed_at, id")
    .bind(uid, day, uid, day, days).all<ReviewRow>();
  return results.map(toReview);
}

export async function historyFor(db: D1Database, uid: number, num: number): Promise<Review[]> {
  const { results } = await db.prepare("SELECT * FROM reviews WHERE user_id = ? AND num = ? ORDER BY reviewed_at, id")
    .bind(uid, num).all<ReviewRow>();
  return results.map(toReview);
}

/** Each question's reviews, oldest first, batched within D1's parameter limit. */
export async function historiesFor(db: D1Database, uid: number, nums: number[]): Promise<Map<number, Review[]>> {
  const found = new Map<number, Review[]>(nums.map((n) => [n, []]));
  if (!nums.length) return found;
  // D1 allows 100 bound parameters; reserve one for the account.
  const unique = [...found.keys()];
  for (let start = 0; start < unique.length; start += 99) {
    const batch = unique.slice(start, start + 99);
    const { results } = await db.prepare(`SELECT * FROM reviews WHERE user_id = ? AND num IN (${batch.map(() => "?").join(",")}) ORDER BY reviewed_at, id`)
      .bind(uid, ...batch).all<ReviewRow>();
    for (const r of results) found.get(r.num)?.push(toReview(r));
  }
  return found;
}

export async function setExcluded(db: D1Database, uid: number, nums: number[], excluded: boolean): Promise<void> {
  if (!nums.length) return;
  await db.batch(nums.map((n) => db.prepare(
    "INSERT INTO exclusions (user_id, num, is_excluded) VALUES (?, ?, ?) "
    + "ON CONFLICT (user_id, num) DO UPDATE SET is_excluded = excluded.is_excluded",
  ).bind(uid, n, excluded ? 1 : 0)));
}

export async function exclusionOverrides(db: D1Database, uid: number): Promise<Map<number, boolean>> {
  const { results } = await db.prepare("SELECT * FROM exclusions WHERE user_id = ? ORDER BY num")
    .bind(uid).all<{ num: number; is_excluded: number }>();
  return new Map(results.map((r) => [r.num, r.is_excluded === 1]));
}

/** The notes of these questions; a question without a note is left out. */
export async function notesFor(db: D1Database, uid: number, nums: number[]): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  // D1 allows 100 bound parameters; reserve one for the account.
  for (let start = 0; start < nums.length; start += 99) {
    const batch = nums.slice(start, start + 99);
    const { results } = await db.prepare(`SELECT num, body FROM notes WHERE user_id = ? AND num IN (${batch.map(() => "?").join(",")})`)
      .bind(uid, ...batch).all<{ num: number; body: string }>();
    for (const r of results) found.set(r.num, r.body);
  }
  return found;
}

/** Replace a question's note; a blank one removes it. */
export async function setNote(db: D1Database, uid: number, num: number, body: string, at = new Date()): Promise<void> {
  if (!body.trim()) {
    await db.prepare("DELETE FROM notes WHERE user_id = ? AND num = ?").bind(uid, num).run();
    return;
  }
  await db.prepare("INSERT INTO notes (user_id, num, body, updated_at) VALUES (?, ?, ?, ?) "
    + "ON CONFLICT (user_id, num) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at")
    .bind(uid, num, body, shanghaiIso(at)).run();
}

export async function getSetting(db: D1Database, uid: number, key: string, fallback: string): Promise<string> {
  return (await db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = ?").bind(uid, key).first<string>("value")) ?? fallback;
}

export async function setSetting(db: D1Database, uid: number, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) "
    + "ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value")
    .bind(uid, key, value).run();
}

const TABLES = ["reviews", "cards", "exclusions", "sessions", "settings", "notes"] as const;

export async function exportAll(db: D1Database, uid: number, at = new Date()) {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { results } = await db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(uid).all<Record<string, unknown>>();
    // The user id is how the site keeps accounts apart, not part of what the user learned.
    tables[table] = results.map(({ user_id: _owner, ...row }) => row);
  }
  return { exported_at: shanghaiIso(at), tables };
}
