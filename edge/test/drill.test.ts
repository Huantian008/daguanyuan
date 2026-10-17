import { describe, expect, it } from "vitest";
import { Content } from "../src/content";
import { kpIndexOf, onwardKp } from "../src/drill";
import type { Status } from "../src/views/parts";
import { smallBank } from "./fixtures";

// smallBank: chapter A has 考点 1 有界 (#1), 2 奇偶 (#2), 3 0/0 (#3); B has 1 基本概念题 (#4, #5), 2 隐函数求导 (#6, 仅数一).
const content = new Content(smallBank());
const q = (num: number) => content.questions.get(num)!;

function statusOf(done: number[], excluded = [6]) {
  return (num: number): Status => (excluded.includes(num) ? "excluded" : done.includes(num) ? "mastered" : "new");
}

const where = (found: ReturnType<typeof onwardKp>) => found && [found.code, found.kp.index, found.kp.total - found.kp.done];

describe("继续往下做", () => {
  it("starts at the very first 考点 when nothing has been graded", () => {
    expect(where(onwardKp(content, statusOf([])))).toEqual(["A", 1, 1]);
  });

  it("stays on the last question's 考点 while it has questions left", () => {
    expect(where(onwardKp(content, statusOf([4]), q(4)))).toEqual(["B", 1, 1]);
  });

  it("moves on through the book, skipping 考点 that are done, and into the next chapter", () => {
    expect(where(onwardKp(content, statusOf([1, 2]), q(1)))).toEqual(["A", 3, 1]);
    expect(where(onwardKp(content, statusOf([3]), q(3)))).toEqual(["B", 1, 2]);
  });

  it("does not go back to an earlier 考点 while later ones have work left", () => {
    expect(where(onwardKp(content, statusOf([2]), q(2)))).toEqual(["A", 3, 1]);
  });

  it("goes round from the start once the end of the book is done", () => {
    expect(where(onwardKp(content, statusOf([3, 4, 5]), q(5)))).toEqual(["A", 1, 1]);
    expect(where(onwardKp(content, statusOf([1, 3, 4, 5]), q(3)))).toEqual(["A", 2, 1]);
  });

  it("skips a 考点 whose questions are all excluded, and is null when everything is done", () => {
    expect(onwardKp(content, statusOf([1, 2, 3, 4, 5]), q(5))).toBeNull();
    expect(where(onwardKp(content, statusOf([1, 2, 3, 4, 5], []), q(5)))).toEqual(["B", 2, 1]);
  });

  it("finds the ?kp= of a 考点", () => {
    expect(kpIndexOf(content, "A", "极限", "0/0", statusOf([]))).toBe(3);
    expect(kpIndexOf(content, "B", "导数概念", "基本概念题", statusOf([]))).toBe(1);
  });
});
