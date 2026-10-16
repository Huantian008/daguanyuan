/** A user's current state, loaded from D1 in two queries. */
import type { Content } from "./content";
import { allCards, exclusionOverrides, getSetting } from "./db";
import type { CardState } from "./srs";
import { excludedSet } from "./stats";
import type { Status } from "./views/parts";

export const DEFAULT_EXAM_DATE = "2026-12-19";
export const DEFAULT_WARMUP_DAYS = 3;

export interface UserState {
  cards: Map<number, CardState>;
  excluded: Set<number>;
  active: Set<number>;
  status: (num: number) => Status;
}

export async function loadState(db: D1Database, uid: number, content: Content): Promise<UserState> {
  const [cards, overrides] = await Promise.all([allCards(db, uid), exclusionOverrides(db, uid)]);
  const excluded = excludedSet(content, overrides);
  const active = new Set(content.all().map((q) => q.num).filter((n) => !excluded.has(n)));
  const status = (num: number): Status => (excluded.has(num) ? "excluded" : cards.get(num)?.lastGrade ?? "new");
  return { cards, excluded, active, status };
}

export const examDate = (db: D1Database, uid: number) => getSetting(db, uid, "exam_date", DEFAULT_EXAM_DATE);

export async function warmupDays(db: D1Database, uid: number): Promise<number> {
  return Number(await getSetting(db, uid, "warmup_days", String(DEFAULT_WARMUP_DAYS)));
}
