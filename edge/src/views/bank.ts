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
import { STATUS_LABELS, answerBody, distBar, noteForm, restoreQuestion, katexCss, katexJs, qmeta, questionBody, questionCard, relatedKnowledge, revealToggle, reviewHistory, type Status } from "./parts";

// Same text as dgy/templates/_tree_scroll.html (test/content.test.ts checks): runs right after the tree, before the first
// paint, so a new page's tree does not show its top first and then jump; app.js saves the position.
const TREE_SCROLL = raw(`<script>try{var t=document.getElementById("kp-tree");t.scrollTop=+sessionStorage.getItem("dgy-tree-scroll:"+location.pathname)||0}catch(e){}</script>`);

const searchForm = (q = "", subject = "all", status = "all") => html`<form class="search" action="/bank/search" method="get" role="search">
    <label class="visually-hidden" for="q">搜索题目</label>
    <input id="q" name="q" type="search" value="${q}" placeholder="题号、年份或考点，多个关键词用空格分隔">
    <label class="visually-hidden" for="subject">科目</label>
    <select id="subject" name="subject">${[["all", "全部科目"], ["gaoshu", "高数"], ["xiandai", "线代"]].map(([value, label]) => html`<option value="${value}"${subject === value ? raw(" selected") : ""}>${label}</option>`)}</select>
    <label class="visually-hidden" for="status">掌握状态</label>
    <select id="status" name="status">${[["all", "全部状态"], ["new", "未做"], ["unknown", "不会"], ["shaky", "不熟练"], ["mastered", "掌握"], ["excluded", "已排除"]].map(([value, label]) => html`<option value="${value}"${status === value ? raw(" selected") : ""}>${label}</option>`)}</select>
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
  statusFilter: string;
  prev: [string, string] | null;
  following: [string, string] | null;
  state: UserState;
  texts: Map<number, QuestionText>;
  gradedToday: Map<number, Grade>;
  sections: Map<number, Section[]>;
  knowledge: KnowledgeEntry[];
  titles: Record<string, string>;
  histories: Map<number, Review[]>;
  notes: Map<number, string>;
}

const percent = (done: number, total: number) => (total ? Math.round((100 * done) / total) : 0);

export function chapterPage(meta: Meta, d: ChapterPageData) {
  const { chapter, current, prev, following } = d;
  const filter = d.statusFilter;
  const suffix = filter === "all" ? "" : `&status=${filter}`;
  const here = `/bank/${chapter.code}?kp=${current.index}${suffix}`;
  const shown = current.questions.map((q, i) => ({ q, index: i + 1 })).filter(({ q }) => filter === "all" || d.state.status(q.num) === filter);
  return layout(meta, {
    title: `${chapter.name} · ${current.kp}`,
    nav: "bank",
    pageClass: "page-drill",
    head: katexCss(meta),
    scripts: katexJs(meta),
    barStart: html`<button type="button" class="drill-tree-toggle js-tree-toggle" aria-controls="kp-tree" aria-expanded="true" aria-label="收起目录" title="收起目录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path class="tree-icon-pane" d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5v15H6A2.5 2.5 0 0 1 3.5 17z" stroke="none"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/></svg></button>`,
    barContext: html`<div class="bar-context">
        <span class="bar-title" aria-hidden="true">${current.kp}</span>
        ${prev ? html`<a class="btn btn-small" href="${prev[1]}">${prev[0]}</a>` : ""}
        ${following ? html`<a class="btn btn-small btn-primary" href="${following[1]}">${following[0]}</a>` : ""}
        <button type="button" class="pin-btn js-top-pin" aria-label="固定顶部" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="pin-head" d="M9 3.5h6M10 3.5v5.5l-3 4h10l-3-4V3.5z"/><path d="M12 13v7.5"/></svg></button>
      </div>
      <div class="drill-track js-done-bar" data-total="${current.total}" aria-hidden="true"><span style="width: ${percent(current.done, current.total)}%"></span></div>`,
    body: html`<div class="drill">
  <nav class="kp-tree" id="kp-tree" aria-label="考点目录">
    <p class="kt-chapter"><a href="/bank">题库</a> / ${chapter.name}</p>
    ${d.tree.map(([section, items]) => html`<div class="kt-section">
      <p class="kt-sec-name">${section}</p>
      ${items.map((k) => {
        const here = k.index === current.index;
        return html`<a class="kt-kp${here ? " is-current" : ""}" href="/bank/${chapter.code}?kp=${k.index}${suffix}"${here ? raw(' aria-current="page"') : ""}>
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
  ${TREE_SCROLL}

  <div class="drill-main">
    <header class="drill-head">
      <div class="drill-title">
        <h1>${current.kp}</h1>
        <p class="muted">${current.section} · 做过 <span class="js-done">${current.done}</span> / ${current.total} 题</p>
      </div>
      <form class="card-filters" method="get" action="/bank/${chapter.code}" aria-label="筛选题卡">
        <input type="hidden" name="kp" value="${current.index}">
        ${[["all", "全部"], ["new", "未做"], ["unknown", "不会"], ["shaky", "不熟练"]].map(([value, label]) => html`<button class="btn btn-small${filter === value ? " btn-primary" : ""}" name="status" value="${value}" aria-pressed="${String(filter === value)}">${label}</button>`)}
        <span class="muted">显示 ${shown.length} 题</span>
      </form>
      <div class="drill-actions">
        ${prev ? html`<a class="btn btn-small" href="${prev[1]}">${prev[0]}</a>` : ""}
        ${following ? html`<a class="btn btn-small btn-primary" href="${following[1]}">${following[0]}</a>` : ""}
      </div>
    </header>
    ${shown.length ? "" : html`<p class="empty">这个考点没有符合筛选的题目。选择“全部”可查看所有题卡。</p>`}
    <div class="qcards">
      ${shown.map(({ q, index }) => questionCard(meta, q, d.texts.get(q.num), d.state.status(q.num), index, d.gradedToday.get(q.num), `${here}#q-${q.num}`, {
        sections: d.sections.get(q.num) ?? [], knowledge: d.knowledge, titles: d.titles, history: d.histories.get(q.num) ?? [], card: d.state.cards.get(q.num), note: d.notes.get(q.num),
      }))}
    </div>

    <nav class="drill-foot" aria-label="翻节">
      ${prev ? html`<a class="btn" rel="prev" href="${prev[1]}">${prev[0]}</a>` : html`<span></span>`}
      ${following ? html`<a class="btn btn-primary" rel="next" href="${following[1]}">${following[0]}</a>` : ""}
    </nav>
  </div>
</div>`,
  });
}

/** Like Jinja's truncate(60, true, "…", 0) in search.html. */
const snippet = (text: string, length = 60) => (text.length <= length ? text : `${text.slice(0, length - 1)}…`);

export function searchPage(meta: Meta, q: string, found: Question[], state: UserState, texts: Map<number, QuestionText>, subject = "all", status = "all") {
  return layout(meta, {
    title: `搜索 ${q}`,
    nav: "bank",
    body: html`<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/bank">题库</a></p>
    <h1>搜索“${q}”</h1>
  </div>
  ${searchForm(q, subject, status)}
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
  note: string;
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
  ${d.status === "excluded" ? html`<div class="head-actions">
    ${restoreQuestion(`/q/${q.num}`, q.num, meta.grade_owner)}
  </div>` : ""}
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

<section class="card note-card">
  <h2 class="card-title">笔记</h2>
  ${noteForm(q.num, d.note, `/q/${q.num}`, meta.grade_owner)}
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
