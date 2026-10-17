// The owner and a friend use the same site and the same question bank, but never see each other's progress.
import { describe, expect, it } from "vitest";
import { Client, setup, visible } from "./harness";

async function twoUsers() {
  const { app, env, clock, client: me } = setup();
  const pal = new Client(app, env);
  await me.login();
  await pal.login("pal", "pw2");
  return { me, pal, clock };
}

const text = async (client: Client, path: string) => (await client.get(path)).text();

async function start(client: Client, form: Record<string, string>) {
  const res = await client.post("/practice/start", form);
  expect(res.status).toBe(303);
  return res.headers.get("location")!;
}

async function grade(client: Client, url: string, num: number, value: string) {
  expect((await client.post(`${url}/grade`, { num: String(num), grade: value })).status).toBe(303);
}

describe("two users on one site", () => {
  it("do not see each other's progress", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, await start(me, { mode: "group", chapter: "A" }), 1, "mastered");
    expect(await text(me, "/")).toContain('data-dist-mastered="1"');
    expect(await text(pal, "/")).toContain('data-dist-mastered="0"');
    expect(await text(me, "/history")).toContain("#001");
    expect(await text(pal, "/history")).not.toContain("#001");
  });

  it("each have their own review schedule", async () => {
    const { me, pal, clock } = await twoUsers();
    await grade(me, await start(me, { mode: "group", chapter: "A" }), 1, "shaky");
    clock.addDays(1);
    expect(await text(me, "/")).toContain('data-due-count="1"');
    expect(await text(pal, "/")).toContain('data-due-count="0"');
  });

  it("grade the same question without disturbing each other", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, await start(me, { mode: "single", nums: "2" }), 2, "mastered");
    await grade(pal, await start(pal, { mode: "single", nums: "2" }), 2, "unknown");
    expect(await text(me, "/")).toContain('data-dist-mastered="1"');
    expect(await text(me, "/")).toContain('data-dist-unknown="0"');
    expect(await text(pal, "/")).toContain('data-dist-mastered="0"');
    expect(await text(pal, "/")).toContain('data-dist-unknown="1"');
  });

  it("cannot open, grade or skip each other's practice sets", async () => {
    const { me, pal } = await twoUsers();
    const url = await start(me, { mode: "group", chapter: "A" });
    expect((await pal.get(url)).status).toBe(404);
    expect((await pal.post(`${url}/grade`, { num: "1", grade: "mastered" })).status).toBe(404);
    expect((await pal.post(`${url}/skip`, { num: "1" })).status).toBe(404);
    expect(await text(me, url)).toContain("#001");
    expect(await text(me, "/")).toContain('data-dist-mastered="0"');
    expect(await text(pal, "/")).toContain('data-dist-mastered="0"');
  });

  it("do not pick up each other's unfinished practice set on the dashboard", async () => {
    const { me, pal } = await twoUsers();
    const url = await start(me, { mode: "group", chapter: "A" });
    expect(await text(me, "/")).toContain(url);
    expect(await text(pal, "/")).not.toContain(url);
  });

  it("keep their own 不做 marks", async () => {
    const { me, pal } = await twoUsers();
    await me.post("/bank/exclude", { chapter: "A", section: "函数性质", kp: "有界", excluded: "1", back: "/bank/A" });
    expect(await text(me, await start(me, { mode: "group", chapter: "A" }))).toContain("#002");
    expect(await text(pal, await start(pal, { mode: "group", chapter: "A" }))).toContain("#001");
  });

  it("keep their own exam date", async () => {
    const { me, pal } = await twoUsers();
    await me.post("/settings", { exam_date: "2026-12-20", warmup_days: "2" });
    expect(visible(await text(me, "/"))).toContain("还有 65 天");
    expect(visible(await text(pal, "/"))).toContain("还有 64 天");
  });

  it("download only their own data", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, await start(me, { mode: "group", chapter: "A" }), 1, "mastered");
    type Dump = { tables: Record<string, unknown[]> };
    const mine = (await (await me.get("/settings/export")).json()) as Dump;
    const theirs = (await (await pal.get("/settings/export")).json()) as Dump;
    expect(mine.tables.reviews).toHaveLength(1);
    for (const rows of Object.values(theirs.tables)) expect(rows).toEqual([]);
  });
});
