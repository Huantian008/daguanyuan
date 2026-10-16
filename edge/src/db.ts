/** D1 storage for the user's own data: review log, card states, "不做" overrides, practice sessions, settings. */
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
type ReviewRow = { num: number; grade: Grade; reviewed_at: string; study_day: string; elapsed_sec: number | null; mode: string };
type SessionRow = { id: number; title: string; mode: string; queue: string; position: number; created_at: string; finished_at: string | null };

const toCard = (r: CardRow): CardState =>
  ({ level: r.level, due: r.due, lastGrade: r.last_grade as Grade | null, reps: r.reps, lapses: r.lapses });
const toReview = (r: ReviewRow): Review =>
  ({ num: r.num, grade: r.grade, reviewedAt: r.reviewed_at, studyDay: r.study_day, elapsedSec: r.elapsed_sec, mode: r.mode });
const toSession = (r: SessionRow): PracticeSession => ({
  id: r.id, title: r.title, mode: r.mode, queue: JSON.parse(r.queue), position: r.position,
  createdAt: r.created_at, finishedAt: r.finished_at,
});

export async function getCard(db: D1Database, num: number): Promise<CardState> {
  const row = await db.prepare("SELECT * FROM cards WHERE num = ?").bind(num).first<CardRow>();
  return row ? toCard(row) : NEW_CARD;
}

export async function allCards(db: D1Database): Promise<Map<number, CardState>> {
  const { results } = await db.prepare("SELECT * FROM cards ORDER BY num").all<CardRow>();
  return new Map(results.map((r) => [r.num, toCard(r)]));
}

export interface ReviewInput {
  num: number;
  grade: Grade;
  at: Date;
  elapsedSec: number | null;
  mode: string;
  /** When given, the session moves on to its next question in the same batch. */
  session?: PracticeSession;
}

function advanceStatement(db: D1Database, session: PracticeSession, at: Date): D1PreparedStatement {
  const position = Math.min(session.position + 1, session.queue.length);
  const finished = position >= session.queue.length ? shanghaiIso(at) : null;
  return db.prepare("UPDATE sessions SET position = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ?")
    .bind(position, finished, session.id);
}

export async function recordReview(db: D1Database, input: ReviewInput): Promise<CardState> {
  const day = studyDay(input.at);
  const card = schedule(await getCard(db, input.num), input.grade, day);
  const statements = [
    db.prepare("INSERT INTO reviews (num, grade, reviewed_at, study_day, elapsed_sec, mode, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(input.num, input.grade, shanghaiIso(input.at), day, input.elapsedSec, input.mode, input.session?.id ?? null),
    db.prepare("INSERT INTO cards (num, level, due, last_grade, reps, lapses) VALUES (?, ?, ?, ?, ?, ?) "
      + "ON CONFLICT (num) DO UPDATE SET level = excluded.level, due = excluded.due, "
      + "last_grade = excluded.last_grade, reps = excluded.reps, lapses = excluded.lapses")
      .bind(input.num, card.level, card.due, card.lastGrade, card.reps, card.lapses),
  ];
  if (input.session) statements.push(advanceStatement(db, input.session, input.at));
  await db.batch(statements);
  return card;
}

export async function advanceSession(db: D1Database, session: PracticeSession, at: Date): Promise<void> {
  await advanceStatement(db, session, at).run();
}

export async function reviewLog(db: D1Database, since?: Day): Promise<Review[]> {
  const stmt = since
    ? db.prepare("SELECT * FROM reviews WHERE study_day >= ? ORDER BY reviewed_at, id").bind(since)
    : db.prepare("SELECT * FROM reviews ORDER BY reviewed_at, id");
  return (await stmt.all<ReviewRow>()).results.map(toReview);
}

export async function historyFor(db: D1Database, num: number): Promise<Review[]> {
  const { results } = await db.prepare("SELECT * FROM reviews WHERE num = ? ORDER BY reviewed_at, id").bind(num).all<ReviewRow>();
  return results.map(toReview);
}

export async function sessionGrades(db: D1Database, sid: number): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT grade, COUNT(*) AS n FROM reviews WHERE session_id = ? GROUP BY grade")
    .bind(sid).all<{ grade: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.grade, r.n]));
}

export async function setExcluded(db: D1Database, nums: number[], excluded: boolean): Promise<void> {
  if (!nums.length) return;
  await db.batch(nums.map((n) => db.prepare(
    "INSERT INTO exclusions (num, is_excluded) VALUES (?, ?) ON CONFLICT (num) DO UPDATE SET is_excluded = excluded.is_excluded",
  ).bind(n, excluded ? 1 : 0)));
}

export async function exclusionOverrides(db: D1Database): Promise<Map<number, boolean>> {
  const { results } = await db.prepare("SELECT * FROM exclusions ORDER BY num").all<{ num: number; is_excluded: number }>();
  return new Map(results.map((r) => [r.num, r.is_excluded === 1]));
}

export async function getSetting(db: D1Database, key: string, fallback: string): Promise<string> {
  return (await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<string>("value")) ?? fallback;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, value).run();
}

export async function createSession(db: D1Database, title: string, mode: string, queue: number[], at: Date): Promise<number> {
  const stamp = shanghaiIso(at);
  const result = await db.prepare("INSERT INTO sessions (title, mode, queue, position, created_at, finished_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(title, mode, JSON.stringify(queue), stamp, queue.length ? null : stamp).run();
  return Number(result.meta.last_row_id);
}

export async function getSession(db: D1Database, sid: number): Promise<PracticeSession | null> {
  const row = await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(sid).first<SessionRow>();
  return row ? toSession(row) : null;
}

export async function latestOpenSession(db: D1Database): Promise<PracticeSession | null> {
  const row = await db.prepare("SELECT * FROM sessions WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1").first<SessionRow>();
  return row ? toSession(row) : null;
}

const TABLES = ["reviews", "cards", "exclusions", "sessions", "settings"] as const;

export async function exportAll(db: D1Database, at = new Date()) {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) tables[table] = (await db.prepare(`SELECT * FROM ${table}`).all()).results;
  return { exported_at: shanghaiIso(at), tables };
}
