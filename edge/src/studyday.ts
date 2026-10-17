/**
 * Which study day a moment belongs to. Math is studied late at night, so a day runs 04:00 → 04:00 Shanghai time.
 * Shanghai is UTC+8 all year, so the study day is simply the UTC date of (moment + 4 h). Days are "YYYY-MM-DD".
 */
export type Day = string;

const HOUR = 3600 * 1000;
const STUDY_DAY_SHIFT = (8 - 4) * HOUR;
const SHANGHAI_OFFSET = 8 * HOUR;
const WEEKDAYS = "日一二三四五六";

export const studyDay = (moment: Date): Day =>
  new Date(moment.getTime() + STUDY_DAY_SHIFT).toISOString().slice(0, 10);

/** The Shanghai calendar date, which turns at midnight: for the date and exam countdown at the top of the home page. */
export const calendarDay = (moment: Date): Day =>
  new Date(moment.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 10);

export function addDays(day: Day, n: number): Day {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: Day, to: Day): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * HOUR));

export function cnDate(day: Day): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日周${WEEKDAYS[d.getUTCDay()]}`;
}

/** Timestamp in Shanghai time, e.g. 2026-10-16T22:00:00+08:00 — the format the Python version stores too. */
export const shanghaiIso = (moment: Date): string =>
  new Date(moment.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 19) + "+08:00";

/** "HH:MM" of a stored Shanghai timestamp. */
export const clockOf = (iso: string): string => iso.slice(11, 16);
