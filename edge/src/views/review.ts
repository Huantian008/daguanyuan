// Port of dgy/templates/review.html.
import { html } from "hono/html";
import type { KnowledgeEntry, Question, QuestionText, Section } from "../content";
import type { Meta } from "../env";
import type { Grade } from "../srs";
import type { UserState } from "../state";
import type { Review } from "../stats";
import { layout } from "./layout";
import { katexCss, katexJs, questionCard } from "./parts";

export const REVIEW_PAGES = {
  warmup: { title: "热身", note: "把前几天做过的题再做一遍", empty: "今天不用热身。" },
  due: { title: "到期复习", note: "按复习间隔排到今天的题", empty: "今天没有到期的题。" },
} as const;
export type ReviewMode = keyof typeof REVIEW_PAGES;
export const isReviewMode = (mode: string): mode is ReviewMode => mode === "warmup" || mode === "due";

export interface ReviewPageData {
  mode: ReviewMode;
  questions: Question[];
  state: UserState;
  texts: Map<number, QuestionText>;
  gradedToday: Map<number, Grade>;
  sections: Map<number, Section[]>;
  knowledge: (q: Question) => KnowledgeEntry[];
  titles: Record<string, string>;
  histories: Map<number, Review[]>;
  notes: Map<number, string>;
}

/** Warm-up or due review as cards like the chapter page: those graded here today stay on it, above the ones left. */
export function reviewPage(meta: Meta, d: ReviewPageData) {
  const page = REVIEW_PAGES[d.mode];
  const here = `/review/${d.mode}`;
  const graded = d.questions.filter((q) => d.gradedToday.has(q.num)).length;
  return layout(meta, {
    title: page.title,
    nav: "home",
    pageClass: "page-review",
    head: katexCss(meta),
    scripts: katexJs(meta),
    body: html`<header class="page-head">
  <div>
    <p class="eyebrow"><a href="/">今天</a></p>
    <h1>${page.title}</h1>
    <p class="muted">${page.note}${d.questions.length ? html` · 今天已评 <span class="js-graded">${graded}</span> / ${d.questions.length} 题` : ""}</p>
  </div>
</header>
${d.questions.length
    ? html`<div class="qcards">
  ${d.questions.map((q, i) => questionCard(meta, q, d.texts.get(q.num), d.state.status(q.num), i + 1, d.gradedToday.get(q.num), `${here}#q-${q.num}`, {
    sections: d.sections.get(q.num) ?? [], knowledge: d.knowledge(q), titles: d.titles, history: d.histories.get(q.num) ?? [],
    card: d.state.cards.get(q.num), mode: d.mode, note: d.notes.get(q.num),
  }))}
</div>`
    : html`<p class="empty">${page.empty}</p>`}
<nav class="drill-foot" aria-label="回首页">
  <a class="btn js-all-graded${d.questions.length && graded === d.questions.length ? " btn-primary" : ""}" data-total="${d.questions.length}" href="/">← 回首页</a>
</nav>`,
  });
}
