// Port of tests/test_xiandai_site.py: the 线代 book's labels, its missing 答案速查, its subject group and its knowledge chapters.
import { describe, expect, it } from "vitest";
import { Content, parseLabel, qlabel, qshort } from "../src/content";
import { XIANDAI_TEXTS, question, smallBank, twoBooks } from "./fixtures";
import { setup, visible } from "./harness";

async function loggedIn() {
  const ctx = setup({ bank: twoBooks(), texts: XIANDAI_TEXTS });
  await ctx.client.login();
  return ctx;
}

const page = async (path: string) => {
  const { client } = await loggedIn();
  return (await client.get(path)).text();
};

describe("labels", () => {
  it("name the book", () => {
    expect([qlabel(7), qlabel(1001), qlabel(1355)]).toEqual(["#007", "线001", "线355"]);
    expect([qshort(7), qshort(1041)]).toEqual(["007", "线041"]);
    expect(["123", "#123", "线12", "线012", " 线1 ", "线", "abc"].map(parseLabel)).toEqual([123, 123, 1012, 1012, 1001, null, null]);
  });
});

describe("content", () => {
  it("keeps neighbours inside the same book and groups chapters by subject", () => {
    const content = new Content(twoBooks());
    expect(content.neighbors(3)).toEqual([2, null]);
    expect(content.neighbors(1001)).toEqual([null, 1002]);
    expect(content.neighbors(1002)).toEqual([1001, 1041]);
    expect(content.groups().map(([g]) => g)).toEqual(["高等数学", "线性代数"]);
  });

  it("reads a manifest without groups as all 高数", () => {
    const bank = { ...smallBank(), questions: [question(1)] };
    expect(new Content(bank).groups().map(([g]) => g)).toEqual(["高等数学"]);
  });
});

describe("线代 pages", () => {
  it("show a question page without the 高数 book's meta, and say the answer is in the solution", async () => {
    const text = visible(await page("/q/1001"));
    expect(text).toContain("线001 具体行列式计算");
    expect(text).toContain("答案见解析");
    expect(text).not.toContain("答案速查编号");
    expect(text).not.toContain("建议");
    expect(text).toContain("线002 →");
    expect(text).not.toContain("←");
  });

  it("show a text answer with no answer image", async () => {
    const html = await page("/q/1002");
    expect(html).toContain("2^{n+1}-2");
    expect(html).not.toContain("答案原图");
    expect(html).not.toContain("答案见解析");
    expect(visible(html)).toContain("← 线001");
  });

  it("do not lead from the last 高数 question into 线代", async () => {
    const text = visible(await page("/q/3"));
    expect(text).toContain("← #002");
    expect(text).not.toContain("线001");
  });

  it("are found by their 线代 number", async () => {
    const { client } = await loggedIn();
    const byLabel = await client.get("/bank/search?q=" + encodeURIComponent("线1"));
    expect(byLabel.status).toBe(303);
    expect(byLabel.headers.get("location")).toBe("/q/1001");
    expect((await client.get("/bank/search?q=2")).headers.get("location")).toBe("/q/2");
    expect(visible(await (await client.get("/bank/search?q=" + encodeURIComponent("抽象逆"))).text())).toContain("线041");
  });

  it("group the chapters by subject on the bank page and at home", async () => {
    const { client } = await loggedIn();
    const bank = visible(await (await client.get("/bank")).text());
    expect(bank.indexOf("高等数学")).toBeLessThan(bank.indexOf("函数极限连续"));
    expect(bank.indexOf("函数极限连续")).toBeLessThan(bank.indexOf("线性代数"));
    expect(bank.indexOf("线性代数")).toBeLessThan(bank.indexOf("行列式"));
    const home = visible(await (await client.get("/")).text());
    expect(home.indexOf("高等数学")).toBeLessThan(home.indexOf("线性代数"));
    expect(home.indexOf("线性代数")).toBeLessThan(home.indexOf("二次型"));
  });

  it("lay out a 线代 chapter as cards without the 高数 meta", async () => {
    const html = await page("/bank/L1");
    expect(html).toContain('id="q-1001"');
    expect(html).toContain('id="q-1002"');
    expect(html).not.toContain('id="q-1041"');
    expect(html).toContain('title="线001"');
    expect(html).not.toContain("qc-meta");
    expect(html).toContain("/knowledge/10?tab=text"); // the chapter's knowledge until the questions are tagged
  });

  it("keep the 高数 card's meta", async () => {
    expect(visible(await page("/bank/A"))).toContain("建议 5 分钟");
  });

  it("grade a 线代 question", async () => {
    const { client } = await loggedIn();
    const res = await client.post("/q/1001/grade", { owner: "1", grade: "mastered" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bank/L1#q-1001");
    const bank = visible(await (await client.get("/bank")).text());
    expect(bank.indexOf("行列式 做过 1 / 2 题")).toBeGreaterThan(bank.indexOf("线性代数"));
  });

  it("send the old one-page mind map link to its first chapter", async () => {
    const { client } = await loggedIn();
    const res = await client.get("/knowledge/xiandai");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/knowledge/10");
    const text = visible(await (await client.get("/knowledge/10")).text());
    expect(text).toContain("行列式");
    expect(text).toContain("刷行列式的题");
  });

  it("show only the original pages of a knowledge chapter without Markdown", async () => {
    expect(await page("/knowledge/11?tab=text")).toContain("xiandai-003.webp");
  });
});
