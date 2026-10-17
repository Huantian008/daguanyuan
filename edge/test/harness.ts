// Test helpers: a fake static-assets binding, an env with an in-memory D1, a cookie-keeping client, a settable clock.
import type { Hono } from "hono";
import { createApp } from "../src/app";
import { Content, type Linking, type Manifest, type QuestionText } from "../src/content";
import type { Env } from "../src/env";
import { memoryD1 } from "./d1";
import { smallBank } from "./fixtures";

export const KNOWLEDGE = {
  chapters: {
    "01": { html: '<h2 id="1-函数基础">1. 函数基础</h2><p>若 <span class="math inline">f\'(x)</span> 有界</p>', toc: [["1-函数基础", "1. 函数基础"]] },
  },
  overview: "<h1>总目录</h1><p>核对说明</p>",
};

function assetFiles(bank: Manifest): Record<string, string> {
  const files: Record<string, string> = { "/static/css/app.css": "body{}", "/static/js/app.js": "//" };
  for (const q of bank.questions) {
    for (const img of [q.img, q.answer, ...q.solution]) files[`/content/${img.src}`] = "img";
  }
  for (const k of bank.knowledge) for (const p of k.pages) files[`/content/${p.src}`] = "page";
  return files;
}

function fakeAssets(files: Record<string, string>) {
  return {
    async fetch(input: Request | string) {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
      if (!(path in files)) return new Response("not found", { status: 404 });
      const type = path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "image/webp";
      return new Response(files[path], { headers: { "content-type": type, etag: '"abc"' } });
    },
  } as unknown as Fetcher;
}

export class Clock {
  constructor(public at: Date) {}
  now = () => this.at;
  addDays(n: number) {
    this.at = new Date(this.at.getTime() + n * 24 * 3600 * 1000);
  }
}

export class Client {
  private cookies = new Map<string, string>();
  constructor(private app: Hono<{ Bindings: Env }>, readonly env: Env) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await this.app.request(path, { ...init, headers, redirect: "manual" }, this.env);
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [name, value] = pair.split("=");
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return res;
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, form: Record<string, string>) {
    return this.request(path, { method: "POST", body: new URLSearchParams(form) });
  }

  async login(username = "me", password = "pw") {
    const res = await this.post("/login", { username, password, next: "/" });
    if (res.status !== 303) throw new Error(`login failed: ${res.status}`);
  }
}

/** Two accounts, like the real site: the owner ("me", password in APP_PASSWORD) and a friend ("pal", FRIEND_PASSWORD). */
export const ACCOUNTS = [
  { id: 1, name: "me", password_secret: "APP_PASSWORD" },
  { id: 2, name: "pal", password_secret: "FRIEND_PASSWORD" },
];

/** Questions #001 and #003 tagged with section 01/1, which starts on the chapter's first original page. */
export const LINKING: Linking = {
  sections: [{ key: "01/1", slug: "01", number: "1", level: 2, title: "函数基础", anchor: "1-函数基础", pdf_page: 10, page_index: 1, parent: null }],
  links: { "1": ["01/1"], "3": ["01/1"] },
};

export function setup(options: {
  password?: string; friendPassword?: string; secret?: string; users?: unknown; bank?: Manifest; linking?: Linking;
  texts?: Record<string, QuestionText>;
} = {}) {
  const bank = options.bank ?? smallBank();
  const clock = new Clock(new Date("2026-10-16T21:00:00+08:00"));
  const app = createApp({
    content: new Content(bank, options.linking, options.texts),
    knowledge: KNOWLEDGE,
    meta: { content_v: "20261016120000", asset_v: "1760000000" },
    now: clock.now,
  });
  const env: Env = {
    DB: memoryD1(),
    ASSETS: fakeAssets(assetFiles(bank)),
    USERS: "users" in options ? options.users : ACCOUNTS,
    APP_PASSWORD: options.password ?? "pw",
    FRIEND_PASSWORD: options.friendPassword ?? "pw2",
    SECRET_KEY: options.secret ?? "test-secret",
  };
  return { app, env, clock, client: new Client(app, env) };
}

/** Page text as the reader sees it (tags removed, whitespace collapsed). */
export const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
