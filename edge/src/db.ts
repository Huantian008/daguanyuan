/**
 * D1 storage for each user's own data: review log, card states, "不做" overrides, settings, and the practice sets
 * of the one-by-one practice page, which is gone; their rows stay for the backup.
 * Every table has a user_id and every query below filters or writes by it, so users never see each other's rows.
 */
import { cardFrom, NEW_CARD, schedule, type CardState, type Grade } from "./srs";
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
  const [{ results: history }, current] = await Promise.all([
    db.prepare("SELECT id, grade, study_day FROM reviews WHERE user_id = ? AND num = ? ORDER BY reviewed_at, id")
      .bind(uid, input.num).all<{ id: number; grade: Grade; study_day: Day }>(),
    getCard(db, uid, input.num),
  ]);
  const sameDay = history.filter((r) => r.study_day === day);
  if (sameDay.length && sameDay[sameDay.length - 1].grade === input.grade) return current;
  const card = sameDay.length
    ? schedule(cardFrom(history.filter((r) => r.study_day < day).map((r): [Grade, Day] => [r.grade, r.study_day])), input.grade, day)
    : schedule(current, input.grade, day);
  const log = sameDay.length
    ? [
      db.prepare("UPDATE reviews SET grade = ? WHERE user_id = ? AND id = ?").bind(input.grade, uid, sameDay[0].id),
      // a double click can leave two reviews of the day; the changed one is all that stays
      db.prepare("DELETE FROM reviews WHERE user_id = ? AND num = ? AND study_day = ? AND id <> ?").bind(uid, input.num, day, sameDay[0].id),
    ]
    : [
      db.prepare("INSERT INTO reviews (user_id, num, grade, reviewed_at, study_day, mode) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(uid, input.num, input.grade, shanghaiIso(input.at), day, input.mode),
    ];
  await db.batch([
    ...log,
    db.prepare("INSERT INTO cards (user_id, num, level, due, last_grade, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?) "
      + "ON CONFLICT (user_id, num) DO UPDATE SET level = excluded.level, due = excluded.due, "
      + "last_grade = excluded.last_grade, reps = excluded.reps, lapses = excluded.lapses")
      .bind(uid, input.num, card.level, card.due, card.lastGrade, card.reps, card.lapses),
  ]);
  return card;
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

export async function historyFor(db: D1Database, uid: number, num: number): Promise<Review[]> {
  const { results } = await db.prepare("SELECT * FROM reviews WHERE user_id = ? AND num = ? ORDER BY reviewed_at, id")
    .bind(uid, num).all<ReviewRow>();
  return results.map(toReview);
}

/** Each question's reviews, oldest first, in one query. */
export async function historiesFor(db: D1Database, uid: number, nums: number[]): Promise<Map<number, Review[]>> {
  const found = new Map<number, Review[]>(nums.map((n) => [n, []]));
  if (!nums.length) return found;
  const { results } = await db.prepare(`SELECT * FROM reviews WHERE user_id = ? AND num IN (${nums.map(() => "?").join(",")}) ORDER BY reviewed_at, id`)
    .bind(uid, ...nums).all<ReviewRow>();
  for (const r of results) found.get(r.num)?.push(toReview(r));
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

export async function getSetting(db: D1Database, uid: number, key: string, fallback: string): Promise<string> {
  return (await db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = ?").bind(uid, key).first<string>("value")) ?? fallback;
}

export async function setSetting(db: D1Database, uid: number, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) "
    + "ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value")
    .bind(uid, key, value).run();
}

const TABLES = ["reviews", "cards", "exclusions", "sessions", "settings"] as const;

export async function exportAll(db: D1Database, uid: number, at = new Date()) {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { results } = await db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(uid).all<Record<string, unknown>>();
    // The user id is how the site keeps accounts apart, not part of what the user learned.
    tables[table] = results.map(({ user_id: _owner, ...row }) => row);
  }
  return { exported_at: shanghaiIso(at), tables };
}
