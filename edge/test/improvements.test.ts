import { describe, expect, it } from "vitest";
import { setup, visible } from "./harness";
import { twoBooks } from "./fixtures";
import { historiesFor, recordReview, warmupLog } from "../src/db";

const grade = (client: ReturnType<typeof setup>["client"], num: number, value = "unknown") =>
  client.post(`/q/${num}/grade`, { owner: "1", grade: value });

describe("learning flow improvements", () => {
  it("loads over 100 histories without exceeding D1 bindings or mixing accounts", async () => {
    const { env } = setup();
    const at = new Date("2026-10-16T21:00:00+08:00");
    for (const num of [1, 99, 100, 198, 205]) await recordReview(env.DB, 1, { num, grade: "unknown", at, mode: "due" });
    await recordReview(env.DB, 2, { num: 100, grade: "mastered", at, mode: "due" });
    const result = await historiesFor(env.DB, 1, Array.from({ length: 205 }, (_, i) => i + 1));
    expect(result.size).toBe(205);
    expect([...result.values()].flat()).toHaveLength(5);
    expect(result.get(100)?.[0].grade).toBe("unknown");
  });
  it("keeps the same warmup after a 500-day break on home and review pages", async () => {
    const { client, clock, env } = setup();
    await client.login(); await grade(client, 1);
    clock.addDays(500); await client.login();
    expect(await (await client.get("/")).text()).toContain('data-warmup-count="1"');
    expect(await (await client.get("/review/warmup")).text()).toContain('id="q-1"');
    expect(await warmupLog(env.DB, 2, "2028-03-01", 3)).toEqual([]);
  });
  it("rejects old-account and missing-owner exclude, settings and logout forms", async () => {
    const { client } = setup();
    await client.login();
    for (const path of ["/bank/A", "/settings"]) expect(await (await client.get(path)).text()).toContain('name="owner" value="1"');
    await client.login("pal", "pw2");
    for (const owner of ["", "1"]) {
      for (const [path, form] of [
        ["/bank/exclude", { nums: "1", excluded: "1" }],
        ["/settings", { exam_date: "2027-01-01", warmup_days: "7" }],
        ["/logout", {}],
      ] as [string, Record<string, string>][]) {
        expect((await client.post(path, { owner, ...form })).status).toBe(409);
      }
    }
    const dump = await (await client.get("/settings/export")).json() as any;
    expect(dump.tables.exclusions).toEqual([]); expect(dump.tables.settings).toEqual([]);
    expect((await client.post("/settings", { owner: "2", warmup_days: "7" })).status).toBe(303);
  });
  it("rejects a queued grade from another study day without writing anything", async () => {
    const { client, clock } = setup(); await client.login();
    const bad = await client.post("/q/1/grade", { owner: "1", day: "2026-10-15", grade: "mastered" });
    expect(bad.status).toBe(422); expect(await bad.json()).toMatchObject({ code: "day_changed" });
    await client.post("/q/1/grade", { owner: "1", day: "2026-10-16", grade: "mastered" });
    clock.addDays(1);
    await client.post("/q/1/grade", { owner: "1", day: "2026-10-17", grade: "mastered" });
    const dump = await (await client.get("/settings/export")).json() as any;
    expect(dump.tables.reviews).toHaveLength(2);
  });
  it("filters chapter cards but retains their original sequence numbers and totals", async () => {
    const { client } = setup(); await client.login(); await grade(client, 4);
    const page = await (await client.get("/bank/B?kp=1&status=new")).text();
    expect(page).not.toContain('id="q-4"'); expect(page).toContain('id="q-5"');
    expect(page).toContain('title="#005">2</strong>');
    expect(visible(page)).toContain("做过 1 / 2 题");
    expect(page).toContain('status=new');
    const empty = await (await client.get("/bank/B?kp=1&status=shaky")).text();
    expect(empty).toContain("没有符合筛选的题目");
  });
  it("combines whitespace-normalized tokens, subject and status filters", async () => {
    const { client } = setup({ bank: twoBooks() }); await client.login(); await grade(client, 1);
    let page = await (await client.get("/bank/search?q=2004%20%20%20有界&subject=gaoshu&status=unknown")).text();
    expect(page).toContain('href="/q/1"'); expect(visible(page)).toContain("找到 1 题");
    page = await (await client.get("/bank/search?subject=xiandai&status=new")).text();
    expect(visible(page)).toContain("找到 3 题"); expect(page).not.toContain('href="/q/1"');
    expect((await client.get("/bank/search?q=线%20１")).headers.get("location")).toBe("/q/1001");
    page = await (await client.get("/bank/search?q=1&subject=xiandai")).text();
    expect(page).toContain("没有找到");
  });
  it("provides accessible full-resolution solution links with a no-script fallback", async () => {
    const { client } = setup(); await client.login();
    const page = await (await client.get("/bank/A")).text();
    expect(page).toContain('class="solution-zoom" href="/content/s/001-1.webp?v=');
    expect(page).toContain('aria-label="放大解析图片"');
    expect(page).not.toContain('title="点按放大"');
    expect(page).toContain('data-study-day="2026-10-16"');
  });
});
