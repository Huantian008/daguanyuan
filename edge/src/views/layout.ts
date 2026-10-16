import { html, raw } from "hono/html";
import type { Meta } from "../env";
import { staticUrl, type Html } from "./util";

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232c63e0'/%3E%3Cpath d='M9 11h14M9 16h14M9 21h9' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";

const NAV: [href: string, label: string, key: string][] = [
  ["/", "首页", "home"],
  ["/bank", "题库", "bank"],
  ["/knowledge", "知识点", "knowledge"],
  ["/history", "学习记录", "history"],
  ["/settings", "设置", "settings"],
];

export interface PageOptions {
  title: string;
  body: Html;
  nav?: string;
  pageClass?: string;
  head?: Html;
  scripts?: Html;
}

/** Port of dgy/templates/base.html: same markup and classes, so dgy/static/css/app.css applies unchanged. */
export function layout(meta: Meta, o: PageOptions): Html {
  const links = NAV.map(([href, label, key]) =>
    html`<a href="${href}"${o.nav === key ? raw(' aria-current="page"') : ""}>${label}</a>`);
  return html`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${o.title} · 数二刷题</title>
  <link rel="icon" href="${raw(FAVICON)}">
  <link rel="stylesheet" href="${staticUrl(meta, "css/app.css")}">
  ${o.head ?? ""}
</head>
<body>
  <a class="skip-link" href="#main">跳到正文</a>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>大观园</a>
      <nav class="nav" aria-label="主导航">${links}</nav>
    </div>
  </header>
  <main id="main" class="page ${o.pageClass ?? ""}">
    ${o.body}
  </main>
  ${o.scripts ?? ""}
  <script src="${staticUrl(meta, "js/app.js")}" defer></script>
</body>
</html>`;
}
