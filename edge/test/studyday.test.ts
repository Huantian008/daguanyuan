import { describe, expect, it } from "vitest";
import { addDays, cnDate, studyDay } from "../src/studyday";

const shanghai = (iso: string) => new Date(iso + "+08:00");

describe("studyDay", () => {
  it("counts after-midnight study as the previous evening", () => {
    expect(studyDay(shanghai("2026-10-17T01:30:00"))).toBe("2026-10-16");
  });

  it("starts a new day at 04:00 Shanghai time", () => {
    expect(studyDay(shanghai("2026-10-17T03:59:00"))).toBe("2026-10-16");
    expect(studyDay(shanghai("2026-10-17T04:00:00"))).toBe("2026-10-17");
  });

  it("converts other time zones to Shanghai first", () => {
    // 18:00 UTC = 02:00 next day in Shanghai -> still the 16th's study day
    expect(studyDay(new Date("2026-10-16T18:00:00Z"))).toBe("2026-10-16");
  });
});

describe("day helpers", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-16", -1)).toBe("2026-10-15");
  });

  it("formats Chinese dates with the weekday", () => {
    expect(cnDate("2026-10-16")).toBe("10月16日周五");
  });
});
