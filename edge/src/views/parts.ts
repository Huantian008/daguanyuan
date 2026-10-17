// Port of dgy/templates/_macros.html.
import { html, raw } from "hono/html";
import { sectionLabel, type Img, type KnowledgeEntry, type Question, type QuestionText, type Section } from "../content";
import type { Meta } from "../env";
import { GRADE_LABELS, type CardState, type Grade } from "../srs";
import type { UserState } from "../state";
import type { Distribution, Review } from "../stats";
import { cnDate } from "../studyday";
import { contentUrl, pad3, staticUrl, stars, type Html } from "./util";

export function qmeta(q: Question, text?: QuestionText): Html {
  return html`<div class="qmeta">
  <span class="qnum">#${pad3(q.num)}</span>
  <span class="qkp">${q.kp}</span>
  <span class="qsrc">${q.source_full}</span>
  <span class="qdiff" title="原书得分率 ${q.difficulty}">${stars(q.stars)}</span>
  <span class="qmins">建议 ${q.minutes} 分钟</span>
  ${q.flags.map((flag) => html`<span class="flag">${flag}</span>`)}
  ${text ? html`<button type="button" class="qview-toggle js-qview" aria-pressed="false" title="在文字和原图之间切换（V）" hidden>原图</button>` : ""}
</div>`;
}

/** The question as text (KaTeX) and as the original image; app.js shows one of them, without JavaScript both show. */
export function questionBody(meta: Meta, q: Question, text?: QuestionText, o: { forceLazy?: boolean; dataCorrect?: boolean } = {}): Html {
  const view = !text || text.figure ? "image" : "text";
  return html`<div class="qview" data-view="${view}"${text?.figure ? raw(" data-figure") : ""}>
  ${text ? html`<div class="qtext">
    ${raw(text.stem)}
    ${text.options.length ? html`<ul class="qopts${text.options_wide ? " qopts-wide" : ""}">${text.options.map(([key, opt]) => html`<li${o.dataCorrect && key === text.answer_key ? raw(" data-correct") : ""}><b>${key}.</b> ${raw(opt)}</li>`)}</ul>` : ""}
  </div>` : ""}
  <div class="qimage paper">${images(meta, [q.img], "qimg", `题目 #${pad3(q.num)}`, 1.6, view === "text" || !!o.forceLazy)}</div>
</div>`;
}

/** The answer as text with any erratum below it, then the 答案速查 image folded away. */
export function answerPart(meta: Meta, q: Question, text?: QuestionText): Html {
  const option = text?.answer_key ? text.options.find(([key]) => key === text.answer_key)?.[1] : undefined;
  const answer = text
    ? html`<div class="qanswer">${text.answer_key ? html`<p><b>${text.answer_key}.</b> ${raw(option ?? "")}</p>` : raw(text.answer)}</div>
${text.erratum ? html`<p class="erratum"><b>勘误</b>${raw(text.erratum)}</p>` : ""}
<details class="raw-img"><summary>答案原图</summary><div class="paper">${images(meta, [q.answer], "aimg", "答案", 2.2)}</div></details>`
    : html`<div class="paper">${images(meta, [q.answer], "aimg", "答案", 2.2)}</div>`;
  return html`<h2 class="panel-label">答案</h2>
${answer}`;
}

export const solutionPart = (meta: Meta, q: Question): Html => html`<h2 class="panel-label">解析 <span class="muted">${q.solution.length} 张图</span></h2>
<div class="paper">${images(meta, q.solution, "simg", "解析", 2)}</div>`;

export const answerBody = (meta: Meta, q: Question, text?: QuestionText): Html => html`${answerPart(meta, q, text)}
${solutionPart(meta, q)}`;

/** One question on the chapter page: header, the question, a bar of buttons, and the answer and solution folded away. */
export interface CardExtras {
  sections: Section[];
  knowledge: KnowledgeEntry[];
  titles: Record<string, string>;
  history: Review[];
  card?: CardState;
  /** warmup / due on those pages, so the grade is recorded as part of them */
  mode?: string;
}

export function questionCard(
  meta: Meta, q: Question, text: QuestionText | undefined, status: Status, index: number, graded: Grade | undefined, back: string,
  x: CardExtras,
): Html {
  const excluded = status === "excluded";
  const gradeButton = (grade: Grade, label: string) =>
    html`<button name="grade" value="${grade}" class="qc-grade qc-grade-${grade}${graded === grade ? " is-picked" : ""}"${graded ? raw(" disabled") : ""}>${label}</button>`;
  return html`<article class="qcard${excluded ? " is-excluded" : ""}" id="q-${q.num}"${text?.answer_key ? raw(" data-choice") : ""}>
  <header class="qc-head">
    <strong class="qc-num" title="#${pad3(q.num)}">${index}</strong>
    <span class="qc-src">${q.source_full}</span>
    <span class="qc-path">${q.path.join(" / ")}</span>
    <span class="qc-meta"><span class="qdiff" title="原书得分率 ${q.difficulty}">${stars(q.stars)}</span> 建议 ${q.minutes} 分钟${q.flags.map((flag) => html` <span class="flag">${flag}</span>`)}</span>
    ${text && !excluded ? html`<button type="button" class="qview-toggle js-qview" aria-pressed="false" title="在文字和原图之间切换" hidden>原图</button>` : ""}
    <span class="qc-tools">${excludeToggle(excluded, back, { nums: String(q.num) })}</span>
  </header>
  ${excluded ? "" : html`${questionBody(meta, q, text, { forceLazy: true, dataCorrect: true })}
  <div class="qc-actions">
    <div class="qc-toggles">
      <button type="button" class="qc-btn js-qc-toggle" aria-expanded="false" aria-controls="qa-${q.num}" data-label="答案" hidden>查看答案</button>
      <button type="button" class="qc-btn js-qc-toggle" aria-expanded="false" aria-controls="qs-${q.num}" data-label="解析" hidden>查看解析</button>
      <button type="button" class="qc-btn js-qc-toggle" aria-expanded="false" aria-controls="qk-${q.num}" hidden>相关知识点</button>
      <button type="button" class="qc-btn js-qc-toggle" aria-expanded="false" aria-controls="qh-${q.num}" hidden>做题记录</button>
    </div>
    <form method="post" action="/q/${q.num}/grade" class="qc-grades">
      <input type="hidden" name="back" value="${back}">${hidden("mode", x.mode)}
      ${graded ? html`<span class="qc-graded">今天已评</span>` : ""}
      ${gradeButton("shaky", "不熟练")}
      ${gradeButton("unknown", "不会")}
      ${gradeButton("mastered", "掌握")}
    </form>
  </div>
  <section class="qc-panel" id="qa-${q.num}" data-panel="answer" aria-label="答案">${answerPart(meta, q, text)}</section>
  <section class="qc-panel" id="qs-${q.num}" data-panel="solution" aria-label="解析">${solutionPart(meta, q)}</section>
  <section class="qc-panel" id="qk-${q.num}" data-panel="knowledge" aria-label="相关知识点">
    <h2 class="panel-label">相关知识点</h2>
    ${relatedKnowledge(x.sections, x.knowledge, x.titles)}
  </section>
  <section class="qc-panel" id="qh-${q.num}" data-panel="history" aria-label="做题记录">
    <h2 class="panel-label">做题记录${x.card?.due ? html` <span class="muted">下次复习：${cnDate(x.card.due)} · 已做 ${x.card.reps} 次</span>` : ""}</h2>
    ${reviewHistory(x.history)}
  </section>`}
</article>`;
}

export const katexCss = (meta: Meta): Html => html`<link rel="stylesheet" href="${staticUrl(meta, "vendor/katex/katex.min.css")}">`;
export const katexJs = (meta: Meta): Html => html`<script src="${staticUrl(meta, "vendor/katex/katex.min.js")}" defer></script>`;

export function images(meta: Meta, list: Img[], cls: string, alt: string, scale = 2, lazy = true): Html {
  return html`${list.map((img) => html`<img class="${cls}" src="${contentUrl(meta, img.src)}" width="${Math.round(img.w / scale)}" height="${Math.round(img.h / scale)}" alt="${alt}" ${lazy ? raw('loading="lazy" decoding="async"') : raw('fetchpriority="high"')}>`)}`;
}

const DIST_KEYS = ["mastered", "shaky", "unknown", "new"] as const;

export const distBar = (d: Distribution): Html => html`<div class="dist" role="img" aria-label="完全掌握 ${d.mastered}，不熟练或错误 ${d.shaky}，完全不会 ${d.unknown}，未做 ${d.new}">${DIST_KEYS.filter((k) => d[k]).map((k) => html`<span class="seg seg-${k}" style="flex-grow: ${d[k]}"></span>`)}</div>`;

export const legend = (d: Distribution): Html => html`<ul class="legend" data-dist-mastered="${d.mastered}" data-dist-shaky="${d.shaky}" data-dist-unknown="${d.unknown}" data-dist-new="${d.new}">
  <li><i class="dot dot-mastered"></i>完全掌握<b>${d.mastered}</b></li>
  <li><i class="dot dot-shaky"></i>不熟练/错误<b>${d.shaky}</b></li>
  <li><i class="dot dot-unknown"></i>完全不会<b>${d.unknown}</b></li>
  <li><i class="dot dot-new"></i>未做<b>${d.new}</b></li>
</ul>`;

const hidden = (name: string, value?: string) => (value ? html`<input type="hidden" name="${name}" value="${value}">` : "");

export interface ExcludeOptions {
  nums?: string;
  chapter?: string;
  section?: string;
  kp?: string;
  onLabel?: string;
}

export const excludeToggle = (excluded: boolean, back: string, o: ExcludeOptions = {}): Html => html`<form method="post" action="/bank/exclude" class="inline">
  <input type="hidden" name="excluded" value="${excluded ? "0" : "1"}">
  <input type="hidden" name="back" value="${back}">${hidden("nums", o.nums)}${hidden("chapter", o.chapter)}${hidden("section", o.section)}${hidden("kp", o.kp)}
  <button class="btn-quiet">${excluded ? "恢复，要做" : (o.onLabel ?? "不做了")}</button>
</form>`;

const CHEVRON = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');

/** The question page's 「答案与解析」 switch; app.js opens and closes the panel it controls. */
export const revealToggle = (target: string, label: string, key: string): Html =>
  html`<button type="button" class="reveal-toggle js-reveal" aria-expanded="false" aria-controls="${target}">${label} <kbd>${key}</kbd>${CHEVRON}</button>`;

/** Tagged knowledge sections; app.js opens a section's text in a drawer, without JavaScript the link opens the page. */
export const knLinks = (sections: Section[], titles: Record<string, string>): Html => html`<ul class="kn-links">
  ${sections.map((s) => {
    const original = `/knowledge/${s.slug}${s.page_index ? `#p${s.page_index}` : ""}`;
    return html`<li class="kn-link">
    <a class="kn-open js-kn-open" href="/knowledge/${s.slug}?tab=text#${s.anchor}" data-src="/knowledge/${s.slug}?tab=text" data-anchor="${s.anchor}" data-original="${original}">
      <span class="kn-chapter">${titles[s.slug] ?? s.slug}</span>
      <span class="kn-title">${sectionLabel(s)}</span>
    </a>
    <a class="kn-page-link" href="${original}" target="_blank" rel="noopener">${s.page_index ? `原版第 ${s.page_index} 页` : "原版"}</a>
  </li>`;
  })}
</ul>`;

/** Questions not tagged yet fall back to the whole knowledge chapters of their 做题本 chapter. */
const chapterFallback = (knowledge: KnowledgeEntry[]): Html =>
  html`<p class="muted">这道题还没有逐题标注，先看整章：${knowledge.map((k, i) => html`${i ? "、" : ""}<a href="/knowledge/${k.slug}?tab=text">${k.title}</a>`)}</p>`;

export const relatedKnowledge = (sections: Section[], knowledge: KnowledgeEntry[], titles: Record<string, string>): Html =>
  sections.length ? knLinks(sections, titles) : chapterFallback(knowledge);

export const reviewHistory = (history: Review[]): Html => history.length
  ? html`<ul class="plain">${[...history].reverse().map((r) => html`<li><span class="muted">${cnDate(r.studyDay)}</span> <span class="chip chip-${r.grade}">${GRADE_LABELS[r.grade]}</span></li>`)}</ul>`
  : html`<p class="empty">还没做过这道题。</p>`;

/** The questions tagged with a knowledge section (or an original page), each linking to its question page. */
export function sectionQuestions(nums: number[], state: UserState, label = "本节题目"): Html {
  return html`<div class="section-qs">
  <span class="section-qs-label">${label}</span>
  <span class="chips">${nums.map((n) => html`<a class="chip chip-${state.status(n)}" href="/q/${n}">${pad3(n)}</a>`)}</span>
</div>`;
}

export type Status = "excluded" | "new" | "mastered" | "shaky" | "unknown";

export const STATUS_LABELS: Record<Status, string> = {
  excluded: "不做", new: "未做", mastered: "完全掌握", shaky: "不熟练/错误", unknown: "完全不会",
};
