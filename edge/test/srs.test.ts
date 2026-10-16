import { describe, expect, it } from "vitest";
import { NEW_CARD, schedule } from "../src/srs";

const TODAY = "2026-10-16";

describe("schedule", () => {
  it("jumps a first-time mastered question to level 3, seven days out", () => {
    const s = schedule(NEW_CARD, "mastered", TODAY);
    expect([s.level, s.due]).toEqual([3, "2026-10-23"]);
    expect([s.reps, s.lapses, s.lastGrade]).toEqual([1, 0, "mastered"]);
  });

  it("moves mastered up one level and caps at 30 days", () => {
    expect(schedule({ ...NEW_CARD, level: 3, reps: 1 }, "mastered", TODAY).due).toBe("2026-10-30");
    const capped = schedule({ ...NEW_CARD, level: 5, reps: 4 }, "mastered", TODAY);
    expect([capped.level, capped.due]).toEqual([5, "2026-11-15"]);
  });

  it("brings a first-time shaky question back tomorrow", () => {
    const s = schedule(NEW_CARD, "shaky", TODAY);
    expect([s.level, s.due]).toEqual([1, "2026-10-17"]);
  });

  it("moves shaky down one level", () => {
    const s = schedule({ ...NEW_CARD, level: 4, reps: 3 }, "shaky", TODAY);
    expect([s.level, s.due]).toEqual([3, "2026-10-23"]);
  });

  it("resets unknown to level 1 and counts a lapse", () => {
    const s = schedule({ ...NEW_CARD, level: 5, reps: 6, lapses: 1 }, "unknown", TODAY);
    expect([s.level, s.due, s.lapses, s.reps]).toEqual([1, "2026-10-17", 2, 7]);
  });
});
