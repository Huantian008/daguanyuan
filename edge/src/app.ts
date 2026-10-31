/** The Worker: login, access control, static assets, and the pages (ported from the Python version in dgy/). */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { passwordMatches, signSession, verifySession } from "./auth";
import type { Content } from "./content";
import type { AppEnv, KnowledgeData, Meta } from "./env";
import { registerPages } from "./routes";
import { accountsOf, findAccount, passwordOf, toUser } from "./users";
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

type C = Context<AppEnv>;

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
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const accounts = accountsOf(c.env);
    if (!c.env.SECRET_KEY || accounts.length === 0) {
      return c.text("网站还没有配置好 SECRET_KEY 和账号（USERS），暂时不能访问。", 503);
    }
    const url = new URL(c.req.url);
    if (PUBLIC_PATHS.has(url.pathname) || PUBLIC_PREFIXES.some((p) => url.pathname.startsWith(p))) return next();
    const userId = await verifySession(c.env.SECRET_KEY, getCookie(c, COOKIE), now().getTime(), (id) => {
      const account = accounts.find((a) => a.id === id);
      return account ? passwordOf(c.env, account) : "";
    });
    const account = accounts.find((a) => a.id === userId);
    if (account) {
      c.set("user", toUser(account));
      if (c.req.method === "POST" && (["/bank/exclude", "/settings", "/logout"].includes(url.pathname) || /^\/q\/\d+\/grade$/.test(url.pathname))) {
        const form = await c.req.parseBody();
        if (String(form.owner ?? "") !== String(account.id)) {
          const error = "页面所属账号与当前登录不一致，请刷新页面后重试。";
          return c.req.header("Accept")?.includes("application/json")
            ? c.json({ code: "owner_mismatch", error }, 409)
            : c.html(layout(meta, { title: "账号已改变", body: html`<section class="card"><h1>账号已改变</h1><p>${error}</p><a href="/">回首页</a></section>` }), 409);
        }
      }
      return next();
    }
    if (c.req.header("Accept")?.includes("application/json")) return c.json({ code: "login_required", error: "登录已过期，请重新登录。" }, 401);
    return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303);
  });

  app.get("/static/*", (c) => serveAsset(c, "public"));
  app.get("/content/*", (c) => serveAsset(c, "private"));
  app.get("/knowledge/assets/*", (c) => serveAsset(c, "private"));

  app.get("/login", (c) => c.html(loginPage(meta, safeBack(c.req.query("next")))));

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const next = safeBack(String(form.next ?? "/"));
    const username = String(form.username ?? "");
    const account = findAccount(accountsOf(c.env), username);
    // An unknown user is compared against an empty password too, so the answer does not tell which names exist.
    const password = account ? passwordOf(c.env, account) : "";
    if (!account || !passwordMatches(String(form.password ?? ""), password)) {
      return c.html(loginPage(meta, next, "用户名或密码不对，请重新输入。", username));
    }
    const token = await signSession(c.env.SECRET_KEY!, account.id, password, now().getTime() + SESSION_DAYS * 24 * 3600 * 1000);
    setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 24 * 3600 });
    return c.redirect(next, 303);
  });

  app.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/", secure: true });
    return c.redirect("/login", 303);
  });

  app.get("/ping", (c) => c.body(null, 204));
  app.get("/speedtest", (c) => c.html(speedTestPage(content, meta)));

  registerPages(app, { content, knowledge: deps.knowledge, meta, now });

  app.notFound((c) => c.html(layout(meta, {
    title: "没有这个页面",
    body: html`<section class="card"><h1>没有这个页面</h1><p><a href="/">回首页</a></p></section>`,
  }), 404));

  return app;
}
