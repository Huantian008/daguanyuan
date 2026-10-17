// Port of dgy/templates/bank.html, bank_chapter.html, search.html and question.html.
import { html } from "hono/html";
import type { ChapterInfo, KnowledgeEntry, Outline, Question, Section } from "../content";
import type { Meta } from "../env";
import { GRADE_LABELS, type CardState } from "../srs";
import type { UserState } from "../state";
import type { ChapterProgress, Distribution, Review } from "../stats";
import { cnDate } from "../studyday";
import { layout } from "./layout";
import { STATUS_LABELS, distBar, excludeToggle, images, qmeta, relatedKnowledge, revealToggle, startForm, type Status } from "./parts";
import { pad3 } from "./util";

const searchForm = (q = "", placeholder = "题号、年份或考点，如 123、2019数二、拐点") => html`<form class="search" action="/bank/search" method="get" role="search">
    <label class="visually-hidden" for="q">搜索题目</label>
    <input id="q" name="q" type="search" value="${q}" placeholder="${placeholder}">
    <button class="btn">搜索</button>
  </form>`;

export function bankPage(meta: Meta, rows: [ChapterProgress, Distribution][]) {
  return layout(meta, {
    title: "题库",
    nav: "bank",
    body: html`<header class="page-head">
  <h1>题库</h1>
  ${searchForm()}
</header>
<div class="head-actions bank-actions">
  ${startForm("随机 10 题", "random", { cls: "btn" })}
  ${startForm("随机 10 道没做过的", "random", { cls: "btn", only: "new" })}
</div>
<ul class="chapters">
  ${rows.map(([p, dist]) => html`<li class="card chapter-card">
    <a class="chapter-link" href="/bank/${p.code}">
      <span class="chapter-name">${p.name}</span>
      <span class="muted">做过 ${p.done} / ${p.total} 题</span>
    </a>
    ${distBar(dist)}
  </li>`)}
</ul>`,
  });
}

export function chapterPage(meta: Meta, chapter: ChapterInfo, outline: Outline, state: UserState) {
  const sections = outline.map(([section, kps], i) => {
    const anchor = `sec-${i + 1}`;
    return html`<section class="card section" id="${anchor}">
  <h2>${section}</h2>
  ${kps.map(([kp, qs]) => {
    const open = qs.filter((q) => !state.excluded.has(q.num));
    return html`<div class="kp-row${open.length ? "" : " is-excluded"}">
    <div class="kp-name">${kp} <span class="muted">${qs.length} 题</span></div>
    <div class="chips">${qs.map((q) => html`<a class="chip chip-${state.status(q.num)}" href="/q/${q.num}" title="#${pad3(q.num)} ${q.source_full}">${pad3(q.num)}</a>`)}</div>
    <div class="kp-actions">
      ${open.length
        ? html`${startForm("练这个考点", "group", { cls: "btn btn-small", chapter: chapter.code, section, kp })}
      ${startForm("只练没做过的", "group", { cls: "btn btn-small btn-ghost", chapter: chapter.code, section, kp, only: "new" })}`
        : ""}
      ${excludeToggle(!open.length, `/bank/${chapter.code}#${anchor}`, { chapter: chapter.code, section, kp, onLabel: "整个考点不做了" })}
    </div>
  </div>`;
  })}
</section>`;
  });
  return layout(meta, {
    title: chapter.name,
    nav: "bank",
    body: html`<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/bank">题库</a></p>
    <h1>${chapter.name}</h1>
  </div>
  <div class="head-actions">
    ${startForm("只练这章没做过的", "group", { cls: "btn btn-primary", chapter: chapter.code, only: "new" })}
    ${startForm("练这章的薄弱题", "group", { cls: "btn", chapter: chapter.code, only: "weak" })}
  </div>
</header>
<p class="legend-inline">
  <span class="chip chip-new">未做</span><span class="chip chip-mastered">完全掌握</span><span class="chip chip-shaky">不熟练/错误</span><span class="chip chip-unknown">完全不会</span><span class="chip chip-excluded">不做</span>
</p>
${sections}`,
  });
}

export function searchPage(meta: Meta, q: string, found: Question[], state: UserState) {
  return layout(meta, {
    title: `搜索 ${q}`,
    nav: "bank",
    body: html`<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/bank">题库</a></p>
    <h1>搜索“${q}”</h1>
  </div>
  ${searchForm(q, "")}
</header>
${found.length
    ? html`<p class="muted">找到 ${found.length} 题</p>
<ul class="card result-list">
  ${found.map((item) => html`<li>
    <a href="/q/${item.num}"><span class="qnum">#${pad3(item.num)}</span> ${item.section} / ${item.kp}</a>
    <span class="muted">${item.source_full}</span>
    <span class="chip chip-${state.status(item.num)}">${STATUS_LABELS[state.status(item.num)]}</span>
  </li>`)}
</ul>`
    : html`<p class="empty">没有找到。可以输入题号（如 123）、年份和卷别（如 2019数二），或考点名称（如 拐点）。</p>`}`,
  });
}

export interface QuestionData {
  q: Question;
  chapter: ChapterInfo;
  card: CardState | undefined;
  status: Status;
  history: Review[];
  knowledge: KnowledgeEntry[];
  sections: Section[];
  titles: Record<string, string>;
  total: number;
}

export function questionPage(meta: Meta, d: QuestionData) {
  const { q } = d;
  return layout(meta, {
    title: `#${pad3(q.num)} ${q.kp}`,
    nav: "bank",
    body: html`<div data-shortcuts>
<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/bank/${d.chapter.code}">${d.chapter.name}</a> / ${q.path.join(" / ")}</p>
    <h1>#${pad3(q.num)} ${q.kp}</h1>
  </div>
  <div class="head-actions">
    ${startForm("练这道题", "single", { cls: "btn btn-primary", nums: String(q.num) })}
    ${excludeToggle(d.status === "excluded", `/q/${q.num}`, { nums: String(q.num) })}
  </div>
</header>

<p class="status-line">
  <span class="chip chip-${d.status}">${STATUS_LABELS[d.status]}</span>
  ${d.card?.due ? `下次复习：${cnDate(d.card.due)} · 已做 ${d.card.reps} 次` : ""}
</p>

<article class="sheet">
  ${qmeta(q)}
  <div class="qbody paper">${images(meta, [q.img], "qimg", `题目 #${pad3(q.num)}`, 1.6, false)}</div>
</article>
<div class="reveal-bar reveal-bar-single">
  ${revealToggle("answer", "答案与解析", "空格")}
</div>
<section id="answer" class="reveal-panel" aria-label="答案与解析">
  <h2 class="panel-label">答案</h2>
  <div class="paper">${images(meta, [q.answer], "aimg", "答案", 2.2)}</div>
  <h2 class="panel-label">解析 <span class="muted">${q.solution.length} 张图</span></h2>
  <div class="paper">${images(meta, q.solution, "simg", "解析", 2)}</div>
</section>

<div class="grid grid-2">
  <section class="card">
    <h2 class="card-title">相关知识点</h2>
    ${relatedKnowledge(d.sections, d.knowledge, d.titles)}
  </section>
  <section class="card">
    <h2 class="card-title">做题记录</h2>
    ${d.history.length
      ? html`<ul class="plain">${[...d.history].reverse().map((r) => html`<li><span class="muted">${cnDate(r.studyDay)}</span> <span class="chip chip-${r.grade}">${GRADE_LABELS[r.grade]}</span></li>`)}</ul>`
      : html`<p class="empty">还没做过这道题。</p>`}
  </section>
</div>

<p class="side-info">答案速查编号 ${q.quick_id} · 原稿第 ${q.orig_page} 页</p>
<nav class="pager" aria-label="翻题">
  ${q.num > 1 ? html`<a class="btn btn-small" href="/q/${q.num - 1}">← #${pad3(q.num - 1)}</a>` : html`<span></span>`}
  ${q.num < d.total ? html`<a class="btn btn-small" href="/q/${q.num + 1}">#${pad3(q.num + 1)} →</a>` : ""}
</nav>
</div>`,
  });
}
