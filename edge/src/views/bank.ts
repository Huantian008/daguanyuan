// Port of dgy/templates/bank.html, bank_chapter.html, search.html and question.html.
import { html, raw } from "hono/html";
import { qlabel, type ChapterInfo, type KnowledgeEntry, type Question, type QuestionText, type Section } from "../content";
import type { DrillKp } from "../drill";
import type { Meta } from "../env";
import type { CardState, Grade } from "../srs";
import type { UserState } from "../state";
import type { ChapterProgress, Distribution, Review } from "../stats";
import { cnDate } from "../studyday";
import { layout } from "./layout";
import { STATUS_LABELS, answerBody, distBar, excludeToggle, katexCss, katexJs, qmeta, questionBody, questionCard, relatedKnowledge, revealToggle, reviewHistory, type Status } from "./parts";

const searchForm = (q = "", placeholder = "题号、年份、考点或题干文字，如 123、线12、2019数二、拐点") => html`<form class="search" action="/bank/search" method="get" role="search">
    <label class="visually-hidden" for="q">搜索题目</label>
    <input id="q" name="q" type="search" value="${q}" placeholder="${placeholder}">
    <button class="btn">搜索</button>
  </form>`;

/** The chapters under their subject (高等数学, 线性代数), each with its progress. */
export function bankPage(meta: Meta, groups: [string, [ChapterProgress, Distribution][]][]) {
  return layout(meta, {
    title: "题库",
    nav: "bank",
    body: html`<header class="page-head">
  <h1>题库</h1>
  ${searchForm()}
</header>
${groups.map(([group, rows]) => html`<h2 class="group-title">${group}</h2>
<ul class="chapters">
  ${rows.map(([p, dist]) => html`<li class="card chapter-card">
    <a class="chapter-link" href="/bank/${p.code}">
      <span class="chapter-name">${p.name}</span>
      <span class="muted">做过 ${p.done} / ${p.total} 题</span>
    </a>
    ${distBar(dist)}
  </li>`)}
</ul>`)}`,
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
  sections: Map<number, Section[]>;
  knowledge: KnowledgeEntry[];
  titles: Record<string, string>;
  histories: Map<number, Review[]>;
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
      ${items.map((k) => {
        const here = k.index === current.index;
        return html`<a class="kt-kp${here ? " is-current" : ""}" href="/bank/${chapter.code}?kp=${k.index}"${here ? raw(' aria-current="page"') : ""}>
        <span class="kt-name">${k.kp}</span>
        <span class="kt-count">${here ? html`<span class="js-done">${k.done}</span>` : k.done} / ${k.total}</span>
        <i class="kt-bar${k.total && k.done === k.total ? " is-full" : ""}${here ? " js-done-bar" : ""}" data-total="${k.total}"><b style="width: ${percent(k.done, k.total)}%"></b></i>
      </a>`;
      })}
    </div>`)}
    <div class="kt-section kt-chapters">
      <p class="kt-sec-name">其他章</p>
      ${d.chapters.filter((c) => c.code !== chapter.code).map((c) => html`<a class="kt-kp" href="/bank/${c.code}"><span class="kt-name">${c.name}</span></a>`)}
    </div>
  </nav>

  <div class="drill-main">
    <header class="drill-head">
      <button type="button" class="drill-tree-toggle js-tree-toggle" aria-controls="kp-tree" aria-expanded="true" hidden>收起目录</button>
      <div class="drill-title">
        <h1>${current.kp}</h1>
        <p class="muted">${current.section} · 做过 <span class="js-done">${current.done}</span> / ${current.total} 题</p>
      </div>
      <div class="drill-actions">
        ${prev ? html`<a class="btn btn-small" href="${prev[1]}">${prev[0]}</a>` : ""}
        ${following ? html`<a class="btn btn-small btn-primary" href="${following[1]}">${following[0]}</a>` : ""}
      </div>
      <div class="drill-track js-done-bar" data-total="${current.total}" aria-hidden="true"><span style="width: ${percent(current.done, current.total)}%"></span></div>
    </header>

    <div class="qcards">
      ${current.questions.map((q, i) => questionCard(meta, q, d.texts.get(q.num), d.state.status(q.num), i + 1, d.gradedToday.get(q.num), `${here}#q-${q.num}`, {
        sections: d.sections.get(q.num) ?? [], knowledge: d.knowledge, titles: d.titles, history: d.histories.get(q.num) ?? [], card: d.state.cards.get(q.num),
      }))}
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
    <a href="/q/${item.num}"><span class="qnum">${qlabel(item.num)}</span> ${item.section} / ${item.kp}</a>
    <span class="muted">${item.source_full}</span>
    <span class="chip chip-${state.status(item.num)}">${STATUS_LABELS[state.status(item.num)]}</span>
    ${texts.has(item.num) ? html`<p class="snippet">${snippet(texts.get(item.num)!.search)}</p>` : ""}
  </li>`)}
</ul>`
    : html`<p class="empty">没有找到。可以输入题号（高数如 123，线代如 线12）、年份和卷别（如 2019数二）、考点名称（如 拐点），或题干里的文字。</p>`}`,
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
  /** The previous and next question in the same book. */
  prev: number | null;
  next: number | null;
  /** The 考点 of the chapter page that has this question, for the link back to its card. */
  kpIndex: number;
}

export function questionPage(meta: Meta, d: QuestionData) {
  const { q } = d;
  return layout(meta, {
    title: `${qlabel(q.num)} ${q.kp}`,
    nav: "bank",
    head: d.text ? katexCss(meta) : "",
    scripts: d.text ? katexJs(meta) : "",
    body: html`<div data-shortcuts>
<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/bank/${d.chapter.code}?kp=${d.kpIndex}#q-${q.num}">${d.chapter.name}</a> / ${q.path.join(" / ")}</p>
    <h1>${qlabel(q.num)} ${q.kp}</h1>
  </div>
  <div class="head-actions">
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
    ${reviewHistory(d.history)}
  </section>
</div>

${q.quick_id ? html`<p class="side-info">答案速查编号 ${q.quick_id} · 原稿第 ${q.orig_page} 页</p>` : ""}
<nav class="pager" aria-label="翻题">
  ${d.prev !== null ? html`<a class="btn btn-small" href="/q/${d.prev}">← ${qlabel(d.prev)}</a>` : html`<span></span>`}
  ${d.next !== null ? html`<a class="btn btn-small" href="/q/${d.next}">${qlabel(d.next)} →</a>` : ""}
</nav>
</div>`,
  });
}
