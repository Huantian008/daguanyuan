import { describe, expect, it } from "vitest";
import { Content } from "../src/content";
import { buildQueue, type QueueSpec } from "../src/queues";
import { NEW_CARD, type CardState } from "../src/srs";
import type { Review } from "../src/stats";
import { smallBank } from "./fixtures";

const TODAY = "2026-10-16";
const CONTENT = new Content(smallBank());

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function build(spec: Partial<QueueSpec> & { mode: QueueSpec["mode"] }, cards = new Map<number, CardState>(),
  reviews: Review[] = [], excluded = new Set([6])) {
  return buildQueue({ only: "all", nums: [], count: 10, ...spec }, CONTENT, cards, reviews, excluded, TODAY, 3, seeded(1));
}

describe("buildQueue", () => {
  it("groups a chapter in book order", () => {
    expect(build({ mode: "group", chapter: "A" })).toEqual({ title: "函数极限连续", nums: [1, 2, 3] });
  });

  it("titles a 考点 queue with its path", () => {
    expect(build({ mode: "group", chapter: "B", section: "导数概念", kp: "基本概念题" }))
      .toEqual({ title: "一元微分 / 导数概念 / 基本概念题", nums: [4, 5] });
  });

  it("can keep only new or only weak questions", () => {
    const cards = new Map([[1, { ...NEW_CARD, level: 3, lastGrade: "mastered" as const, reps: 1 }],
      [2, { ...NEW_CARD, level: 1, lastGrade: "unknown" as const, reps: 1 }]]);
    expect(build({ mode: "group", chapter: "A", only: "new" }, cards).nums).toEqual([3]);
    expect(build({ mode: "group", chapter: "A", only: "weak" }, cards).nums).toEqual([2]);
  });

  it("skips excluded questions", () => {
    expect(build({ mode: "group", chapter: "B" }).nums).toEqual([4, 5]);
  });

  it("builds the due review queue", () => {
    const cards = new Map([[4, { ...NEW_CARD, level: 1, due: TODAY, lastGrade: "shaky" as const, reps: 1 }],
      [5, { ...NEW_CARD, level: 3, due: "2026-10-19", lastGrade: "mastered" as const, reps: 1 }]]);
    expect(build({ mode: "due" }, cards)).toEqual({ title: "到期复习", nums: [4] });
  });

  it("builds the warm-up queue", () => {
    const reviews: Review[] = [{ num: 2, grade: "mastered", reviewedAt: "2026-10-15T21:00:00+08:00",
      studyDay: "2026-10-15", mode: "group" }];
    expect(build({ mode: "warmup" }, new Map(), reviews)).toEqual({ title: "热身 · 重做前几天的题", nums: [2] });
  });

  it("lets a single excluded question be practised on purpose", () => {
    expect(build({ mode: "single", nums: [6] })).toEqual({ title: "#006", nums: [6] });
  });

  it("picks distinct active questions at random", () => {
    const { nums } = build({ mode: "random", count: 3 });
    expect(nums).toHaveLength(3);
    expect(new Set(nums).size).toBe(3);
    expect(nums).not.toContain(6);
  });
});
