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

async function grade(client: Client, num: number, value: string, form: Record<string, string> = {}) {
  const page = await text(client, `/bank/A`);
  const owner = page.match(/data-grade-owner="([^"]+)"/)![1];
  expect((await client.post(`/q/${num}/grade`, { owner, grade: value, ...form })).status).toBe(303);
}

describe("two users on one site", () => {
  it("binds pages and forms to their account and rejects another account's pending grade", async () => {
    const { me, pal } = await twoUsers();
    const page = await text(me, "/bank/A");
    expect(page).toContain('data-grade-owner="1"');
    expect(page).toContain('name="owner" value="1"');
    expect(page).toContain('value="mastered" aria-pressed="false"');
    expect(page).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(await text(pal, "/bank/A")).toContain('data-grade-owner="2"');
    for (const owner of ["1", ""]) {
      const response = await pal.post("/q/1/grade", { owner, grade: "unknown" });
      expect(response.status).toBe(409);
    }
    expect(await text(pal, "/")).toContain('data-dist-unknown="0"');
    expect(await text(me, "/")).toContain('data-dist-unknown="0"');
    expect(await text(me, "/login")).toContain('data-grade-owner=""');
  });

  it("rejects a stale page after the same browser switches accounts", async () => {
    const { me } = await twoUsers();
    await me.post("/logout", { owner: "1" });
    await me.login("pal", "pw2");
    expect((await me.post("/q/1/grade", { owner: "1", grade: "unknown" })).status).toBe(409);
    expect(await text(me, "/")).toContain('data-dist-unknown="0"');
  });

  it("do not see each other's progress", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, 1, "mastered");
    expect(await text(me, "/")).toContain('data-dist-mastered="1"');
    expect(await text(pal, "/")).toContain('data-dist-mastered="0"');
    expect(await text(me, "/history")).toContain("#001");
    expect(await text(pal, "/history")).not.toContain("#001");
  });

  it("each have their own review schedule", async () => {
    const { me, pal, clock } = await twoUsers();
    await grade(me, 1, "shaky");
    clock.addDays(1);
    expect(await text(me, "/")).toContain('data-due-count="1"');
    expect(await text(pal, "/")).toContain('data-due-count="0"');
  });

  it("grade the same question without disturbing each other", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, 2, "mastered");
    await grade(pal, 2, "unknown");
    expect(await text(me, "/")).toContain('data-dist-mastered="1"');
    expect(await text(me, "/")).toContain('data-dist-unknown="0"');
    expect(await text(pal, "/")).toContain('data-dist-mastered="0"');
    expect(await text(pal, "/")).toContain('data-dist-unknown="1"');
  });

  it("each see only their own warm-up and due review", async () => {
    const { me, pal, clock } = await twoUsers();
    await grade(me, 1, "shaky");
    clock.addDays(1);
    for (const mode of ["warmup", "due"]) {
      expect(await text(me, `/review/${mode}`)).toContain('id="q-1"');
      expect(await text(pal, `/review/${mode}`)).not.toContain('id="q-1"');
    }
    // what the friend grades as warm-up does not count on my page
    await grade(pal, 1, "mastered", { mode: "warmup" });
    expect(visible(await text(me, "/review/warmup"))).toContain("今天已评 0 / 1 题");
  });

  it("each continue from their own last question", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, 4, "mastered");
    expect(await text(me, "/")).toContain('href="/bank/B?kp=1#q-5">继续上次</a>');
    expect(await text(pal, "/")).toContain('href="/bank/A?kp=1#q-1">开始做题</a>');
  });

  it("keep their own 不做 marks", async () => {
    const { me, pal } = await twoUsers();
    await me.post("/bank/exclude", { owner: "1", chapter: "A", section: "函数性质", kp: "有界", excluded: "1", back: "/bank/A" });
    expect(await text(me, "/bank/A")).not.toContain('id="q-1"');
    expect(await text(pal, "/bank/A")).toContain('id="q-1"');
  });

  it("keep their own exam date", async () => {
    const { me, pal } = await twoUsers();
    await me.post("/settings", { owner: "1", exam_date: "2026-12-20", warmup_days: "2" });
    expect(visible(await text(me, "/"))).toContain("还有 65 天");
    expect(visible(await text(pal, "/"))).toContain("还有 64 天");
  });

  it("download only their own data", async () => {
    const { me, pal } = await twoUsers();
    await grade(me, 1, "mastered");
    type Dump = { tables: Record<string, unknown[]> };
    const mine = (await (await me.get("/settings/export")).json()) as Dump;
    const theirs = (await (await pal.get("/settings/export")).json()) as Dump;
    expect(mine.tables.reviews).toHaveLength(1);
    for (const rows of Object.values(theirs.tables)) expect(rows).toEqual([]);
  });
});
