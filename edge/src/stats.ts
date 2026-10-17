/** Dashboard numbers: pure functions over the question bank, card states and the review log. */
import type { Content } from "./content";
import type { CardState, Grade } from "./srs";
import { addDays, type Day } from "./studyday";

export interface Review {
  num: number;
  grade: Grade;
  reviewedAt: string;
  studyDay: Day;
  mode: string;
}

export type Distribution = { mastered: number; shaky: number; unknown: number; new: number };

export interface ChapterProgress {
  code: string;
  name: string;
  done: number;
  total: number;
  percent: number;
}

export interface WeakSpot {
  chapter: string;
  section: string;
  kp: string;
  nums: number[];
  score: number;
}

export interface DayTotal {
  day: Day;
  count: number;
}

export function excludedSet(content: Content, overrides: Map<number, boolean>): Set<number> {
  const excluded = content.defaultExcluded();
  for (const [num, isExcluded] of overrides) {
    if (isExcluded) excluded.add(num);
    else excluded.delete(num);
  }
  return excluded;
}

export function masteryDistribution(nums: Iterable<number>, cards: Map<number, CardState>): Distribution {
  const dist: Distribution = { mastered: 0, shaky: 0, unknown: 0, new: 0 };
  for (const num of nums) dist[cards.get(num)?.lastGrade ?? "new"] += 1;
  return dist;
}

export function dueQueue(cards: Map<number, CardState>, active: Set<number>, today: Day): number[] {
  return [...cards]
    .filter(([num, c]) => active.has(num) && c.due !== null && c.due <= today)
    .sort(([na, a], [nb, b]) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.level - b.level || na - nb))
    .map(([num]) => num);
}

/** Questions done on the last `days` study days that had any activity, minus those already redone today. */
export function warmupQueue(reviews: Review[], active: Set<number>, today: Day, days = 3): number[] {
  const window = new Set([...new Set(reviews.filter((r) => r.studyDay < today).map((r) => r.studyDay))]
    .sort().reverse().slice(0, days));
  const doneToday = new Set(reviews.filter((r) => r.studyDay === today).map((r) => r.num));
  const queue: number[] = [];
  for (const r of [...reviews].sort((a, b) => (a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : 0))) {
    if (window.has(r.studyDay) && active.has(r.num) && !doneToday.has(r.num) && !queue.includes(r.num)) queue.push(r.num);
  }
  return queue;
}

/** The cards on the warm-up or due-review page: those graded there today in the order graded, then `queue`, what is left. */
export function reviewList(reviews: Review[], mode: string, today: Day, queue: number[]): number[] {
  const graded: number[] = [];
  for (const r of reviews) if (r.studyDay === today && r.mode === mode && !graded.includes(r.num)) graded.push(r.num);
  return [...graded, ...queue.filter((n) => !graded.includes(n))];
}

/** The last question graded outside warm-up and due review, which is where 继续往下做 picks up. */
export const lastDrilled = (reviews: Review[], known: (num: number) => boolean): number | undefined =>
  [...reviews].reverse().find((r) => r.mode !== "warmup" && r.mode !== "due" && known(r.num))?.num;

export function chapterProgress(content: Content, cards: Map<number, CardState>, excluded: Set<number>): ChapterProgress[] {
  return content.chapters.map((ch) => {
    const nums = content.inChapter(ch.code).map((q) => q.num).filter((n) => !excluded.has(n));
    const done = nums.filter((n) => (cards.get(n)?.reps ?? 0) > 0).length;
    return { code: ch.code, name: ch.name, done, total: nums.length, percent: nums.length ? Math.round((100 * done) / nums.length) : 0 };
  });
}

export function weakSpots(content: Content, cards: Map<number, CardState>, excluded: Set<number>, top = 3): WeakSpot[] {
  const groups = new Map<string, { chapter: string; section: string; kp: string; nums: number[] }>();
  for (const q of content.all()) {
    if (excluded.has(q.num)) continue;
    const key = `${q.chapter}\u0000${q.section}\u0000${q.kp}`;
    if (!groups.has(key)) groups.set(key, { chapter: q.chapter, section: q.section, kp: q.kp, nums: [] });
    groups.get(key)!.nums.push(q.num);
  }
  const spots: WeakSpot[] = [];
  for (const g of groups.values()) {
    const weak = g.nums.filter((n) => ["shaky", "unknown"].includes(cards.get(n)?.lastGrade ?? ""));
    const score = weak.reduce((sum, n) => sum + (cards.get(n)!.lastGrade === "unknown" ? 2 : 1), 0);
    if (score) spots.push({ chapter: g.chapter, section: g.section, kp: g.kp, nums: weak, score });
  }
  spots.sort((a, b) => b.score - a.score || b.nums.length - a.nums.length || a.nums[0] - b.nums[0]);
  return spots.slice(0, top);
}

/** Consecutive study days ending today (or yesterday, if nothing has been done yet today). */
export function streak(days: Set<Day>, today: Day): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

export function dailyTotals(reviews: Review[], today: Day, days = 30): DayTotal[] {
  const nums = new Map<Day, Set<number>>();
  for (const r of reviews) {
    if (!nums.has(r.studyDay)) nums.set(r.studyDay, new Set());
    nums.get(r.studyDay)!.add(r.num);
  }
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1)).map((day) => ({
    day, count: nums.get(day)?.size ?? 0,
  }));
}
