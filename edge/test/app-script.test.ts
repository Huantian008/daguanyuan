// Run the shipped script with a minimal DOM; actual formula layout is checked in a real browser.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { setup } from "./harness";
const script = readFileSync(new URL("../../dgy/static/js/app.js", import.meta.url), "utf8");
const entry = (owner = "1", grade = "unknown", id = "first") => ({ owner, grade, id, mode: "warmup", day: new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10) });
const key = (owner: string) => `dgy-pending-grades:${owner}`;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
const response = () => new Response('{"history":"saved"}', { headers: { "content-type": "application/json" } });
function classes() {
  const values = new Set<string>();
  return { contains: (n: string) => values.has(n), toggle(n: string, enabled: boolean) { if (enabled) values.add(n); else values.delete(n); } };
}
function element() {
  return {
    className: "", textContent: "", hidden: false, href: "", children: [] as any[], events: {} as Record<string, Function>,
    setAttribute() {}, append(...nodes: any[]) { this.children.push(...nodes); },
    replaceChildren(...nodes: any[]) { this.children = nodes; },
    addEventListener(name: string, fn: Function) { this.events[name] = fn; },
  };
}
function imageDialog() {
  const controls = Object.fromEntries(["in", "out", "fit"].map((name) => [name, { ...element(), disabled: false, dataset: { zoom: name } }]));
  const zoom = element(), close = element();
  const image = { ...element(), src: "", naturalWidth: 1600, style: { width: "" }, getBoundingClientRect() { return { width: parseFloat(this.style.width) || 1600 }; } };
  const stage = { ...element(), clientWidth: 824, clientHeight: 600, scrollLeft: 0, scrollTop: 0, setPointerCapture: vi.fn() };
  const dialog = {
    ...element(), open: false, innerHTML: "",
    showModal() { this.open = true; }, close() { this.open = false; this.events.close?.(); },
    querySelector: (s: string): any => s === "img" ? image : s === ".zoom-stage" ? stage : s === ".zoom-value" ? zoom : s === ".zoom-close" ? close : controls[s.match(/data-zoom="(\w+)"/)![1]],
  };
  return { dialog, image, stage, zoom, close, controls,
    action: (name: string) => dialog.events.click({ target: { closest: () => controls[name] } }),
  };
}
// The chapter page's 考点 tree: like a real element, it has no height or position while display: none and stops at 0.
function kpTree({ currentAt = 200, narrow = false } = {}) {
  let top = 0;
  const tree = {
    ...element(), clientHeight: narrow ? 0 : 700, offsetWidth: 264, contains: () => false,
    get scrollTop() { return this.clientHeight ? top : 0; },
    set scrollTop(value: number) { if (this.clientHeight) top = Math.max(0, value); },
    getBoundingClientRect: () => tree.clientHeight ? { top: 44, bottom: 44 + tree.clientHeight } : { top: 0, bottom: 0 },
    querySelector: () => ({
      getBoundingClientRect: () => {
        if (!tree.clientHeight) return { top: 0, bottom: 0, height: 0 };
        const y = 44 + currentAt - tree.scrollTop;
        return { top: y, bottom: y + 40, height: 40 };
      },
    }),
  };
  const toggle = { ...element(), title: "", contains: () => false };
  const drill = { classList: { add() {}, toggle() {} } };
  return { narrow, tree, toggle, find: (s: string) => s === ".drill" ? drill : s === ".js-tree-toggle" ? toggle : s === "#kp-tree" ? tree : null };
}
// A question's note box as the script sees it.
function noteBox(num = 7, value = "") {
  const area = { ...element(), value };
  const status = { textContent: "", classList: classes() };
  const save = { hidden: false };
  const preview = element();
  const toggle = { classList: classes() };
  const form = {
    ...element(), elements: { note: area }, closest: (_: string): unknown => null, getAttribute: () => `/q/${num}/note`,
    querySelector: (s: string) => s === ".note-status" ? status : s === ".note-preview" ? preview : save,
  };
  return { num, form, area, status, save, preview, toggle, type(text: string) { area.value = text; area.events.input(); } };
}
function page(owner: string, storage = new Map<string, string>(), options: {
  fetch?: any; blocked?: boolean; fullStorage?: boolean; maths?: any[]; cards?: any[]; observer?: (callback: (entries: any[]) => void) => void; clock?: DateConstructor; studyDay?: string; dialog?: boolean;
  tree?: ReturnType<typeof kpTree>; session?: Map<string, string>; notes?: ReturnType<typeof noteBox>[];
} = {}) {
  const listeners: Record<string, Function> = {};
  const listen = (name: string, fn: Function) => {
    const previous = listeners[name];
    listeners[name] = (event: any) => { previous?.(event); fn(event); };
  };
  const viewer = imageDialog();
  const timers = new Map<number, { fn: Function; delay: number }>();
  let timerId = 0;
  const status = { textContent: "", classList: classes() };
  const retry = { ...element(), closest: () => form };
  const pendingList = element(), retryAll = element(), login = element();
  const pendingBox = { ...element(), querySelector: (s: string) => s === "ul" ? pendingList : s === ".js-sync-login" ? login : retryAll };
  const buttons = ["shaky", "unknown", "mastered"].map((value) => ({ value, classList: classes(), attrs: new Map<string, string>(), setAttribute(n: string, v: string) { this.attrs.set(n, v); } }));
  const form = {
    dataset: { questionLabel: "#001" },
    elements: { mode: { value: "warmup" }, day: { value: "" } }, matches: (s: string) => s === "form.qc-grades", getAttribute: () => "/q/1/grade", setAttribute() {},
    querySelector: (s: string) => s === ".qc-save-status" ? status : s === ".js-grade-retry" ? retry : null,
    querySelectorAll: (s: string) => s === ".qc-grade" ? buttons : [], closest: () => ({ dataset: {} }),
  };
  const panel = { innerHTML: "" }, notices: any[] = [];
  const document = {
    documentElement: { dataset: {} }, body: { ...element(), dataset: { gradeOwner: owner, studyDay: options.studyDay } }, currentScript: null,
    querySelector: (s: string) => s.includes("form.qc-grades") ? form
      : s.startsWith("form.note-form") ? options.notes?.find((n) => s.includes(`/q/${n.num}/note`))?.form ?? null
      : s.startsWith("[aria-controls=\"qn-") ? options.notes?.find((n) => s.includes(`qn-${n.num}`))?.toggle ?? null
      : options.tree?.find(s) ?? null,
    querySelectorAll: (s: string) => s === "form.note-form" ? options.notes?.map((n) => n.form) ?? [] : s === "form.qc-grades" ? [form] : s === ".js-grade-retry" ? [retry] : s === ".qcard" ? options.cards ?? [] : s === ".math.inline, .math.block" ? options.maths ?? [] : [],
    addEventListener: listen,
    getElementById: (id: string) => id === "main" ? { prepend: (node: any) => notices.push(node) } : id === "pending-grades" ? pendingBox : id.startsWith("qh-") ? panel : null,
    createElement: (name: string) => name === "dialog" ? viewer.dialog : element(),
  };
  const network = vi.fn(options.fetch ?? (async () => response())), render = vi.fn();
  runInNewContext(script, {
    document, window: { katex: { render } }, fetch: network, crypto: { randomUUID }, URL, URLSearchParams, FormData, Date: options.clock ?? Date, AbortController,
    setTimeout: (fn: Function, delay: number) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    location: { href: "https://example.test/bank/A?kp=1#q-1", pathname: "/bank/A", search: "?kp=1", hash: "#q-1" }, performance: { getEntriesByType: () => [] }, innerHeight: 800,
    localStorage: {
      getItem: (n: string) => { if (options.blocked) throw Error("blocked"); return storage.get(n) ?? null; },
      setItem: (n: string, v: string) => { if (options.blocked || options.fullStorage) throw Error("blocked"); storage.set(n, v); },
      removeItem: (n: string) => { if (options.blocked) throw Error("blocked"); storage.delete(n); },
    },
    addEventListener: listen,
    ...(options.tree ? {
      matchMedia: (query: string) => ({ matches: query.includes("max-width") && options.tree!.narrow, addEventListener() {} }),
      requestAnimationFrame: () => 0,
      sessionStorage: {
        getItem: (n: string) => { if (options.blocked) throw Error("blocked"); return options.session?.get(n) ?? null; },
        setItem: (n: string, v: string) => { if (options.blocked) throw Error("blocked"); options.session?.set(n, v); },
      },
    } : {}),
    ...(options.dialog ? { HTMLDialogElement: class {} } : {}),
    ...(options.observer ? { IntersectionObserver: class {
      constructor(callback: (entries: any[]) => void) { options.observer!(callback); } observe() {} unobserve() {}
    } } : {}),
  });
  return { network, status, buttons, panel, notices, render, listeners, timers, retry, retryAll, login, pendingBox, pendingList, form, viewer,
    runTimer: async (delay: number) => {
      const timer = [...timers].find(([, value]) => value.delay === delay);
      expect(timer, `expected a ${delay}ms timer`).toBeDefined();
      timers.delete(timer![0]); timer![1].fn(); await flush();
    },
    submit: (grade: string) => listeners.submit({ target: form, submitter: buttons.find((b) => b.value === grade), preventDefault() {} }) };
}

describe("formulas in notes", () => {
  const formulas = (p: ReturnType<typeof page>) => p.render.mock.calls.map(([source, , options]: any[]) => [source, options.displayMode]);
  it("shows a preview only while the note has a formula, with the rest as text", () => {
    const box = noteBox();
    const p = page("1", new Map(), { notes: [box] });
    expect(box.preview.hidden).toBe(true);
    box.type("令 $x-1=t$，再\n$$\\int_0^1 t\\,dt$$\n<b>得解</b>");
    expect(box.preview.hidden).toBe(false);
    expect(formulas(p)).toEqual([["x-1=t", false], ["\\int_0^1 t\\,dt", true]]);
    expect(box.preview.children.map((piece) => piece.textContent)).toEqual(["令 ", "", "，再", "", "<b>得解</b>"]);
    box.type("没有公式了");
    expect(box.preview.hidden).toBe(true);
    expect(box.preview.children).toHaveLength(0);
  });
  it.each([
    ["\\(a\\) 和 \\[b\\]", [["a", false], ["b", true]]],
    ["$\\{a\\}$", [["\\{a\\}", false]]],
    ["$$a\n+b$$", [["a\n+b", true]]],
    ["$a$，$b$", [["a", false], ["b", false]]],
    ["$x $ 和 $y$", [["y", false]]],
  ])("reads %j as formulas", (text, expected) => {
    const box = noteBox();
    const p = page("1", new Map(), { notes: [box] });
    box.type(text);
    expect(formulas(p)).toEqual(expected);
  });
  it.each(["$5 和 $6", "a $ b $ c", "$a$5", "\\$a\\$", "只有一个 $", "$跨\n行$", "$$没有收尾"])("leaves %j as text", (text) => {
    const box = noteBox();
    const p = page("1", new Map(), { notes: [box] });
    box.type(text);
    expect(p.render).not.toHaveBeenCalled();
    expect(box.preview.hidden).toBe(true);
  });
  it("turns an escaped dollar into a dollar sign next to a formula", () => {
    const box = noteBox();
    page("1", new Map(), { notes: [box] });
    box.type("花了 \\$5，$x$");
    expect(box.preview.children[0].textContent).toBe("花了 $5，");
  });
  it("renders a saved note when the page opens, but not one folded away on a card", () => {
    const open = noteBox(7, "$a$"), folded = noteBox(8, "$b$");
    folded.form.closest = (selector: string) => selector.includes("qc-panel") ? {} : null;
    const p = page("1", new Map(), { notes: [open, folded] });
    expect(formulas(p)).toEqual([["a", false]]);
    expect(open.preview.hidden).toBe(false);
    expect(folded.preview.children).toHaveLength(0);
  });
});

describe("pending grades", () => {
  it("never replays another account's queue or anonymous legacy entries", async () => {
    const storage = new Map([[key("1"), JSON.stringify({ 1: entry() })], ["dgy-pending-grades", JSON.stringify({ 1: entry() })]]);
    const other = page("2", storage), login = page("", storage);
    await flush();
    expect(other.network).not.toHaveBeenCalled();
    expect(login.network).not.toHaveBeenCalled();
    expect(storage.size).toBe(2);
    expect(other.notices[0].textContent).toContain("未自动提交");
    expect(login.notices).toHaveLength(0);
  });
  it("replays the owner's queue and updates selection and saved status", async () => {
    const storage = new Map([[key("1"), JSON.stringify({ 1: entry() })]]);
    const p = page("1", storage);
    await flush();
    expect(p.network).toHaveBeenCalledTimes(1);
    expect((p.network.mock.calls[0][1] as RequestInit).body!.toString()).toContain("owner=1");
    expect(p.buttons[1].attrs.get("aria-pressed")).toBe("true");
    expect(storage.has(key("1"))).toBe(false);
    expect(p.status.textContent).toBe("评价已保存");
  });
  it("rejects an old tab after switching accounts through the actual HTTP route", async () => {
    const { client } = setup();
    await client.login("pal", "pw2");
    const storage = new Map([[key("1"), JSON.stringify({ 1: entry() })]]);
    const p = page("1", storage, { fetch: (path: string, init: RequestInit) => client.request(path, init) });
    await flush();
    expect(storage.has(key("1"))).toBe(true);
    expect(p.status.textContent).toContain("当前登录账号已改变");
    expect((await (await client.get("/settings/export")).json() as any).tables.reviews).toEqual([]);
  });
  it("preserves a failed grade and retries on reconnect", async () => {
    let online = false;
    const storage = new Map<string, string>();
    const p = page("1", storage, { fetch: async () => { if (!online) throw Error("offline"); return response(); } });
    p.submit("shaky");
    await flush();
    expect(JSON.parse(storage.get(key("1"))!)[1].grade).toBe("shaky");
    expect(p.status.classList.contains("visually-hidden")).toBe(false);
    online = true;
    p.listeners.online();
    await flush();
    expect(storage.has(key("1"))).toBe(false);
    expect(p.status.textContent).toBe("评价已保存");
  });
  it("does not clear a newer same-grade action when an old request finishes", async () => {
    let finish!: (r: Response) => void;
    const storage = new Map([[key("1"), JSON.stringify({ 1: entry() })]]);
    const p = page("1", storage, { fetch: vi.fn().mockImplementationOnce(() => new Promise<Response>((r) => { finish = r; })).mockRejectedValueOnce(Error("offline")) });
    storage.set(key("1"), JSON.stringify({ 1: entry("1", "unknown", "newer") }));
    finish(response());
    await flush();
    expect(p.network).toHaveBeenCalledTimes(2);
    expect(JSON.parse(storage.get(key("1"))!)[1].id).toBe("newer");
    expect(p.panel.innerHTML).toBe("");
  });
  it("saves even when storage is blocked", async () => {
    const p = page("local", new Map(), { blocked: true });
    p.submit("mastered");
    await flush();
    expect(p.network).toHaveBeenCalledTimes(1);
    expect(p.status.textContent).toBe("评价已保存");
  });
  it("keeps an in-memory queue when storage reads work but writes hit quota", async () => {
    const p = page("local", new Map(), { fullStorage: true });
    p.submit("mastered");
    await flush();
    expect(p.network).toHaveBeenCalledTimes(1);
    expect(p.status.textContent).toBe("评价已保存");
  });
  it("never shows the unsaved notice for a save that succeeds, even with a second click while the first is on its way", async () => {
    const replies: ((res: Response) => void)[] = [];
    const p = page("1", new Map(), { fetch: () => new Promise<Response>((resolve) => replies.push(resolve)) });
    const shown = vi.fn();
    Object.defineProperty(p.pendingBox, "hidden", { set: (hidden: boolean) => { if (!hidden) shown(); } });
    p.submit("shaky"); await flush();
    p.submit("mastered"); await flush();
    replies[0](response()); await flush();
    replies[1](response()); await flush();
    expect(p.network).toHaveBeenCalledTimes(2);
    expect(shown).not.toHaveBeenCalled();
    expect(p.status.textContent).toBe("评价已保存");
  });
  it("sends a grade left over from an earlier page without showing the notice", async () => {
    const storage = new Map([[key("1"), JSON.stringify({ 1: entry() })]]);
    const p = page("1", storage, { fetch: () => new Promise<Response>(() => {}) });
    await flush();
    expect(p.network).toHaveBeenCalledTimes(1);
    expect(p.pendingBox.hidden).toBe(true);
    expect(p.pendingList.children).toHaveLength(0);
  });
  it("lists a grade once saving it has failed and keeps it there through the retry", async () => {
    let online = false, reply!: (res: Response) => void;
    const p = page("1", new Map(), { fetch: () => online ? new Promise<Response>((resolve) => { reply = resolve; }) : Promise.reject(Error("offline")) });
    const message = () => p.pendingList.children[0].children[1].textContent;
    p.submit("unknown"); await flush();
    expect(p.pendingBox.hidden).toBe(false);
    expect(message()).toContain("正在等待重试");
    online = true;
    await p.runTimer(1500);
    expect(p.pendingBox.hidden).toBe(false);
    expect(message()).toContain("正在保存");
    reply(response()); await flush();
    expect(p.pendingBox.hidden).toBe(true);
    expect(p.pendingList.children).toHaveLength(0);
  });
  it("does not replay an expired grade or a login HTML response", async () => {
    const storage = new Map([[key("1"), JSON.stringify({ 1: { ...entry(), day: "2000-01-01" } })]]);
    const p = page("1", storage, { fetch: async () => new Response("login", { headers: { "content-type": "text/html" } }) });
    await flush();
    expect(p.network).not.toHaveBeenCalled();
    p.submit("mastered");
    await flush();
    expect(storage.has(key("1"))).toBe(true);
    expect(p.status.textContent).toContain("登录已过期");
  });
  it("submits the same selected grade again after Shanghai 04:00", async () => {
    let time = Date.parse("2026-10-21T03:59:59+08:00");
    class Clock extends Date { static now() { return time; } }
    const p = page("1", new Map(), { clock: Clock as DateConstructor, studyDay: "2026-10-20" });
    p.submit("mastered"); await flush();
    p.submit("mastered"); await flush();
    expect(p.network).toHaveBeenCalledTimes(1);
    time += 2000;
    p.submit("mastered"); await flush();
    expect(p.network).toHaveBeenCalledTimes(2);
    const days = p.network.mock.calls.map(([, init]) => (init.body as URLSearchParams).get("day"));
    expect(days).toEqual(["2026-10-20", "2026-10-21"]);
    expect(p.form.elements.day.value).toBe("2026-10-21");
    expect(p.buttons[2].attrs.get("aria-pressed")).toBe("true");
  });
  it("retains expired grades visibly until the user explicitly removes the matching entry", async () => {
    const expired = { ...entry(), day: "2000-01-01", label: "#001" };
    const storage = new Map([[key("1"), JSON.stringify({ 1: expired })]]);
    const p = page("1", storage); await flush();
    expect(p.network).not.toHaveBeenCalled();
    expect(JSON.parse(storage.get(key("1"))!)[1]).toEqual(expired);
    expect(p.pendingBox.hidden).toBe(false);
    expect(p.pendingList.children[0].children[1].textContent).toContain("已过期，未保存");
    expect(p.retry.hidden).toBe(true); expect(p.retryAll.hidden).toBe(true);
    const staleRemove = p.pendingList.children[0].children[2];
    storage.set(key("1"), JSON.stringify({ 1: { ...expired, id: "newer" } }));
    staleRemove.events.click();
    expect(JSON.parse(storage.get(key("1"))!)[1].id).toBe("newer");
    p.listeners.focus(); await flush();
    p.pendingList.children[0].children[2].events.click();
    expect(storage.has(key("1"))).toBe(false);
    expect(p.pendingBox.hidden).toBe(true);
    expect(p.status.textContent).toContain("未补记学习记录");
    expect(p.network).not.toHaveBeenCalled();
  });
  it("stops after three retries and allows manual recovery without losing the chosen grade", async () => {
    let online = false;
    const storage = new Map<string, string>();
    const p = page("1", storage, { fetch: async () => {
      if (!online) return new Response("unavailable", { status: 503 });
      return response();
    } });
    p.submit("shaky"); await flush();
    for (const delay of [1500, 4000, 10000]) await p.runTimer(delay);
    expect(p.network).toHaveBeenCalledTimes(4);
    expect(p.timers.size).toBe(0);
    expect(p.status.textContent).toContain("自动重试未成功");
    expect(p.pendingList.children[0].children[1].textContent).toContain("自动重试未成功");
    expect(p.retry.hidden).toBe(false);
    expect(JSON.parse(storage.get(key("1"))!)[1].grade).toBe("shaky");
    online = true; p.retry.events.click(); await flush();
    expect(p.network).toHaveBeenCalledTimes(5);
    expect(p.status.textContent).toBe("评价已保存");
    expect(p.buttons[0].attrs.get("aria-pressed")).toBe("true");
    expect(p.retry.hidden).toBe(true); expect(p.pendingBox.hidden).toBe(true);
  });
  it.each([
    [401, "login_required", "登录已过期", true],
    [409, "owner_mismatch", "当前登录账号已改变", true],
    [422, "day_changed", "已跨学习日", false],
  ])("shows a specific error for HTTP %s and keeps the queue without automatic retry", async (status, code, message, needsLogin) => {
    const storage = new Map<string, string>();
    const p = page("1", storage, { fetch: async () => new Response(JSON.stringify({ code }), { status, headers: { "content-type": "application/json" } }) });
    p.submit("unknown"); await flush();
    expect(p.status.textContent).toContain(message);
    expect(p.timers.size).toBe(0); expect(p.retry.hidden).toBe(true);
    expect(p.retryAll.hidden).toBe(true); expect(p.login.hidden).toBe(!needsLogin);
    expect(p.login.href).toBe("/login?next=%2Fbank%2FA%3Fkp%3D1%23q-1");
    expect(JSON.parse(storage.get(key("1"))!)[1].grade).toBe("unknown");
  });
  it("aborts a stalled request after 15 seconds and schedules a bounded retry", async () => {
    const p = page("1", new Map(), { fetch: (_: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(Error("timeout")));
    }) });
    p.submit("unknown");
    await p.runTimer(15000);
    expect((p.network.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(true);
    expect(p.status.textContent).toContain("等待重试");
    expect([...p.timers.values()].map((t) => t.delay)).toEqual([1500]);
  });
  it("retains a request failing across 04:00 as expired instead of retrying it into a new day", async () => {
    let time = Date.parse("2026-10-21T03:59:59+08:00");
    class Clock extends Date { static now() { return time; } }
    let fail!: (error: Error) => void;
    const storage = new Map<string, string>();
    const p = page("1", storage, { clock: Clock as DateConstructor, fetch: () => new Promise((_, reject) => { fail = reject; }) });
    p.submit("shaky"); time += 2000; fail(Error("offline")); await flush();
    expect(p.status.textContent).toContain("已跨学习日");
    expect(p.timers.size).toBe(0); expect(p.retry.hidden).toBe(true);
    expect(JSON.parse(storage.get(key("1"))!)[1].day).toBe("2026-10-20");
    expect(p.pendingList.children[0].children[1].textContent).toContain("已过期");
  });
});

describe("solution image controls", () => {
  const trigger = () => ({ href: "https://example.test/content/s/001.webp", focus: vi.fn() });
  const click = (link: ReturnType<typeof trigger>, extras = {}) => ({
    button: 0, preventDefault: vi.fn(), target: { closest: (s: string) => s === "a.solution-zoom" ? link : null }, ...extras,
  });
  it("opens, bounds zoom, fits and returns focus on close", () => {
    const p = page("1", new Map(), { dialog: true }), link = trigger();
    const event = click(link); p.listeners.click(event);
    const { dialog, image, zoom, controls, action, close } = p.viewer;
    expect(event.preventDefault).toHaveBeenCalled(); expect(dialog.open).toBe(true);
    expect(image.src).toBe(link.href); expect(image.style.width).toBe("800px");
    expect(zoom.textContent).toBe("100%"); expect(controls.out.disabled).toBe(true);
    action("in"); expect(image.style.width).toBe("1200px");
    for (let i = 0; i < 10; i++) action("in");
    expect(zoom.textContent).toBe("400%"); expect(controls.in.disabled).toBe(true);
    action("out"); expect(zoom.textContent).toBe("350%");
    action("fit"); expect(zoom.textContent).toBe("100%");
    close.events.click(); expect(dialog.open).toBe(false); expect(link.focus).toHaveBeenCalledOnce();
  });
  it("drags a zoomed image with the mouse, ends on cancel, and preserves modified clicks", () => {
    const p = page("1", new Map(), { dialog: true }), link = trigger();
    const modified = click(link, { ctrlKey: true }); p.listeners.click(modified);
    expect(modified.preventDefault).not.toHaveBeenCalled(); expect(p.viewer.dialog.open).toBe(false);
    p.listeners.click(click(link));
    const { action, stage } = p.viewer;
    action("in"); stage.scrollLeft = 120; stage.scrollTop = 180;
    stage.events.pointerdown({ pointerType: "mouse", button: 0, pointerId: 1, clientX: 100, clientY: 100, preventDefault() {} });
    stage.events.pointermove({ clientX: 70, clientY: 80 });
    expect([stage.scrollLeft, stage.scrollTop]).toEqual([150, 200]);
    stage.events.pointercancel(); stage.events.pointermove({ clientX: 0, clientY: 0 });
    expect([stage.scrollLeft, stage.scrollTop]).toEqual([150, 200]);
    stage.events.pointerdown({ pointerType: "touch", button: 0 });
    expect(stage.setPointerCapture).toHaveBeenCalledTimes(1);
  });
});

describe("formula scheduling", () => {
  it("defers distant cards and hidden answers, with print fallback", () => {
    const formula = (hidden = false) => ({ dataset: {} as Record<string, string>, textContent: "x^2", classList: classes(), closest: (s: string) => s === ".qcard" ? true : hidden ? true : null });
    const near = formula(), far = formula(), answer = formula(true);
    const card = (top: number, maths: any[]) => ({ getBoundingClientRect: () => ({ top, bottom: top + 400 }), querySelectorAll: () => maths });
    const nearCard = card(100, [near, answer]), farCard = card(5000, [far]);
    let intersect!: (entries: any[]) => void;
    const p = page("1", new Map(), { maths: [near, far, answer], cards: [nearCard, farCard], observer: (fn) => { intersect = fn; } });
    expect(near.dataset.rendered).toBe("1");
    expect(far.dataset.rendered).toBeUndefined();
    expect(answer.dataset.rendered).toBeUndefined();
    intersect([{ target: farCard, isIntersecting: true }]);
    expect(far.dataset.rendered).toBe("1");
    p.listeners.beforeprint();
    expect(answer.dataset.rendered).toBe("1");
    expect(p.render).toHaveBeenCalledTimes(3);
  });
  it("renders without IntersectionObserver", () => {
    const math = { dataset: {} as Record<string, string>, textContent: "x", classList: classes(), closest: () => null };
    page("local", new Map(), { maths: [math] });
    expect(math.dataset.rendered).toBe("1");
  });
});

describe("the 考点 tree's position", () => {
  const KEY = "dgy-tree-scroll:/bank/A";
  it("saves it on leaving and goes back to it on the chapter's next page", () => {
    const session = new Map<string, string>(), first = kpTree();
    const p = page("1", new Map(), { tree: first, session });
    first.tree.scrollTop = 480;
    p.listeners.pagehide({});
    expect(session.get(KEY)).toBe("480");
    const next = kpTree({ currentAt: 800 });
    page("1", new Map(), { tree: next, session });
    expect(next.tree.scrollTop).toBe(480); // the clicked 考点 is in view, so nothing else moves
  });
  it("does not use another chapter's position", () => {
    const other = kpTree();
    page("1", new Map(), { tree: other, session: new Map([["dgy-tree-scroll:/bank/B", "480"]]) });
    expect(other.tree.scrollTop).toBe(0);
  });
  it("brings the current 考点 to the middle when it is out of view", () => {
    const fresh = kpTree({ currentAt: 1050 });
    page("1", new Map(), { tree: fresh, session: new Map() });
    expect(fresh.tree.scrollTop).toBe(720); // 1050 - (700 - 40) / 2
    const below = kpTree({ currentAt: 1500 });
    page("1", new Map(), { tree: below, session: new Map([[KEY, "480"]]) });
    expect(below.tree.scrollTop).toBe(1170);
    const above = kpTree({ currentAt: 500 });
    page("1", new Map(), { tree: above, session: new Map([[KEY, "900"]]) });
    expect(above.tree.scrollTop).toBe(170);
  });
  it("keeps the saved position while a drawer is closed and uses it when the drawer opens", () => {
    const session = new Map([[KEY, "480"]]), drawer = kpTree({ currentAt: 800, narrow: true });
    const p = page("1", new Map(), { tree: drawer, session });
    p.listeners.pagehide({});
    expect(session.get(KEY)).toBe("480");
    drawer.tree.clientHeight = 700;
    drawer.toggle.events.click();
    expect(drawer.tree.scrollTop).toBe(480);
  });
  it("still shows the current 考点 when storage is blocked", () => {
    const blocked = kpTree({ currentAt: 1050 });
    const p = page("1", new Map(), { tree: blocked, blocked: true });
    expect(blocked.tree.scrollTop).toBe(720);
    expect(() => p.listeners.pagehide({})).not.toThrow();
  });
});

describe("notes", () => {
  const KEY = "dgy-note-drafts:1";
  const noteCalls = (p: ReturnType<typeof page>) => p.network.mock.calls.filter(([url]: any[]) => /\/note$/.test(url));
  const sent = (call: any[]) => call[1].body.get("note");
  const drafts = (storage: Map<string, string>) => JSON.parse(storage.get(KEY) ?? "{}");

  it("keeps a change on this device, sends it after a pause, and marks the note saved", async () => {
    const storage = new Map<string, string>(), box = noteBox();
    const p = page("1", storage, { notes: [box] });
    expect(box.save.hidden).toBe(true);
    box.type("令 x-1=t");
    expect(drafts(storage)).toEqual({ 7: "令 x-1=t" });
    expect(noteCalls(p)).toHaveLength(0);
    await p.runTimer(800);
    const [call] = noteCalls(p);
    expect(call[0]).toBe("/q/7/note");
    expect(call[1].keepalive).toBe(true);
    expect([call[1].body.get("owner"), sent(call)]).toEqual(["1", "令 x-1=t"]);
    expect(storage.has(KEY)).toBe(false);
    expect(box.status.textContent).toMatch(/^已保存 \d\d:\d\d$/);
    expect(box.toggle.classList.contains("has-note")).toBe(true);
  });

  it("sends only the last of a run of changes, such as a voice input arriving in pieces", async () => {
    const box = noteBox();
    const p = page("1", new Map(), { notes: [box] });
    box.type("令");
    box.type("令 x-1");
    box.type("令 x-1=t");
    expect([...p.timers.values()].filter((t) => t.delay === 800)).toHaveLength(1);
    await p.runTimer(800);
    expect(noteCalls(p).map(sent)).toEqual(["令 x-1=t"]);
  });

  it("sends at once when the box loses the focus, and the mark goes when the note is emptied", async () => {
    const box = noteBox(7, "旧");
    box.toggle.classList.toggle("has-note", true);
    const p = page("1", new Map(), { notes: [box] });
    box.area.events.blur();
    expect(noteCalls(p)).toHaveLength(0); // nothing changed
    box.type("");
    box.area.events.blur();
    await flush();
    expect(noteCalls(p).map(sent)).toEqual([""]);
    expect(box.toggle.classList.contains("has-note")).toBe(false);
  });

  it("sends what is left when the page goes", async () => {
    const box = noteBox();
    const p = page("1", new Map(), { notes: [box] });
    box.type("翻页前说的");
    p.listeners.pagehide({});
    expect(noteCalls(p).map(sent)).toEqual(["翻页前说的"]);
    await flush();
    expect([...p.timers.values()].filter((t) => t.delay === 800)).toHaveLength(0);
  });

  it("sends what changed while a request was out, after it", async () => {
    let answer!: (r: Response) => void;
    const responses = [new Promise<Response>((resolve) => { answer = resolve; }), Promise.resolve(response())];
    const storage = new Map<string, string>(), box = noteBox();
    const p = page("1", storage, { notes: [box], fetch: () => responses.shift() });
    box.type("第一句");
    box.area.events.blur();
    box.type("第一句，第二句");
    box.area.events.blur();
    expect(noteCalls(p).map(sent)).toEqual(["第一句"]);
    answer(response());
    await flush();
    expect(noteCalls(p).map(sent)).toEqual(["第一句", "第一句，第二句"]);
    expect(storage.has(KEY)).toBe(false);
  });

  it("keeps the text when saving fails, retries a few times, and offers the button", async () => {
    let online = false;
    const storage = new Map<string, string>(), box = noteBox();
    const p = page("1", storage, { notes: [box], fetch: async () => { if (!online) throw new TypeError("offline"); return response(); } });
    box.type("断网时说的");
    await p.runTimer(800);
    expect(drafts(storage)).toEqual({ 7: "断网时说的" });
    expect(box.status.textContent).toContain("内容还在");
    expect(box.status.classList.contains("qc-unsaved")).toBe(true);
    expect(box.save.hidden).toBe(false);
    for (const delay of [1500, 4000, 10000]) await p.runTimer(delay);
    expect(noteCalls(p)).toHaveLength(4);
    expect([...p.timers.values()].filter((t) => [1500, 4000, 10000].includes(t.delay))).toHaveLength(0);
    online = true;
    p.listeners.online({});
    await flush();
    expect(storage.has(KEY)).toBe(false);
    expect(box.save.hidden).toBe(true);
    expect(box.status.classList.contains("qc-unsaved")).toBe(false);
  });

  it("does not retry by itself when the login expired or the account changed, and says so", async () => {
    for (const [status, words] of [[401, "登录已过期"], [409, "账号已改变"]] as const) {
      const storage = new Map<string, string>(), box = noteBox();
      const p = page("1", storage, { notes: [box], fetch: async () => new Response("{}", { status, headers: { "content-type": "application/json" } }) });
      box.type("思路");
      await p.runTimer(800);
      expect(box.status.textContent).toContain(words);
      expect(drafts(storage)).toEqual({ 7: "思路" });
      expect([...p.timers.values()].filter((t) => t.delay === 1500)).toHaveLength(0);
    }
  });

  it("takes a redirect to the login page for an expired login", async () => {
    const storage = new Map<string, string>(), box = noteBox();
    const p = page("1", storage, { notes: [box], fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }) });
    box.type("思路");
    await p.runTimer(800);
    expect(box.status.textContent).toContain("登录已过期");
    expect(drafts(storage)).toEqual({ 7: "思路" });
  });

  it("puts a waiting note back in its box on load, and sends notes of other questions too", async () => {
    const storage = new Map([[KEY, JSON.stringify({ 7: "没存上的", 9: "别的题" })]]), box = noteBox(7, "旧");
    const p = page("1", storage, { notes: [box] });
    expect(box.area.value).toBe("没存上的");
    await flush();
    expect(noteCalls(p).map((call: any[]) => [call[0], sent(call)])).toEqual([["/q/7/note", "没存上的"], ["/q/9/note", "别的题"]]);
    expect(storage.has(KEY)).toBe(false);
  });

  it("never sends another account's waiting notes", async () => {
    const storage = new Map([["dgy-note-drafts:2", JSON.stringify({ 7: "朋友的" })]]), box = noteBox(7, "");
    const p = page("1", storage, { notes: [box] });
    await flush();
    expect(box.area.value).toBe("");
    expect(noteCalls(p)).toHaveLength(0);
    expect(storage.has("dgy-note-drafts:2")).toBe(true);
  });

  it("still saves when storage is blocked", async () => {
    const box = noteBox();
    const p = page("1", new Map(), { notes: [box], blocked: true });
    box.type("思路");
    await p.runTimer(800);
    expect(noteCalls(p).map(sent)).toEqual(["思路"]);
    expect(box.status.textContent).toMatch(/^已保存/);
  });
});
