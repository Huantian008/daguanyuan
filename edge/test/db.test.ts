import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/db";
import { memoryD1 } from "./d1";

const EVENING = new Date("2026-10-16T22:00:00+08:00");
const AFTER_MIDNIGHT = new Date("2026-10-17T01:30:00+08:00");

let d1: D1Database;
beforeEach(() => {
  d1 = memoryD1();
});

describe("reviews and cards", () => {
  it("updates the card and the log", async () => {
    const card = await db.recordReview(d1, { num: 5, grade: "shaky", at: EVENING, elapsedSec: 300, mode: "kp" });
    expect([card.level, card.due]).toEqual([1, "2026-10-17"]);
    expect(await db.getCard(d1, 5)).toEqual(card);
    const [entry] = await db.reviewLog(d1);
    expect([entry.num, entry.grade, entry.studyDay, entry.elapsedSec, entry.mode, entry.reviewedAt])
      .toEqual([5, "shaky", "2026-10-16", 300, "kp", "2026-10-16T22:00:00+08:00"]);
  });

  it("logs after-midnight reviews on the previous study day", async () => {
    await db.recordReview(d1, { num: 7, grade: "mastered", at: AFTER_MIDNIGHT, elapsedSec: null, mode: "due" });
    expect((await db.reviewLog(d1))[0].studyDay).toBe("2026-10-16");
  });

  it("builds on the existing card", async () => {
    await db.recordReview(d1, { num: 9, grade: "mastered", at: EVENING, elapsedSec: null, mode: "kp" });
    const card = await db.recordReview(d1, { num: 9, grade: "mastered", at: new Date("2026-10-23T21:00:00+08:00"),
      elapsedSec: null, mode: "due" });
    expect([card.level, card.reps]).toEqual([4, 2]);
    expect([...(await db.allCards(d1)).keys()]).toEqual([9]);
  });

  it("filters the log by study day", async () => {
    await db.recordReview(d1, { num: 1, grade: "mastered", at: EVENING, elapsedSec: null, mode: "kp" });
    await db.recordReview(d1, { num: 2, grade: "mastered", at: new Date("2026-10-18T21:00:00+08:00"), elapsedSec: null, mode: "kp" });
    expect((await db.reviewLog(d1, "2026-10-17")).map((r) => r.num)).toEqual([2]);
    expect((await db.historyFor(d1, 1)).map((r) => r.num)).toEqual([1]);
  });
});

describe("exclusions and settings", () => {
  it("round-trips 不做 overrides", async () => {
    await db.setExcluded(d1, [1, 2], true);
    await db.setExcluded(d1, [2], false);
    expect([...(await db.exclusionOverrides(d1))]).toEqual([[1, true], [2, false]]);
  });

  it("round-trips settings with a fallback", async () => {
    expect(await db.getSetting(d1, "exam_date", "2026-12-19")).toBe("2026-12-19");
    await db.setSetting(d1, "exam_date", "2026-12-20");
    expect(await db.getSetting(d1, "exam_date", "2026-12-19")).toBe("2026-12-20");
  });
});

describe("practice sessions", () => {
  it("walks the queue, finishes, and counts grades", async () => {
    const sid = await db.createSession(d1, "到期复习", "due", [3, 1, 2], EVENING);
    let s = (await db.getSession(d1, sid))!;
    expect([s.queue, s.position, db.current(s), s.finishedAt]).toEqual([[3, 1, 2], 0, 3, null]);
    expect((await db.latestOpenSession(d1))!.id).toBe(sid);
    await db.recordReview(d1, { num: 3, grade: "unknown", at: EVENING, elapsedSec: 60, mode: "due", session: s });
    s = (await db.getSession(d1, sid))!;
    expect(db.current(s)).toBe(1);
    await db.advanceSession(d1, s, EVENING);
    s = (await db.getSession(d1, sid))!;
    await db.advanceSession(d1, s, EVENING);
    s = (await db.getSession(d1, sid))!;
    expect(db.current(s)).toBeNull();
    expect(s.finishedAt).not.toBeNull();
    expect(await db.latestOpenSession(d1)).toBeNull();
    expect(await db.sessionGrades(d1, sid)).toEqual({ unknown: 1 });
  });

  it("finishes an empty session immediately", async () => {
    const sid = await db.createSession(d1, "到期复习", "due", [], EVENING);
    expect((await db.getSession(d1, sid))!.finishedAt).not.toBeNull();
  });
});

describe("exportAll", () => {
  it("dumps every table for backup", async () => {
    await db.recordReview(d1, { num: 1, grade: "mastered", at: EVENING, elapsedSec: 30, mode: "kp" });
    await db.setSetting(d1, "exam_date", "2026-12-19");
    const dump = await db.exportAll(d1);
    expect(Object.keys(dump.tables)).toEqual(["reviews", "cards", "exclusions", "sessions", "settings"]);
    expect(dump.tables.reviews).toHaveLength(1);
    expect(dump.tables.settings).toEqual([{ key: "exam_date", value: "2026-12-19" }]);
  });
});
