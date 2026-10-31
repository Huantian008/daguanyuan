import { html, raw } from "hono/html";
import type { Meta } from "../env";
import { staticUrl, type Html } from "./util";

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234361ee'/%3E%3Cpath d='M9 11h14M9 16h14M9 21h9' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";

// Same markup as dgy/templates/_theme_head.html, _qsize_toggle.html and _theme_toggle.html. The head script runs before the first paint,
// so a page never flashes the wrong theme; app.js shows the toggle and handles it.
const THEME_HEAD = raw(`<script>document.documentElement.classList.add("js");try{var t=localStorage.getItem("dgy-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;var s=localStorage.getItem("dgy-qsize");if(s==="normal"||s==="large")document.documentElement.dataset.qsize=s}catch(e){}</script>`);
const THEME_TOGGLE = raw(`<button type="button" class="theme-toggle js-theme" data-mode="auto" aria-label="主题：跟随系统" title="主题：跟随系统" hidden>
        <svg class="icon-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></svg>
        <svg class="icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>
        <svg class="icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
      </button>`);

const QSIZE_TOGGLE = raw(`<button type="button" class="qsize-toggle js-qsize" data-size="xl" aria-label="题目字号：特大" title="题目字号：特大（点按切换）" hidden>Aa</button>`);

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
  head?: Html | string;
  scripts?: Html | string;
}

/** Port of dgy/templates/base.html: same markup and classes, so dgy/static/css/app.css applies unchanged. */
export function layout(meta: Meta, o: PageOptions): Html {
  const links = NAV.map(([href, label, key]) =>
    html`<a href="${href}"${o.nav === key ? raw(' aria-current="page"') : ""}>${label}</a>`);
  return html`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>${o.title} · 数二刷题</title>
  <link rel="icon" href="${raw(FAVICON)}">
  ${THEME_HEAD}
  <link rel="stylesheet" href="${staticUrl(meta, "css/app.css")}">
  ${o.head ?? ""}
</head>
<body data-grade-owner="${meta.grade_owner ?? ""}" data-study-day="${meta.study_day ?? ""}">
  <a class="skip-link" href="#main">跳到正文</a>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span class="brand-text">大观园</span></a>
      <nav class="nav" aria-label="主导航">${links}</nav>
      ${QSIZE_TOGGLE}
      ${THEME_TOGGLE}
    </div>
  </header>
  <main id="main" class="page ${o.pageClass ?? ""}">
    <section id="pending-grades" class="sync-notice" hidden aria-labelledby="pending-title">
      <h2 id="pending-title">未保存的评价</h2>
      <ul></ul>
      <div class="sync-actions"><button type="button" class="btn btn-small js-sync-retry">立即重试</button><a class="btn btn-small js-sync-login" hidden>重新登录</a></div>
    </section>
    ${o.body}
  </main>
  ${o.scripts ?? ""}
  <script src="${staticUrl(meta, "js/app.js")}" defer></script>
</body>
</html>`;
}
