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

// The six 线代 chapters, which pipeline.build puts after the 高数 ones (pipeline/chapters.py XIANDAI_CHAPTERS).
const XIANDAI_CHAPTERS = [
  { code: "L1", name: "行列式", first: 1001, last: 1040 },
  { code: "L2", name: "矩阵", first: 1041, last: 1115 },
  { code: "L3", name: "向量", first: 1116, last: 1146 },
  { code: "L4", name: "方程组", first: 1147, last: 1220 },
  { code: "L5", name: "特征值与特征向量", first: 1221, last: 1284 },
  { code: "L6", name: "二次型", first: 1285, last: 1355 },
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

/** A 线代 question as pipeline.xiandai writes it: no difficulty, minutes, 答案速查 or answer image. */
export function xiandaiQuestion(bookNum: number, chapter = "L1", section = "具体行列式计算", kp = "具体行列式计算",
  source = "2014数一二三"): ManifestQuestion {
  const num = 1000 + bookNum;
  return {
    num, chapter, kp, section, path: kp === section ? [section] : [section, kp], source, source_full: source,
    orig_page: null, difficulty: null, stars: null, minutes: null, quick_id: null, flags: [],
    img: { src: `xiandai/q/${num}.webp`, w: 100, h: 20 },
    answer: null,
    solution: [{ src: `xiandai/s/${num}-1.webp`, w: 100, h: 50 }],
  };
}

/** Three 高数 questions in chapter A and three 线代 questions, two in L1 and one in L2 (tests/factories.py two_books). */
export function twoBooks(): Manifest {
  return {
    ...smallBank(),
    chapters: [...CHAPTERS.map((c) => ({ ...c, group: "高等数学" })), ...XIANDAI_CHAPTERS.map((c) => ({ ...c, group: "线性代数" }))],
    chapter_links: {
      A: ["01"], B: ["02"], C: ["03", "04", "05"], D: ["07"], E: ["08", "09"], F: ["06"],
      L1: ["10"], L2: ["11"], L3: ["12"], L4: ["13"], L5: ["14"], L6: ["15"],
    },
    questions: [
      question(1, "A", "函数性质", "有界"),
      question(2, "A", "函数性质", "奇偶"),
      question(3, "A", "极限", "0/0"),
      xiandaiQuestion(1),
      xiandaiQuestion(2, "L1", "具体行列式计算", "具体行列式计算", "2015数一"),
      xiandaiQuestion(41, "L2", "逆", "抽象逆", "2001数一"),
    ],
    knowledge: [
      { slug: "01", title: "函数、极限与连续", group: "高等数学", md: "01_函数极限连续.md",
        pages: [{ src: "k/gaoshu-010.webp", w: 10, h: 10 }] },
      { slug: "10", title: "行列式", group: "线性代数", md: "10_行列式.md",
        pages: [{ src: "k/xiandai-001.webp", w: 10, h: 10 }, { src: "k/xiandai-002.webp", w: 10, h: 10 }] },
      { slug: "11", title: "矩阵", group: "线性代数", md: "11_矩阵.md", pages: [{ src: "k/xiandai-003.webp", w: 10, h: 10 }] },
    ],
  };
}

/** 线代 #002 as text, as dgy/bank.py renders bank-md/xiandai.json (site number 1002). */
export const XIANDAI_TEXTS: Record<string, QuestionText> = {
  "1002": {
    type: "fill", figure: false,
    stem: '<p><span class="math inline">n</span> 阶行列式 <span class="math inline">D_n=\\underline{\\qquad\\qquad}</span>.</p>\n',
    options: [], options_wide: false, answer: '<p><span class="math inline">2^{n+1}-2</span></p>\n', answer_key: null, erratum: null,
    search: "n 阶行列式 D n= .",
  },
};
