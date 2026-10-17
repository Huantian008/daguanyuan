// Port of dgy/templates/knowledge_index.html and knowledge_page.html.
import { html, raw } from "hono/html";
import type { ChapterInfo, Content, KnowledgeEntry } from "../content";
import type { Meta } from "../env";
import type { UserState } from "../state";
import { layout } from "./layout";
import { katexCss, katexJs, sectionQuestions } from "./parts";
import { contentUrl } from "./util";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Put the questions tagged with each section of this chapter right under the section's heading. */
export function injectSectionQuestions(text: string, slug: string, content: Content, state: UserState): string {
  for (const s of content.sections.values()) {
    const nums = s.slug === slug ? content.questionsFor(s.key) : [];
    if (!nums.length) continue;
    const heading = new RegExp(`<h${s.level} id="${escapeRegExp(s.anchor)}">[\\s\\S]*?</h${s.level}>`);
    const block = String(sectionQuestions(nums, state));
    text = text.replace(heading, (m) => m + block);
  }
  return text;
}


export function knowledgeIndexPage(meta: Meta, groups: [string, KnowledgeEntry[]][], hasText: (slug: string) => boolean, overview: string) {
  return layout(meta, {
    title: "知识点",
    nav: "knowledge",
    head: katexCss(meta),
    scripts: katexJs(meta),
    body: html`<header class="page-head"><h1>知识点</h1></header>
${groups.map(([group, entries]) => html`<section class="card">
  <h2>${group}</h2>
  <ul class="kn-list">
    ${entries.map((e) => html`<li>
      <a href="/knowledge/${e.slug}">${e.title}</a>
      <span class="muted">${e.pages.length} 页原版${hasText(e.slug) ? " · 有文字版" : ""}</span>
    </li>`)}
  </ul>
</section>`)}
${overview ? html`<details class="card prose-card">
  <summary>文字版说明与核对记录</summary>
  <div class="prose">${raw(overview)}</div>
</details>` : ""}`,
  });
}

export interface KnowledgePageData {
  entry: KnowledgeEntry;
  tab: "original" | "text";
  text: { html: string; toc: string[][] } | undefined;
  chapters: ChapterInfo[];
  state: UserState;
  /** Questions tagged with sections that start on each original page, by page position. */
  pageQuestions: number[][];
}

export function knowledgePage(meta: Meta, d: KnowledgePageData) {
  const { entry } = d;
  const isText = d.tab === "text" && d.text;
  const original = html`${entry.toc?.length ? html`<nav class="toc toc-inline" aria-label="本章目录">
  <ul>${entry.toc.map((t) => html`<li><a href="#p${t.page}">${t.title}</a></li>`)}</ul>
</nav>` : ""}
<div class="kn-pages">
  ${entry.pages.map((p, i) => html`<figure class="kn-figure" id="p${i + 1}">
    <a class="kn-page" href="${contentUrl(meta, p.src)}" target="_blank" rel="noopener" title="在新标签页放大">
      <img src="${contentUrl(meta, p.src)}" width="${p.w}" height="${p.h}" alt="${entry.title} 第 ${i + 1} 页" ${i === 0 ? raw('fetchpriority="high"') : raw('loading="lazy" decoding="async"')}>
    </a>
    <figcaption class="kn-caption"><span class="muted">第 ${i + 1} 页</span>${d.pageQuestions[i]?.length ? sectionQuestions(d.pageQuestions[i], d.state, "这一页的题目") : ""}</figcaption>
  </figure>`)}
</div>`;
  const text = d.text ? html`<p class="note">文字版已按原版逐页转写，包含手写公式和提示；原文疑点另附“核对批注”，额外内容标为“整理补充”。公式或图形有疑问时，请对照原版与核对批注。</p>
<div class="kn-text">
  ${d.text.toc.length ? html`<nav class="toc" aria-label="本章目录">
    <ul>${d.text.toc.map(([anchor, title]) => html`<li><a href="#${anchor}">${title}</a></li>`)}</ul>
  </nav>` : ""}
  <article class="prose">${raw(d.text.html)}</article>
</div>` : "";
  return layout(meta, {
    title: entry.title,
    nav: "knowledge",
    head: isText ? katexCss(meta) : "",
    scripts: isText ? katexJs(meta) : "",
    body: html`<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/knowledge">知识点</a> / ${entry.group}</p>
    <h1>${entry.title}</h1>
  </div>
  <div class="head-actions">
    ${d.chapters.map((c) => html`<a class="btn btn-small" href="/bank/${c.code}">刷${c.name}的题</a>`)}
  </div>
</header>
<nav class="tabs" aria-label="版本">
  <a href="/knowledge/${entry.slug}"${isText ? "" : raw(' aria-current="page"')}>原版</a>
  ${d.text ? html`<a href="/knowledge/${entry.slug}?tab=text"${isText ? raw(' aria-current="page"') : ""}>文字版</a>` : ""}
</nav>
${isText ? text : original}`,
  });
}
