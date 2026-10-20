// Port of tests/test_app.py: the same user-visible behaviour, now against the Worker and D1.
import { describe, expect, it } from "vitest";
import { TEXTS } from "./fixtures";
import { Client, LINKING, setup, visible } from "./harness";

async function loggedIn(options: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(options);
  await ctx.client.login();
  return ctx;
}

async function grade(client: Client, num: number, value: string, form: Record<string, string> = {}) {
  const res = await client.post(`/q/${num}/grade`, { grade: value, ...form });
  expect(res.status).toBe(303);
}

type Dump = { tables: { reviews: { id: number; num: number; mode: string }[] } };
const reviewModes = async (client: Client) => ((await (await client.get("/settings/export")).json()) as Dump).tables.reviews
  .sort((a, b) => a.id - b.id).map((r) => [r.num, r.mode]);

const text = async (client: Client, path: string) => (await client.get(path)).text();

describe("layout", () => {
  it("has a theme switch that JavaScript shows", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/");
    expect(page).toMatch(/class="theme-toggle js-theme"[^>]*hidden/);
    expect(page).toContain('classList.add("js")');
    expect(page).toContain('localStorage.getItem("dgy-theme")');
  });

  it("has a question size switch that JavaScript shows", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/bank/A");
    expect(page).toMatch(/class="qsize-toggle js-qsize"[^>]*hidden>Aa<\/button>/);
    expect(page).toContain('localStorage.getItem("dgy-qsize")');
  });
});

describe("dashboard", () => {
  it("shows the exam countdown and empty queues", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/");
    expect(visible(page)).toContain("还有 64 天");
    expect(page).toContain('data-due-count="0"');
    expect(page).toContain('data-warmup-count="0"');
    // nothing to warm up or review: a calm note instead of a disabled button
    expect(page).toContain("今天不用热身");
    expect(page).toContain("今天没有到期的题");
    expect(page).not.toContain("disabled");
    // nothing graded yet: 继续往下做 starts at the first 考点 of the book, and has the only primary button
    expect(page).toContain("<b>1</b> 题没做");
    expect(page).toContain("函数极限连续 / 函数性质 / 有界");
    expect(page).toContain('<a class="btn btn-primary" href="/bank/A?kp=1">开始做题</a>');
  });

  it("turns the date and countdown at midnight, while the rest still goes by the study day", async () => {
    const { client, clock } = await loggedIn();
    await grade(client, 1, "shaky");
    clock.at = new Date("2026-10-17T00:30:00+08:00");
    let page = await text(client, "/");
    expect(page).toContain('<p class="hero-date">10月17日周六</p>');
    expect(visible(page)).toContain("还有 63 天");
    // still the 16th's study day: nothing to warm up yet, and #1 counts for today
    expect(page).toContain('data-warmup-count="0"');
    expect(visible(page)).toContain("1 今日题数");
    clock.at = new Date("2026-10-17T04:00:00+08:00");
    page = await text(client, "/");
    expect(visible(page)).toContain("还有 63 天");
    expect(page).toContain('data-warmup-count="1"');
  });

  it("picks up 继续往下做 at the 考点 of the last question graded on a chapter page", async () => {
    const { client, clock } = await loggedIn();
    await grade(client, 4, "mastered");
    let page = await text(client, "/");
    expect(page).toContain('<a class="btn btn-primary" href="/bank/B?kp=1">继续上次</a>');
    expect(page).toContain("<b>1</b> 题没做");
    expect(page).toContain("一元微分 / 导数概念 / 基本概念题");
    expect(page).toContain("换个考点");
    // #2's 考点 is done now, so it moves on to the next one with work left
    await grade(client, 2, "mastered");
    expect(await text(client, "/")).toContain('href="/bank/A?kp=3">继续上次</a>');
    // grading in warm-up the next day does not move it back to #4
    clock.addDays(1);
    await grade(client, 4, "mastered", { mode: "warmup" });
    page = await text(client, "/");
    expect(page).toContain('href="/bank/A?kp=3">继续上次</a>');
    expect(page).not.toContain("/practice/");
  });

  it("says so when the whole bank has been done", async () => {
    const { client } = await loggedIn();
    for (const num of [1, 2, 3, 4, 5]) await grade(client, num, "mastered");
    const page = await text(client, "/");
    expect(page).toContain("整本题库都做过一遍了");
    expect(page).toContain('<a class="btn btn-primary" href="/bank">去题库</a>');
  });

  it("sends 去巩固 to the 考点 on the chapter page", async () => {
    const { client } = await loggedIn();
    await grade(client, 3, "unknown");
    expect(await text(client, "/")).toContain('<a class="btn btn-small" href="/bank/A?kp=3">去巩固</a>');
  });
});

describe("warm-up and due review", () => {
  it("are offered the next day as links to card pages", async () => {
    const { client, clock } = await loggedIn();
    await grade(client, 1, "shaky");
    clock.addDays(1);
    const page = await text(client, "/");
    expect(page).toContain('data-warmup-count="1"');
    expect(page).toContain('data-due-count="1"');
    expect(page).not.toContain("今天不用热身");
    // warm-up comes first tonight, so it alone gets the primary button
    expect(page).toContain('<a class="btn btn-primary" href="/review/warmup">开始热身</a>');
    expect(page).toContain('<a class="btn" href="/review/due">开始复习</a>');
    for (const mode of ["warmup", "due"]) {
      const cards = await text(client, `/review/${mode}`);
      expect(cards).toContain('id="q-1"');
      expect(cards).toContain('action="/q/1/grade"');
      expect(cards).toContain(`<input type="hidden" name="back" value="/review/${mode}#q-1"><input type="hidden" name="mode" value="${mode}">`);
      expect(visible(cards)).toContain("今天已评 0 / 1 题");
      expect(cards).not.toContain('id="q-2"');
    }
  });

  it("keep a card graded there on the page and record the grade as part of them", async () => {
    const { client, clock } = await loggedIn();
    await grade(client, 1, "shaky");
    await grade(client, 2, "mastered");
    clock.addDays(1);
    const res = await client.post("/q/1/grade", { grade: "mastered", mode: "warmup", back: "/review/warmup#q-1" });
    expect(res.headers.get("location")).toBe("/review/warmup#q-1");
    const cards = await text(client, "/review/warmup");
    expect(cards).toMatch(/id="q-1"[\s\S]*qc-grade-mastered is-picked[\s\S]*id="q-2"/);
    expect(visible(cards)).toContain("今天已评 1 / 2 题");
    expect(cards).toContain('<span class="js-graded">1</span>');
    expect(cards).toContain('<a class="btn js-all-graded" data-total="2" href="/">');
    expect(await text(client, "/")).toContain('data-warmup-count="1"');
    // #1 was due as well; graded today, it has left due review
    expect(await text(client, "/review/due")).toContain("今天没有到期的题。");
    expect(await reviewModes(client)).toEqual([[1, "browse"], [2, "browse"], [1, "warmup"]]);
    // changing the grade, even from the chapter page, keeps it a warm-up review on the warm-up page
    await grade(client, 1, "unknown", { back: "/bank/A?kp=1#q-1" });
    expect(await text(client, "/review/warmup")).toMatch(/id="q-1"[\s\S]*qc-grade-unknown is-picked[\s\S]*id="q-2"/);
    expect(await reviewModes(client)).toEqual([[1, "browse"], [2, "browse"], [1, "warmup"]]);
  });

  it("record any other mode as a chapter page grade", async () => {
    const { client } = await loggedIn();
    await grade(client, 1, "mastered", { mode: "group" });
    expect(await reviewModes(client)).toEqual([[1, "browse"]]);
  });

  it("have a calm note on a day with nothing to do, and no other pages", async () => {
    const { client } = await loggedIn();
    expect(await text(client, "/review/warmup")).toContain("今天不用热身。");
    expect((await client.get("/review/random")).status).toBe(404);
    expect((await client.get("/review/constructor")).status).toBe(404);
  });
});

describe("question rendering", () => {
  it("has an answer switch on the question page whose panel shows without JavaScript", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/q/1");
    expect(page).toContain('<button type="button" class="reveal-toggle js-reveal" aria-expanded="false" aria-controls="answer">');
    expect(page).toContain('<section id="answer" class="reveal-panel"');
    expect(page).toContain("这道题还没有逐题标注");
    expect(page).toContain('href="/knowledge/01?tab=text"');
  });

  it("links a tagged question to its knowledge section", async () => {
    const { client } = await loggedIn({ linking: LINKING });
    const page = await text(client, "/bank/A?kp=1");
    expect(page).toContain('href="/knowledge/01?tab=text#1-函数基础"');
    expect(page).toContain('data-anchor="1-函数基础"');
    expect(page).toContain('href="/knowledge/01#p1"');
    expect(page).toContain("原版第 1 页");
    expect(page).not.toContain("这道题还没有逐题标注");
    const detail = visible(await text(client, "/q/1"));
    expect(detail).toContain("相关知识点");
    expect(detail).toContain("1 函数基础");
  });

  it("shows the question as text with a switch to the image", async () => {
    const { client } = await loggedIn({ texts: TEXTS });
    const page = await text(client, "/bank/A?kp=1");
    expect(page).toContain('<div class="qview" data-view="text">');
    expect(page).toContain('<span class="math inline">f(x)=\\dfrac{1}{x}</span>');
    expect(page).toContain("<li><b>D.</b> 4.</li>");
    expect(page).toMatch(/class="qview-toggle js-qview"[^>]*hidden>原图<\/button>/);
    expect(page).toContain("katex.min.css");
    expect(page).toContain("katex.min.js");
    expect(page).toMatch(/class="qimg"[^>]*loading="lazy"/);
  });

  it("shows the answer's option and the erratum", async () => {
    const { client } = await loggedIn({ texts: TEXTS });
    const page = await text(client, "/bank/A?kp=1");
    expect(page).toContain('<p><b>C.</b> <span class="math inline">x&gt;\\dfrac12</span> 时有界</p>');
    expect(page).toContain('<p class="erratum"><b>勘误</b>速查原印 B</p>');
    expect(page).toContain('<details class="raw-img"><summary>答案原图</summary>');
  });

  it("opens a question with a figure on its image", async () => {
    const { client } = await loggedIn({ texts: TEXTS });
    const page = await text(client, "/q/3");
    expect(page).toContain('<div class="qview" data-view="image" data-figure>');
    expect(page).toMatch(/class="qimg"[^>]*fetchpriority="high"/);
  });

  it("shows the images when there is no text version", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/q/1");
    expect(page).toContain('<div class="qview" data-view="image">');
    expect(page).not.toContain("js-qview");
    expect(page).not.toContain("katex.min.css");
  });

  it("has no one-by-one practice page any more", async () => {
    const { client } = await loggedIn();
    expect((await client.post("/practice/start", { mode: "due" })).status).toBe(404);
    expect((await client.get("/practice/1")).status).toBe(404);
    const chapter = await text(client, "/bank/A?kp=1");
    expect(chapter).not.toContain('action="/practice/');
    expect(chapter).not.toContain("整个考点不做了");
    const question = await text(client, "/q/4");
    expect(question).not.toContain('action="/practice/');
    // the question page leads back to the card on the chapter page (#4 is in 考点 1 of chapter B)
    expect(question).toContain('href="/bank/B?kp=1#q-4"');
    expect(await text(client, "/q/6")).toContain('href="/bank/B?kp=2#q-6"');
  });
});

describe("不做 marks", () => {
  it("skips a whole 考点", async () => {
    const { client } = await loggedIn();
    const res = await client.post("/bank/exclude", { chapter: "A", section: "函数性质", kp: "有界", excluded: "1", back: "/bank/A" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bank/A");
    expect(await text(client, "/bank/A")).toContain('id="q-2"');
    expect(await text(client, "/")).toContain('href="/bank/A?kp=2">开始做题</a>');
    expect(await text(client, "/q/1")).toContain("不做");
  });

  it("starts with #006 excluded and can restore it", async () => {
    const { client } = await loggedIn();
    expect(await text(client, "/q/6")).toContain("仅数一");
    expect(await text(client, "/bank/B?kp=2")).not.toContain('action="/q/6/grade"');
    await client.post("/bank/exclude", { nums: "6", excluded: "0", back: "/q/6" });
    expect(await text(client, "/bank/B?kp=2")).toContain('action="/q/6/grade"');
  });
});

describe("bank", () => {
  it("shows a question page and searches", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/q/1");
    for (const s of ["有界", "2004数三", "a/001.webp"]) expect(page).toContain(s);
    const byNumber = await client.get("/bank/search?q=3");
    expect(byNumber.status).toBe(303);
    expect(byNumber.headers.get("location")).toBe("/q/3");
    expect(await text(client, "/bank/search?q=2004")).toContain("#001");
    expect((await client.get("/q/999")).status).toBe(404);
  });

  it("lists chapters, sections and 考点", async () => {
    const { client } = await loggedIn();
    expect(await text(client, "/bank")).toContain("函数极限连续");
    const chapter = await text(client, "/bank/B");
    expect(chapter).toContain("导数概念");
    expect(chapter).toContain("基本概念题");
    expect((await client.get("/bank/Z")).status).toBe(404);
  });

  it("lays out one 考点 with its questions on the chapter page", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/bank/B");
    expect(page).toContain('id="q-4"');
    expect(page).toContain('id="q-5"');
    expect(page).not.toContain('id="q-6"');
    expect(page).toContain('action="/q/4/grade"');
    expect(page).toContain('name="grade" value="mastered"');
    expect(page).toContain('id="qa-4"');
    expect(page).toContain('id="qs-4"');
    expect(page).toContain("s/004-1.webp");
    expect(page).toMatch(/class="qimg"[^>]*loading="lazy"/);
    expect(page).not.toContain("data-shortcuts");
    expect(page).toMatch(/href="\/bank\/B\?kp=2"[^>]*>\s*<span class="kt-name">隐函数求导<\/span>\s*<span class="kt-count">0 \/ 0<\/span>/);
  });

  it("opens on the first 考点 with work left, and takes ?kp=", async () => {
    const { client } = await loggedIn();
    expect(await text(client, "/bank/A")).toContain('id="q-1"');
    await client.post("/q/1/grade", { grade: "mastered" });
    const page = await text(client, "/bank/A");
    expect(page).toContain('id="q-2"');
    expect(page).not.toContain('id="q-1"');
    expect(await text(client, "/bank/A?kp=3")).toContain('id="q-3"');
    expect(await text(client, "/bank/A?kp=99")).toContain('id="q-2"');
    expect(await text(client, "/bank/A?kp=abc")).toContain('id="q-2"');
  });

  it("steps between 考点 and chapters", async () => {
    const { client } = await loggedIn();
    const first = await text(client, "/bank/A?kp=1");
    expect(first).toContain('href="/bank/A?kp=2"');
    expect(first).toContain("下一节");
    expect(first).not.toContain("上一章");
    expect(first).not.toContain("上一节");
    const last = await text(client, "/bank/A?kp=3");
    expect(last).toContain('href="/bank/B?kp=1"');
    expect(last).toContain("下一章");
    const nextChapter = await text(client, "/bank/B?kp=1");
    expect(nextChapter).toContain('href="/bank/A?kp=3"');
    expect(nextChapter).toContain("上一章");
  });

  it("grades from the chapter page, and the grade can be changed all day", async () => {
    const { client, clock } = await loggedIn();
    const res = await client.post("/q/4/grade", { grade: "mastered", back: "/bank/B?kp=1#q-4" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bank/B?kp=1#q-4");
    const page = await text(client, "/bank/B");
    expect(page).toContain('class="qc-grade qc-grade-mastered is-picked">掌握</button>');
    expect(page).not.toMatch(/qc-grade[^>]*disabled/);
    expect(page).not.toContain("今天已评");
    expect(await text(client, "/q/4")).toContain("chip-mastered");
    // a misclick is put right: the grade changes and it is still one review today
    await grade(client, 4, "unknown");
    const changed = await text(client, "/q/4");
    expect(changed.match(/chip-unknown/g)).toHaveLength(2); // status chip and the one history row
    expect(changed).not.toContain("chip-mastered");
    expect(await text(client, "/bank/B")).toContain('class="qc-grade qc-grade-unknown is-picked">不会</button>');
    // the picked grade again changes nothing
    await grade(client, 4, "unknown");
    expect((await text(client, "/q/4")).match(/chip-unknown/g)).toHaveLength(2);
    // the next study day it is a new review
    clock.addDays(1);
    await grade(client, 4, "shaky");
    const detail = visible(await text(client, "/q/4"));
    expect(detail).toContain("不熟练/错误");
    expect(detail).toContain("完全不会");
  });

  it("ignores bad input when grading from the chapter page", async () => {
    const { client } = await loggedIn();
    const res = await client.post("/q/4/grade", { grade: "perfect" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bank/B#q-4");
    expect(await text(client, "/bank/B")).not.toContain("is-picked");
    expect((await client.post("/q/999/grade", { grade: "mastered" })).status).toBe(404);
    const evil = await client.post("/q/4/grade", { grade: "shaky", back: "//evil.example" });
    expect(evil.headers.get("location")).toBe("/bank/B#q-4");
  });

  it("grades for the page script without a reload", async () => {
    const { client } = await loggedIn();
    const ask = (num: number, form: Record<string, string>) =>
      client.request(`/q/${num}/grade`, { method: "POST", body: new URLSearchParams(form), headers: { Accept: "application/json" } });
    const res = await ask(4, { grade: "mastered" });
    expect(res.status).toBe(200);
    let panel = ((await res.json()) as { history: string }).history;
    expect(panel).toContain("下次复习");
    expect(panel).toContain("已做 1 次");
    expect(panel.match(/chip-mastered/g)).toHaveLength(1);
    expect(await text(client, "/bank/B")).toContain(panel); // the card's 做题记录 as the page has it
    // changing the grade: the panel follows, still one review
    panel = ((await (await ask(4, { grade: "unknown", mode: "warmup" })).json()) as { history: string }).history;
    expect(panel).toContain("chip-unknown");
    expect(panel).not.toContain("chip-mastered");
    expect(panel).toContain("已做 1 次");
    expect(await reviewModes(client)).toEqual([[4, "browse"]]);
    // bad input records nothing
    expect(((await (await ask(4, { grade: "perfect" })).json()) as { history: string }).history).toBe(panel);
    const untouched = ((await (await ask(5, { grade: "perfect" })).json()) as { history: string }).history;
    expect(untouched).toContain("还没做过这道题");
    expect(untouched).not.toContain("下次复习");
    expect((await ask(999, { grade: "mastered" })).status).toBe(404);
  });

  it("sends the page script to the login page when the login has run out", async () => {
    const { client } = setup();
    const res = await client.request("/q/4/grade", { method: "POST", body: new URLSearchParams({ grade: "mastered" }), headers: { Accept: "application/json" } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?next=%2Fq%2F4%2Fgrade");
  });

  it("marks what the page script counts on a chapter page", async () => {
    const { client } = await loggedIn();
    await grade(client, 4, "mastered");
    const page = await text(client, "/bank/B?kp=1");
    // a question never graded is marked, so its first grade adds one to 做过
    expect(page.match(/<article [^>]*id="q-4"[^>]*>/)?.[0]).not.toContain("data-new");
    expect(page.match(/<article [^>]*id="q-5"[^>]*>/)?.[0]).toContain("data-new");
    expect(page.split('<span class="js-done">1</span>')).toHaveLength(3); // the heading and the current 考点 in the tree
    expect(page.split('js-done-bar" data-total="2"')).toHaveLength(3);
    expect(visible(page)).toContain("做过 1 / 2 题");
  });

  it("folds knowledge and history away on each card instead of a 详情 link", async () => {
    const { client } = await loggedIn({ linking: LINKING });
    const page = await text(client, "/bank/A?kp=1");
    expect(page).not.toContain(">详情</a>");
    expect(page).toContain('aria-controls="qk-1"');
    expect(page).toContain('aria-controls="qh-1"');
    expect(page).toContain('id="qk-1"');
    expect(page).toContain('data-anchor="1-函数基础"');
    expect(page).toContain("还没做过这道题");
    const untagged = await text(client, "/bank/A?kp=2");
    expect(untagged).toContain("这道题还没有逐题标注");
    expect(untagged).toContain('href="/knowledge/01?tab=text"');
    await client.post("/q/1/grade", { grade: "shaky" });
    const graded = await text(client, "/bank/A?kp=1");
    expect(graded).toMatch(/id="qh-1"[\s\S]*?chip chip-shaky">不熟练\/错误/);
    expect(graded).toContain("下次复习");
  });

  it("keeps excluded questions on the chapter page as a header only", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/bank/B?kp=2");
    expect(page).toContain('id="q-6"');
    expect(page).toContain('class="qcard is-excluded"');
    expect(page).not.toContain('action="/q/6/grade"');
    expect(page).toContain("恢复，要做");
  });

  it("shows the correct option and the question as text", async () => {
    const { client } = await loggedIn({ texts: TEXTS });
    const page = await text(client, "/bank/A?kp=1");
    expect(page).toContain("<li data-correct><b>C.</b>");
    expect(page).toContain("<li><b>A.</b>");
    expect(page).toContain('class="qtext"');
    expect(page).toContain("katex.min.js");
    expect(page).toMatch(/class="qcard"[^>]*data-choice/);
    expect(page).toContain("勘误");
  });
});

describe("search", () => {
  it("finds text in the stem", async () => {
    const { client } = await loggedIn({ texts: TEXTS });
    const page = await text(client, `/bank/search?q=${encodeURIComponent("再求拐点")}`);
    expect(page).toContain("#002");
    expect(page).not.toContain("#001");
    expect(page).toContain('<p class="snippet">求 x 的值 . (2) 再求拐点</p>');
  });
});

describe("knowledge", () => {
  it("lists the questions of each section under its heading", async () => {
    const { client } = await loggedIn({ linking: LINKING });
    await grade(client, 1, "shaky");
    const block = (await text(client, "/knowledge/01?tab=text")).split('id="1-函数基础"')[1];
    expect(block).toContain('class="section-qs"');
    expect(block).toContain('<a class="chip chip-shaky" href="/q/1">001</a>');
    expect(block).toContain('href="/q/3"');
    expect(block).not.toContain("练这");
  });

  it("lists the questions on each original page", async () => {
    const { client } = await loggedIn({ linking: LINKING });
    const page = await text(client, "/knowledge/01");
    expect(page).toContain('<figure class="kn-figure" id="p1">');
    expect(page).toContain("这一页的题目");
    expect(page).toContain('href="/q/3"');
  });

  it("shows the original pages and the text version", async () => {
    const { client } = await loggedIn();
    const index = await text(client, "/knowledge");
    for (const s of ["函数、极限与连续", "线性代数", "核对说明"]) expect(index).toContain(s);
    expect(await text(client, "/knowledge/01")).toContain("k/gaoshu-010.webp");
    const textTab = await text(client, "/knowledge/01?tab=text");
    expect(textTab).toContain('class="math inline"');
    expect(textTab).toContain('id="1-函数基础"');
    expect(textTab).toContain("katex.min.js");
    expect(await text(client, "/knowledge/xiandai?tab=text")).toContain("k/xiandai-001.webp");
    expect((await client.get("/knowledge/zz")).status).toBe(404);
  });
});

describe("history and settings", () => {
  it("lists reviews by day", async () => {
    const { client } = await loggedIn();
    await grade(client, 1, "mastered");
    const page = await text(client, "/history");
    expect(page).toContain("10月16日");
    expect(page).toContain("#001");
    expect(page).toContain("1 题");
  });

  it("shows who is logged in on the settings page", async () => {
    const { app, env, client } = await loggedIn();
    expect(visible(await text(client, "/settings"))).toContain("当前登录：me");
    const pal = new Client(app, env);
    await pal.login("pal", "pw2");
    expect(visible(await text(pal, "/settings"))).toContain("当前登录：pal");
  });

  it("changes the exam date", async () => {
    const { client } = await loggedIn();
    const res = await client.post("/settings", { exam_date: "2026-12-20", warmup_days: "2" });
    expect(res.status).toBe(303);
    expect(visible(await text(client, "/"))).toContain("还有 65 天");
  });

  it("downloads all learning data as JSON", async () => {
    const { client } = await loggedIn();
    await grade(client, 1, "mastered");
    const res = await client.get("/settings/export");
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    const dump = (await res.json()) as { tables: Record<string, unknown[]> };
    expect(dump.tables.reviews).toHaveLength(1);
  });
});
