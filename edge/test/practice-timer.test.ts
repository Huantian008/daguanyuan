import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("../../dgy/static/js/app.js", import.meta.url), "utf8");

// Only browser I/O is replaced; every test executes the shipped script unchanged.
class Element {
  hidden = false;
  textContent = "";
  value: string | number = "";
  open = false;
  form?: Element;
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: any) => void)[]>();
  addEventListener(type: string, fn: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  fire(type: string, event: any = {}) { this.listeners.get(type)?.forEach((fn) => fn(event)); }
  click() { this.fire("click"); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key); }
}

function page() {
  let now = 0;
  let wallClockOffset = 0;
  const intervals: (() => void)[] = [];
  const document = new Element();
  const controls = new Element();
  const display = new Element();
  const timer = new Element();
  const toggle = new Element();
  const pause = new Element();
  const status = new Element();
  const input = new Element();
  const form = new Element();
  const answer = new Element();
  const solution = new Element();
  const grade = new Element();
  const skip = new Element();
  controls.hidden = display.hidden = status.hidden = true;
  timer.textContent = "00:00";
  toggle.textContent = "查看用时";
  toggle.setAttribute("aria-expanded", "false");
  pause.textContent = "暂停";
  input.form = form;
  grade.addEventListener("click", () => form.fire("submit"));
  let skipped = false;
  skip.addEventListener("click", () => { skipped = true; });
  const elements: Record<string, Element> = {
    "[data-practice]": new Element(), ".js-timer-controls": controls,
    ".js-timer-display": display, ".js-timer": timer, ".js-timer-toggle": toggle,
    ".js-timer-pause": pause, ".js-timer-status": status,
    "details.answer": answer, "details.solution": solution,
    'button[data-key="1"]': grade, ".js-skip": skip,
  };
  Object.assign(document, {
    querySelector: (selector: string) => elements[selector] ?? null,
    querySelectorAll: (selector: string) => selector === ".js-elapsed" ? [input] : [],
  });
  runInNewContext(script, {
    document, window: {}, Date: { now: () => now + wallClockOffset },
    performance: { now: () => now }, setInterval: (fn: () => void) => intervals.push(fn),
  });
  return {
    controls, display, timer, toggle, pause, status, answer, solution,
    advance: (milliseconds: number) => { now += milliseconds; intervals.forEach((fn) => fn()); },
    changeWallClock: (milliseconds: number) => { wallClockOffset += milliseconds; },
    background: () => document.fire("visibilitychange"),
    submit: () => { form.fire("submit"); return Number(input.value); },
    recorded: () => Number(input.value),
    skipped: () => skipped,
    key: (key: string, onControl = false) => document.fire("keydown", {
      key, target: { closest: () => onControl ? pause : null }, preventDefault() {},
    }),
  };
}

describe("quiet practice timer", () => {
  it("starts hidden and counts time without opening the display", () => {
    const p = page();
    expect(p.controls.hidden).toBe(false);
    expect(p.display.hidden).toBe(true);
    expect(p.toggle.getAttribute("aria-expanded")).toBe("false");
    p.advance(10_000);
    expect(p.submit()).toBe(10);
    expect(p.display.hidden).toBe(true);
  });

  it("reveals the current time and can hide it without restarting", () => {
    const p = page();
    p.advance(12_000);
    p.toggle.click();
    expect(p.display.hidden).toBe(false);
    expect(p.timer.textContent).toBe("00:12");
    expect(p.toggle.textContent).toBe("收起");
    expect(p.toggle.getAttribute("aria-expanded")).toBe("true");
    p.toggle.click();
    p.advance(3_000);
    expect(p.display.hidden).toBe(true);
    expect(p.toggle.textContent).toBe("查看用时");
    expect(p.submit()).toBe(15);
  });

  it("records 15 active seconds after 10 running, 20 paused, and 5 resumed", () => {
    const p = page();
    p.advance(10_000);
    p.pause.click();
    expect(p.pause.textContent).toBe("继续");
    expect(p.status.hidden).toBe(false);
    expect(p.display.hidden).toBe(true);
    p.advance(20_000);
    expect(p.submit()).toBe(10);
    p.pause.click();
    expect(p.pause.textContent).toBe("暂停");
    expect(p.status.hidden).toBe(true);
    p.advance(5_000);
    expect(p.submit()).toBe(15);
  });

  it("freezes an expanded timer and preserves disclosure across pause and resume", () => {
    const p = page();
    p.toggle.click();
    p.advance(4_000);
    p.pause.click();
    p.advance(60_000);
    expect(p.timer.textContent).toBe("00:04");
    expect(p.display.hidden).toBe(false);
    p.toggle.click();
    p.pause.click();
    p.advance(2_000);
    expect(p.display.hidden).toBe(true);
    p.toggle.click();
    expect(p.timer.textContent).toBe("00:06");
  });

  it("keeps fractional seconds across repeated pauses and repeated quick clicks", () => {
    const p = page();
    for (let i = 0; i < 3; i++) {
      p.advance(400);
      p.pause.click();
      p.advance(15_000);
      p.pause.click();
    }
    p.pause.click();
    p.pause.click();
    expect(p.submit()).toBe(1);
  });

  it("uses a monotonic clock and keeps counting in another tab", () => {
    const p = page();
    p.advance(10_000);
    p.background();
    p.changeWallClock(-60_000);
    p.advance(5_000);
    expect(p.submit()).toBe(15);
  });

  it("starts each new page hidden, running, and at zero", () => {
    const old = page();
    old.advance(20_000);
    old.toggle.click();
    old.pause.click();
    const next = page();
    expect(next.display.hidden).toBe(true);
    expect(next.status.hidden).toBe(true);
    expect(next.pause.textContent).toBe("暂停");
    expect(next.submit()).toBe(0);
    next.advance(2_000);
    expect(next.submit()).toBe(2);
  });

  it("preserves answer, solution, grading, and skip shortcuts while paused", () => {
    const p = page();
    p.advance(10_000);
    p.pause.click();
    p.advance(20_000);
    p.key(" ");
    p.key("s");
    expect(p.answer.open).toBe(true);
    expect(p.solution.open).toBe(true);
    p.key("1");
    expect(p.recorded()).toBe(10);
    p.key("ArrowRight");
    expect(p.skipped()).toBe(true);
    p.key(" ", true);
    expect(p.answer.open).toBe(true);
  });
});
