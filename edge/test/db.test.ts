import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/db";
import { memoryD1 } from "./d1";

const EVENING = new Date("2026-10-16T22:00:00+08:00");
const AFTER_MIDNIGHT = new Date("2026-10-17T01:30:00+08:00");
const ME = 1;
const PAL = 2;

let d1: D1Database;
beforeEach(() => {
  d1 = memoryD1();
});

describe("reviews and cards", () => {
  it("updates the card and the log", async () => {
    const card = await db.recordReview(d1, ME, { num: 5, grade: "shaky", at: EVENING, mode: "kp" });
    expect([card.level, card.due]).toEqual([1, "2026-10-17"]);
    expect(await db.getCard(d1, ME, 5)).toEqual(card);
    const [entry] = await db.reviewLog(d1, ME);
    expect([entry.num, entry.grade, entry.studyDay, entry.mode, entry.reviewedAt])
      .toEqual([5, "shaky", "2026-10-16", "kp", "2026-10-16T22:00:00+08:00"]);
  });

  it("logs after-midnight reviews on the previous study day", async () => {
    await db.recordReview(d1, ME, { num: 7, grade: "mastered", at: AFTER_MIDNIGHT, mode: "due" });
    expect((await db.reviewLog(d1, ME))[0].studyDay).toBe("2026-10-16");
  });

  it("builds on the existing card", async () => {
    await db.recordReview(d1, ME, { num: 9, grade: "mastered", at: EVENING, mode: "kp" });
    const card = await db.recordReview(d1, ME, { num: 9, grade: "mastered", at: new Date("2026-10-23T21:00:00+08:00"), mode: "due" });
    expect([card.level, card.reps]).toEqual([4, 2]);
    expect([...(await db.allCards(d1, ME)).keys()]).toEqual([9]);
  });

  it("filters the log by study day", async () => {
    await db.recordReview(d1, ME, { num: 1, grade: "mastered", at: EVENING, mode: "kp" });
    await db.recordReview(d1, ME, { num: 2, grade: "mastered", at: new Date("2026-10-18T21:00:00+08:00"), mode: "kp" });
    expect((await db.reviewLog(d1, ME, "2026-10-17")).map((r) => r.num)).toEqual([2]);
    expect((await db.historyFor(d1, ME, 1)).map((r) => r.num)).toEqual([1]);
  });
});

describe("exclusions and settings", () => {
  it("round-trips 不做 overrides", async () => {
    await db.setExcluded(d1, ME, [1, 2], true);
    await db.setExcluded(d1, ME, [2], false);
    expect([...(await db.exclusionOverrides(d1, ME))]).toEqual([[1, true], [2, false]]);
  });

  it("round-trips settings with a fallback", async () => {
    expect(await db.getSetting(d1, ME, "exam_date", "2026-12-19")).toBe("2026-12-19");
    await db.setSetting(d1, ME, "exam_date", "2026-12-20");
    expect(await db.getSetting(d1, ME, "exam_date", "2026-12-19")).toBe("2026-12-20");
  });
});

describe("exportAll", () => {
  it("dumps every table for backup, without the internal user id", async () => {
    await db.recordReview(d1, ME, { num: 1, grade: "mastered", at: EVENING, mode: "kp" });
    await db.setSetting(d1, ME, "exam_date", "2026-12-19");
    const dump = await db.exportAll(d1, ME);
    expect(Object.keys(dump.tables)).toEqual(["reviews", "cards", "exclusions", "sessions", "settings"]);
    expect(dump.tables.reviews).toHaveLength(1);
    expect(dump.tables.settings).toEqual([{ key: "exam_date", value: "2026-12-19" }]);
    expect(JSON.stringify(dump)).not.toContain("user_id");
  });
});

describe("two users sharing one database", () => {
  it("keep separate cards and review logs for the same question", async () => {
    await db.recordReview(d1, ME, { num: 5, grade: "mastered", at: EVENING, mode: "kp" });
    await db.recordReview(d1, PAL, { num: 5, grade: "unknown", at: EVENING, mode: "kp" });
    expect((await db.getCard(d1, ME, 5)).lastGrade).toBe("mastered");
    expect((await db.getCard(d1, PAL, 5)).lastGrade).toBe("unknown");
    expect([...(await db.allCards(d1, ME)).values()].map((c) => c.lastGrade)).toEqual(["mastered"]);
    expect((await db.reviewLog(d1, ME)).map((r) => r.grade)).toEqual(["mastered"]);
    expect((await db.reviewLog(d1, PAL)).map((r) => r.grade)).toEqual(["unknown"]);
    expect((await db.historyFor(d1, PAL, 5)).map((r) => r.grade)).toEqual(["unknown"]);
    expect(await db.reviewLog(d1, 3)).toEqual([]);
  });

  it("a user nobody has recorded anything for starts empty", async () => {
    await db.recordReview(d1, ME, { num: 5, grade: "mastered", at: EVENING, mode: "kp" });
    await db.setExcluded(d1, ME, [5], true);
    await db.setSetting(d1, ME, "exam_date", "2026-12-20");
    expect((await db.allCards(d1, PAL)).size).toBe(0);
    expect((await db.exclusionOverrides(d1, PAL)).size).toBe(0);
    expect(await db.getSetting(d1, PAL, "exam_date", "2026-12-19")).toBe("2026-12-19");
  });

  it("keep separate 不做 marks and settings", async () => {
    await db.setExcluded(d1, ME, [1, 2], true);
    await db.setExcluded(d1, PAL, [2], false);
    expect([...(await db.exclusionOverrides(d1, ME))]).toEqual([[1, true], [2, true]]);
    expect([...(await db.exclusionOverrides(d1, PAL))]).toEqual([[2, false]]);
    await db.setSetting(d1, ME, "exam_date", "2026-12-20");
    await db.setSetting(d1, PAL, "exam_date", "2027-01-01");
    expect(await db.getSetting(d1, ME, "exam_date", "x")).toBe("2026-12-20");
    expect(await db.getSetting(d1, PAL, "exam_date", "x")).toBe("2027-01-01");
  });

  it("export only their own rows", async () => {
    await db.recordReview(d1, ME, { num: 5, grade: "mastered", at: EVENING, mode: "kp" });
    await db.setSetting(d1, ME, "exam_date", "2026-12-20");
    // a practice set from before the practice page was removed
    await d1.prepare("INSERT INTO sessions (user_id, title, mode, queue, position, created_at) VALUES (?, 't', 'due', '[1]', 0, 'x')")
      .bind(ME).run();
    const theirs = await db.exportAll(d1, PAL);
    for (const rows of Object.values(theirs.tables)) expect(rows).toEqual([]);
    expect((await db.exportAll(d1, ME)).tables.reviews).toHaveLength(1);
    expect((await db.exportAll(d1, ME)).tables.sessions).toHaveLength(1);
  });
});
