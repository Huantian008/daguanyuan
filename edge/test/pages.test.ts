// Port of tests/test_app.py: the same user-visible behaviour, now against the Worker and D1.
import { describe, expect, it } from "vitest";
import { Client, setup, visible } from "./harness";

async function loggedIn() {
  const ctx = setup();
  await ctx.client.login();
  return ctx;
}

async function start(client: Client, form: Record<string, string>) {
  const res = await client.post("/practice/start", form);
  expect(res.status).toBe(303);
  return res.headers.get("location")!;
}

async function grade(client: Client, url: string, num: number, value: string, elapsed = "90") {
  const res = await client.post(`${url}/grade`, { num: String(num), grade: value, elapsed });
  expect(res.status).toBe(303);
}

const text = async (client: Client, path: string) => (await client.get(path)).text();

describe("dashboard", () => {
  it("shows the exam countdown and empty queues", async () => {
    const { client } = await loggedIn();
    const page = await text(client, "/");
    expect(visible(page)).toContain("还有 64 天");
    expect(page).toContain('data-due-count="0"');
    expect(page).toContain('data-warmup-count="0"');
  });
});

describe("practice", () => {
  it("grades a question and moves to the next one", async () => {
    const { client } = await loggedIn();
    const url = await start(client, { mode: "group", chapter: "A" });
    const page = await text(client, url);
    expect(page).toContain("#001");
    for (const src of ["q/001.webp", "a/001.webp", "s/001-1.webp"]) expect(page).toContain(src);
    expect(page).toContain('rel="prefetch"');
    await grade(client, url, 1, "unknown");
    expect(await text(client, url)).toContain("#002");
    expect(await text(client, "/")).toContain('data-dist-unknown="1"');
  });

  it("ignores a grade for a question that is not the current one", async () => {
    const { client } = await loggedIn();
    const url = await start(client, { mode: "group", chapter: "A" });
    await grade(client, url, 3, "mastered");
    expect(await text(client, url)).toContain("#001");
    expect(await text(client, "/")).toContain('data-dist-mastered="0"');
  });

  it("offers warm-up and due review the next day", async () => {
    const { client, clock } = await loggedIn();
    const url = await start(client, { mode: "group", chapter: "A" });
    await grade(client, url, 1, "shaky");
    clock.addDays(1);
    const page = await text(client, "/");
    expect(page).toContain('data-warmup-count="1"');
    expect(page).toContain('data-due-count="1"');
    expect(await text(client, await start(client, { mode: "due" }))).toContain("#001");
  });

  it("shows a summary when the set is finished", async () => {
    const { client } = await loggedIn();
    const url = await start(client, { mode: "single", nums: "2" });
    await grade(client, url, 2, "mastered");
    const page = await text(client, url);
    expect(page).toContain("这组做完了");
    expect(page).toContain("完全掌握 1");
  });

  it("can skip a question", async () => {
    const { client } = await loggedIn();
    const url = await start(client, { mode: "group", chapter: "A" });
    expect((await client.post(`${url}/skip`, { num: "1" })).status).toBe(303);
    expect(await text(client, url)).toContain("#002");
  });

  it("starts random practice from the bank", async () => {
    const { client } = await loggedIn();
    expect(await text(client, "/bank")).toContain('name="mode" value="random"');
    const first = await text(client, await start(client, { mode: "random", only: "new" }));
    expect(first).toContain("随机");
    expect(first).toContain("#00");
  });
});

describe("不做 marks", () => {
  it("removes a whole 考点 from queues", async () => {
    const { client } = await loggedIn();
    const res = await client.post("/bank/exclude", { chapter: "A", section: "函数性质", kp: "有界", excluded: "1", back: "/bank/A" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bank/A");
    expect(await text(client, await start(client, { mode: "group", chapter: "A" }))).toContain("#002");
    expect(await text(client, "/q/1")).toContain("不做");
  });

  it("starts with #006 excluded and can restore it", async () => {
    const { client } = await loggedIn();
    expect(await text(client, "/q/6")).toContain("仅数一");
    expect(await text(client, await start(client, { mode: "group", chapter: "B", kp: "隐函数求导" }))).not.toContain("#006");
    await client.post("/bank/exclude", { nums: "6", excluded: "0", back: "/q/6" });
    expect(await text(client, await start(client, { mode: "group", chapter: "B", kp: "隐函数求导" }))).toContain("#006");
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
});

describe("knowledge", () => {
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
    const url = await start(client, { mode: "group", chapter: "A" });
    await grade(client, url, 1, "mastered");
    const page = await text(client, "/history");
    expect(page).toContain("10月16日");
    expect(page).toContain("#001");
    expect(page).toContain("2 分钟"); // 90 s rounds half up to 2 minutes, like the Python version
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
    const url = await start(client, { mode: "group", chapter: "A" });
    await grade(client, url, 1, "mastered");
    const res = await client.get("/settings/export");
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    const dump = (await res.json()) as { tables: Record<string, unknown[]> };
    expect(dump.tables.reviews).toHaveLength(1);
  });
});
