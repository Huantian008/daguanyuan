import { describe, expect, it } from "vitest";
import { Content } from "../src/content";
import { NEW_CARD, type CardState, type Grade } from "../src/srs";
import {
  chapterProgress, dailyTotals, dueQueue, lastDrilled, masteryDistribution, reviewList, streak, warmupQueue, weakSpots, type Review,
} from "../src/stats";
import { addDays } from "../src/studyday";
import { smallBank } from "./fixtures";

const TODAY = "2026-10-16";
const day = (n: number) => addDays(TODAY, n);

function review(num: number, studyDay: string, grade: Grade = "mastered", hour = 21, mode = "kp"): Review {
  return { num, grade, reviewedAt: `${studyDay}T${String(hour).padStart(2, "0")}:00:00+08:00`, studyDay, mode };
}

const card = (level: number, due: string, lastGrade: Grade): CardState => ({ ...NEW_CARD, level, due, lastGrade, reps: 1 });

describe("stats", () => {
  it("counts last grades and new questions", () => {
    const cards = new Map([[1, card(3, TODAY, "mastered")], [2, card(1, TODAY, "shaky")], [3, card(1, TODAY, "unknown")]]);
    expect(masteryDistribution([1, 2, 3, 4], cards)).toEqual({ mastered: 1, shaky: 1, unknown: 1, new: 1 });
  });

  it("orders due questions by due date and skips excluded and future ones", () => {
    const cards = new Map([
      [1, card(2, day(-1), "shaky")],
      [2, card(1, day(-3), "unknown")],
      [3, card(3, day(2), "mastered")],
      [4, card(1, TODAY, "shaky")],
    ]);
    expect(dueQueue(cards, new Set([1, 2, 3]), TODAY)).toEqual([2, 1]);
  });

  it("warms up with questions from the last study days that had activity", () => {
    const reviews = [
      review(1, day(-6)),
      review(2, day(-4), "mastered", 20),
      review(3, day(-4), "mastered", 21),
      review(4, day(-1)),
      review(5, day(-1)),
      review(4, TODAY),
    ];
    expect(warmupQueue(reviews, new Set([1, 2, 3, 4, 5]), TODAY, 2)).toEqual([2, 3, 5]);
  });

  it("keeps a review page's cards graded today on it, in the order graded, above what is left", () => {
    const reviews = [
      review(7, day(-1), "shaky", 21, "warmup"),
      review(3, TODAY, "mastered", 20, "warmup"),
      review(9, TODAY, "shaky", 20, "browse"),
      review(1, TODAY, "unknown", 21, "warmup"),
      review(5, TODAY, "shaky", 22, "due"),
    ];
    expect(reviewList(reviews, "warmup", TODAY, [2, 4])).toEqual([3, 1, 2, 4]);
    expect(reviewList(reviews, "due", TODAY, [])).toEqual([5]);
    expect(reviewList([], "due", TODAY, [8, 6])).toEqual([8, 6]);
  });

  it("finds the last question graded outside warm-up and due review", () => {
    const reviews = [review(2, day(-1), "mastered", 21, "browse"), review(4, TODAY, "shaky", 20, "group"),
      review(1, TODAY, "shaky", 21, "warmup"), review(5, TODAY, "shaky", 22, "due")];
    expect(lastDrilled(reviews, () => true)).toBe(4);
    expect(lastDrilled(reviews, (n) => n !== 4)).toBe(2);
    expect(lastDrilled(reviews.slice(2), () => true)).toBeUndefined();
  });

  it("leaves excluded questions out of chapter progress", () => {
    const content = new Content(smallBank());
    const cards = new Map([[4, card(3, TODAY, "mastered")], [6, card(1, TODAY, "shaky")]]);
    const progress = Object.fromEntries(chapterProgress(content, cards, new Set([6])).map((p) => [p.code, [p.done, p.total]]));
    expect(progress.A).toEqual([0, 3]);
    expect(progress.B).toEqual([1, 2]);
  });

  it("ranks weak spots by score, then by how many questions need redoing", () => {
    const content = new Content(smallBank());
    const cards = new Map([
      [1, card(1, TODAY, "shaky")],
      [3, card(1, TODAY, "unknown")],
      [4, card(1, TODAY, "shaky")],
      [5, card(1, TODAY, "shaky")],
    ]);
    expect(weakSpots(content, cards, new Set(), 2).map((s) => [s.section, s.kp, s.nums])).toEqual([
      ["导数概念", "基本概念题", [4, 5]],
      ["极限", "0/0", [3]],
    ]);
  });

  it("counts the streak back from today, or from yesterday", () => {
    const days = new Set([TODAY, day(-1), day(-2), day(-5)]);
    expect(streak(days, TODAY)).toBe(3);
    days.delete(TODAY);
    expect(streak(days, TODAY)).toBe(2);
    expect(streak(new Set([day(-3)]), TODAY)).toBe(0);
  });

  it("counts distinct questions per day", () => {
    const reviews = [review(1, TODAY), review(1, TODAY, "mastered", 22), review(2, TODAY, "mastered", 23), review(3, day(-2))];
    expect(dailyTotals(reviews, TODAY, 3)).toEqual([
      { day: day(-2), count: 1 },
      { day: day(-1), count: 0 },
      { day: TODAY, count: 2 },
    ]);
  });
});
