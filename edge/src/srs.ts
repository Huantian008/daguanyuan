/**
 * Spaced repetition: five levels with review intervals of 1, 3, 7, 14 and 30 days.
 * Grades: mastered = 完全掌握, shaky = 不熟练/错误, unknown = 完全不会.
 */
import { addDays, type Day } from "./studyday";

export const INTERVALS = [1, 3, 7, 14, 30] as const;
export const GRADES = ["mastered", "shaky", "unknown"] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABELS: Record<Grade, string> = { mastered: "完全掌握", shaky: "不熟练/错误", unknown: "完全不会" };

export interface CardState {
  level: number; // 0 = never reviewed
  due: Day | null;
  lastGrade: Grade | null;
  reps: number;
  lapses: number;
}

export const NEW_CARD: CardState = { level: 0, due: null, lastGrade: null, reps: 0, lapses: 0 };

export const isGrade = (value: string): value is Grade => (GRADES as readonly string[]).includes(value);

export function schedule(state: CardState, grade: Grade, today: Day): CardState {
  let level: number;
  if (grade === "mastered") {
    level = state.level === 0 ? 3 : Math.min(state.level + 1, INTERVALS.length);
  } else if (grade === "shaky") {
    level = Math.max(state.level - 1, 1);
  } else {
    level = 1;
  }
  return {
    level,
    due: addDays(today, INTERVALS[level - 1]),
    lastGrade: grade,
    reps: state.reps + 1,
    lapses: state.lapses + (grade === "unknown" ? 1 : 0),
  };
}

/** The card a question's reviews lead to, oldest first, as [grade, study day]. Every stored card was built this way. */
export const cardFrom = (history: [Grade, Day][]): CardState =>
  history.reduce((card, [grade, day]) => schedule(card, grade, day), NEW_CARD);
