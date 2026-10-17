// Port of dgy/templates/bank.html, bank_chapter.html, search.html and question.html.
import { html, raw } from "hono/html";
import type { ChapterInfo, KnowledgeEntry, Question, QuestionText, Section } from "../content";
import type { DrillKp } from "../drill";
import type { Meta } from "../env";
import { GRADE_LABELS, type CardState, type Grade } from "../srs";
import type { UserState } from "../state";
import type { ChapterProgress, Distribution, Review } from "../stats";
import { cnDate } from "../studyday";
import { layout } from "./layout";
import { STATUS_LABELS, answerBody, distBar, excludeToggle, katexCss, katexJs, qmeta, questionBody, questionCard, relatedKnowledge, revealToggle, startForm, type Status } from "./parts";
import { pad3 } from "./util";

const searchForm = (q = "", placeholder = "题号、年份、考点或题干文字，如 123、2019数二、拐点") => html`<form class="search" action="/bank/search" method="get" role="search">
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

export interface ChapterPageData {
  chapter: ChapterInfo;
  chapters: ChapterInfo[];
  tree: [string, DrillKp[]][];
  current: DrillKp;
  prev: [string, string] | null;
  following: [string, string] | null;
  state: UserState;
  texts: Map<number, QuestionText>;
  gradedToday: Map<number, Grade>;
}

const percent = (done: number, total: number) => (total ? Math.round((100 * done) / total) : 0);

export function chapterPage(meta: Meta, d: ChapterPageData) {
  const { chapter, current, prev, following } = d;
  const here = `/bank/${chapter.code}?kp=${current.index}`;
  return layout(meta, {
    title: `${chapter.name} · ${current.kp}`,
    nav: "bank",
    pageClass: "page-drill",
    head: katexCss(meta),
    scripts: katexJs(meta),
    body: html`<div class="drill">
  <nav class="kp-tree" id="kp-tree" aria-label="考点目录">
    <p class="kt-chapter"><a href="/bank">题库</a> / ${chapter.name}</p>
    ${d.tree.map(([section, items]) => html`<div class="kt-section">
      <p class="kt-sec-name">${section}</p>
      ${items.map((k) => html`<a class="kt-kp${k.index === current.index ? " is-current" : ""}" href="/bank/${chapter.code}?kp=${k.index}"${k.index === current.index ? raw(' aria-current="page"') : ""}>
        <span class="kt-name">${k.kp}</span>
        <span class="kt-count">${k.done} / ${k.total}</span>
        <i class="kt-bar${k.total && k.done === k.total ? " is-full" : ""}"><b style="width: ${percent(k.done, k.total)}%"></b></i>
      </a>`)}
    </div>`)}
    <div class="kt-section kt-chapters">
      <p class="kt-sec-name">其他章</p>
      ${d.chapters.filter((c) => c.code !== chapter.code).map((c) => html`<a class="kt-kp" href="/bank/${c.code}"><span class="kt-name">${c.name}</span></a>`)}
    </div>
  </nav>

  <div class="drill-main">
    <header class="drill-head">
      <button type="button" class="drill-tree-toggle js-tree-toggle" aria-controls="kp-tree" aria-expanded="true" hidden>目录</button>
      <div class="drill-title">
        <h1>${current.kp}</h1>
        <p class="muted">${current.section} · 做过 ${current.done} / ${current.total} 题</p>
      </div>
      <div class="drill-actions">
        ${current.total ? startForm("练这个考点", "group", { cls: "btn btn-small", chapter: chapter.code, section: current.section, kp: current.kp }) : ""}
        ${excludeToggle(!current.total, here, { chapter: chapter.code, section: current.section, kp: current.kp, onLabel: "整个考点不做了" })}
        ${prev ? html`<a class="btn btn-small" href="${prev[1]}">${prev[0]}</a>` : ""}
        ${following ? html`<a class="btn btn-small btn-primary" href="${following[1]}">${following[0]}</a>` : ""}
      </div>
      <div class="drill-track" aria-hidden="true"><span style="width: ${percent(current.done, current.total)}%"></span></div>
    </header>

    <div class="qcards">
      ${current.questions.map((q, i) => questionCard(meta, q, d.texts.get(q.num), d.state.status(q.num), i + 1, d.gradedToday.get(q.num), `${here}#q-${q.num}`))}
    </div>

    <nav class="drill-foot" aria-label="翻节">
      ${prev ? html`<a class="btn" href="${prev[1]}">← ${prev[0]}</a>` : html`<span></span>`}
      ${following ? html`<a class="btn btn-primary" href="${following[1]}">${following[0]} →</a>` : ""}
    </nav>
  </div>
</div>`,
  });
}

/** Like Jinja's truncate(60, true, "…", 0) in search.html. */
const snippet = (text: string, length = 60) => (text.length <= length ? text : `${text.slice(0, length - 1)}…`);

export function searchPage(meta: Meta, q: string, found: Question[], state: UserState, texts: Map<number, QuestionText>) {
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
    ${texts.has(item.num) ? html`<p class="snippet">${snippet(texts.get(item.num)!.search)}</p>` : ""}
  </li>`)}
</ul>`
    : html`<p class="empty">没有找到。可以输入题号（如 123）、年份和卷别（如 2019数二）、考点名称（如 拐点），或题干里的文字。</p>`}`,
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
  text: QuestionText | undefined;
  total: number;
}

export function questionPage(meta: Meta, d: QuestionData) {
  const { q } = d;
  return layout(meta, {
    title: `#${pad3(q.num)} ${q.kp}`,
    nav: "bank",
    head: d.text ? katexCss(meta) : "",
    scripts: d.text ? katexJs(meta) : "",
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
  ${qmeta(q, d.text)}
  ${questionBody(meta, q, d.text)}
</article>
<div class="reveal-bar reveal-bar-single">
  ${revealToggle("answer", "答案与解析", "空格")}
</div>
<section id="answer" class="reveal-panel" aria-label="答案与解析">
  ${answerBody(meta, q, d.text)}
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
