/**
 * D1 storage for each user's own data: review log, card states, "不做" overrides, practice sessions, settings.
 * Every table has a user_id and every query below filters or writes by it, so users never see each other's rows.
 */
import { NEW_CARD, schedule, type CardState, type Grade } from "./srs";
import type { Review } from "./stats";
import { shanghaiIso, studyDay, type Day } from "./studyday";

export interface PracticeSession {
  id: number;
  title: string;
  mode: string;
  queue: number[];
  position: number;
  createdAt: string;
  finishedAt: string | null;
}

export const current = (s: PracticeSession): number | null => (s.position < s.queue.length ? s.queue[s.position] : null);

type CardRow = { num: number; level: number; due: string | null; last_grade: string | null; reps: number; lapses: number };
type ReviewRow = { num: number; grade: Grade; reviewed_at: string; study_day: string; mode: string };
type SessionRow = { id: number; title: string; mode: string; queue: string; position: number; created_at: string; finished_at: string | null };

const toCard = (r: CardRow): CardState =>
  ({ level: r.level, due: r.due, lastGrade: r.last_grade as Grade | null, reps: r.reps, lapses: r.lapses });
const toReview = (r: ReviewRow): Review =>
  ({ num: r.num, grade: r.grade, reviewedAt: r.reviewed_at, studyDay: r.study_day, mode: r.mode });
const toSession = (r: SessionRow): PracticeSession => ({
  id: r.id, title: r.title, mode: r.mode, queue: JSON.parse(r.queue), position: r.position,
  createdAt: r.created_at, finishedAt: r.finished_at,
});

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
  /** When given, the session moves on to its next question in the same batch. */
  session?: PracticeSession;
}

function advanceStatement(db: D1Database, uid: number, session: PracticeSession, at: Date): D1PreparedStatement {
  const position = Math.min(session.position + 1, session.queue.length);
  const finished = position >= session.queue.length ? shanghaiIso(at) : null;
  return db.prepare("UPDATE sessions SET position = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ? AND user_id = ?")
    .bind(position, finished, session.id, uid);
}

export async function recordReview(db: D1Database, uid: number, input: ReviewInput): Promise<CardState> {
  const day = studyDay(input.at);
  const card = schedule(await getCard(db, uid, input.num), input.grade, day);
  const statements = [
    db.prepare("INSERT INTO reviews (user_id, num, grade, reviewed_at, study_day, mode, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(uid, input.num, input.grade, shanghaiIso(input.at), day, input.mode, input.session?.id ?? null),
    db.prepare("INSERT INTO cards (user_id, num, level, due, last_grade, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?) "
      + "ON CONFLICT (user_id, num) DO UPDATE SET level = excluded.level, due = excluded.due, "
      + "last_grade = excluded.last_grade, reps = excluded.reps, lapses = excluded.lapses")
      .bind(uid, input.num, card.level, card.due, card.lastGrade, card.reps, card.lapses),
  ];
  if (input.session) statements.push(advanceStatement(db, uid, input.session, input.at));
  await db.batch(statements);
  return card;
}

export async function advanceSession(db: D1Database, uid: number, session: PracticeSession, at: Date): Promise<void> {
  await advanceStatement(db, uid, session, at).run();
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

export async function sessionGrades(db: D1Database, uid: number, sid: number): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT grade, COUNT(*) AS n FROM reviews WHERE user_id = ? AND session_id = ? GROUP BY grade")
    .bind(uid, sid).all<{ grade: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.grade, r.n]));
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

export async function createSession(
  db: D1Database, uid: number, title: string, mode: string, queue: number[], at: Date,
): Promise<number> {
  const stamp = shanghaiIso(at);
  const result = await db.prepare(
    "INSERT INTO sessions (user_id, title, mode, queue, position, created_at, finished_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
    .bind(uid, title, mode, JSON.stringify(queue), stamp, queue.length ? null : stamp).run();
  return Number(result.meta.last_row_id);
}

export async function getSession(db: D1Database, uid: number, sid: number): Promise<PracticeSession | null> {
  const row = await db.prepare("SELECT * FROM sessions WHERE user_id = ? AND id = ?").bind(uid, sid).first<SessionRow>();
  return row ? toSession(row) : null;
}

export async function latestOpenSession(db: D1Database, uid: number): Promise<PracticeSession | null> {
  const row = await db.prepare("SELECT * FROM sessions WHERE user_id = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1")
    .bind(uid).first<SessionRow>();
  return row ? toSession(row) : null;
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
