// Tiny fake question bank mirroring tests/factories.py, so tests run without the real content.
import type { Manifest, ManifestQuestion } from "../src/content";

const CHAPTERS = [
  { code: "A", name: "函数极限连续", first: 1, last: 117 },
  { code: "B", name: "一元微分", first: 118, last: 244 },
  { code: "C", name: "一元积分", first: 245, last: 398 },
  { code: "D", name: "多元微分", first: 399, last: 464 },
  { code: "E", name: "二重积分", first: 465, last: 524 },
  { code: "F", name: "微分方程", first: 525, last: 613 },
];

const pad = (n: number) => String(n).padStart(3, "0");

export function question(num: number, chapter = "A", section = "函数性质", kp = "有界", flags: string[] = [],
  source = "2004数三"): ManifestQuestion {
  return {
    num, chapter, kp, section, path: [section, kp], source, source_full: source, orig_page: 1,
    difficulty: 0.5, stars: 2, minutes: 5, quick_id: `01-${pad(num)}`, flags,
    img: { src: `q/${pad(num)}.webp`, w: 100, h: 20 },
    answer: { src: `a/${pad(num)}.webp`, w: 10, h: 10 },
    solution: [{ src: `s/${pad(num)}-1.webp`, w: 100, h: 50 }],
  };
}

export function smallBank(): Manifest {
  return {
    version: 1,
    built_at: "2026-10-16T12:00:00",
    chapters: CHAPTERS,
    chapter_links: { A: ["01"], B: ["02"], C: ["03", "04", "05"], D: ["07"], E: ["08", "09"], F: ["06"] },
    questions: [
      question(1, "A", "函数性质", "有界"),
      question(2, "A", "函数性质", "奇偶"),
      question(3, "A", "极限", "0/0"),
      question(4, "B", "导数概念", "基本概念题"),
      question(5, "B", "导数概念", "基本概念题"),
      question(6, "B", "导数计算", "隐函数求导", ["仅数一"]),
    ],
    knowledge: [
      { slug: "01", title: "函数、极限与连续", group: "高等数学", md: "01_函数极限连续.md",
        pages: [{ src: "k/gaoshu-010.webp", w: 10, h: 10 }] },
      { slug: "xiandai", title: "线性代数", group: "线性代数", md: null, toc: [],
        pages: [{ src: "k/xiandai-001.webp", w: 10, h: 10 }] },
    ],
    alignment: { weak: [], skipped: [] },
  };
}
