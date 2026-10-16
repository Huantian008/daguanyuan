/** The Worker: login, access control, static assets, and the pages (ported from the Python version in dgy/). */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { passwordMatches, signSession, verifySession } from "./auth";
import type { Content } from "./content";
import type { Env, KnowledgeData, Meta } from "./env";
import { layout } from "./views/layout";
import { loginPage } from "./views/login";
import { speedTestPage } from "./views/speedtest";
import { safeBack } from "./views/util";

export interface AppDeps {
  content: Content;
  knowledge: KnowledgeData;
  meta: Meta;
  now?: () => Date;
}

const COOKIE = "dgy_session";
const SESSION_DAYS = 30;
const PUBLIC_PREFIXES = ["/static/"];
const PUBLIC_PATHS = new Set(["/login", "/favicon.ico"]);

type C = Context<{ Bindings: Env }>;

async function serveAsset(c: C, scope: "public" | "private") {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (!res.ok) return res;
  const out = new Response(res.body, res);
  const versioned = new URL(c.req.url).searchParams.has("v");
  out.headers.set("Cache-Control", versioned ? `${scope}, max-age=31536000, immutable` : `${scope}, no-cache`);
  return out;
}

export function createApp(deps: AppDeps) {
  const { content, meta } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", async (c, next) => {
    if (!c.env.APP_PASSWORD || !c.env.SECRET_KEY) {
      return c.text("网站还没有设置 APP_PASSWORD 和 SECRET_KEY，暂时不能访问。", 503);
    }
    const url = new URL(c.req.url);
    if (PUBLIC_PATHS.has(url.pathname) || PUBLIC_PREFIXES.some((p) => url.pathname.startsWith(p))) return next();
    if (await verifySession(c.env.SECRET_KEY, getCookie(c, COOKIE), now().getTime())) return next();
    return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303);
  });

  app.get("/static/*", (c) => serveAsset(c, "public"));
  app.get("/content/*", (c) => serveAsset(c, "private"));
  app.get("/knowledge/assets/*", (c) => serveAsset(c, "private"));

  app.get("/login", (c) => c.html(loginPage(meta, safeBack(c.req.query("next")))));

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const next = safeBack(String(form.next ?? "/"));
    if (!passwordMatches(String(form.password ?? ""), c.env.APP_PASSWORD!)) {
      return c.html(loginPage(meta, next, "密码不对，请重新输入。"));
    }
    const token = await signSession(c.env.SECRET_KEY!, now().getTime() + SESSION_DAYS * 24 * 3600 * 1000);
    setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 24 * 3600 });
    return c.redirect(next, 303);
  });

  app.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/", secure: true });
    return c.redirect("/login", 303);
  });

  app.get("/ping", (c) => c.body(null, 204));
  app.get("/speedtest", (c) => c.html(speedTestPage(content, meta)));

  app.get("/", (c) => c.html(layout(meta, {
    title: "迁移中",
    nav: "home",
    body: html`<section class="card"><h1>网站正在搬到 Cloudflare</h1>
<p>刷题页面还在移植中。现在可以先打开 <a href="/speedtest">测速页</a>，看看晚上的访问速度。</p></section>`,
  })));

  return app;
}
