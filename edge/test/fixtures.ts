// Tiny fake question bank mirroring tests/factories.py, so tests run without the real content.
import type { Manifest, ManifestQuestion, QuestionText } from "../src/content";

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

/** The text version of #001–#003 as dgy/bank.py renders it (the same as tests/test_app.py's BANK). */
export const TEXTS: Record<string, QuestionText> = {
  "1": {
    type: "choice", figure: false,
    stem: '<p>函数 <span class="math inline">f(x)=\\dfrac{1}{x}</span> 在 <span class="math inline">(0,1)</span> 内（　　）.</p>\n',
    options: [["A", "有界"], ["B", "无界"], ["C", '<span class="math inline">x&gt;\\dfrac12</span> 时有界'], ["D", "4."]],
    options_wide: false, answer: "<p>C</p>\n", answer_key: "C", erratum: "速查原印 B",
    search: "函数 f(x)= 1 x 在 (0,1) 内（ ）. 有界 无界 x> 12 时有界 4.",
  },
  "2": {
    type: "fill", figure: false,
    stem: '<p>求 <span class="math inline">x</span> 的值 <span class="math inline">\\underline{\\qquad}</span>.</p>\n<p>(2) 再求拐点</p>\n',
    options: [], options_wide: false, answer: '<p><span class="math inline">\\dfrac12</span></p>\n', answer_key: null, erratum: null,
    search: "求 x 的值 . (2) 再求拐点",
  },
  "3": {
    type: "choice", figure: true, stem: "<p>如图所示（　　）</p>\n", options: [], options_wide: false,
    answer: "<p>A</p>\n", answer_key: null, erratum: null, search: "如图所示（ ）",
  },
};

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
