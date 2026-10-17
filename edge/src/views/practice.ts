// Port of dgy/templates/practice.html and practice_done.html.
import { html } from "hono/html";
import type { KnowledgeEntry, Question, QuestionText, Section } from "../content";
import type { PracticeSession } from "../db";
import type { Meta } from "../env";
import { GRADE_LABELS } from "../srs";
import type { Review } from "../stats";
import { layout } from "./layout";
import { answerBody, katexCss, katexJs, knowledgePanel, qmeta, questionBody, revealToggle } from "./parts";
import { contentUrl, pad3 } from "./util";

export interface PracticeData {
  session: PracticeSession;
  q: Question;
  next: Question | undefined;
  history: Review[];
  knowledge: KnowledgeEntry[];
  sections: Section[];
  titles: Record<string, string>;
  text: QuestionText | undefined;
}

export function practicePage(meta: Meta, d: PracticeData) {
  const { session, q } = d;
  const last = d.history[d.history.length - 1];
  const lastDay = last ? new Date(`${last.studyDay}T00:00:00Z`) : null;
  return layout(meta, {
    title: `#${pad3(q.num)} ${q.kp}`,
    pageClass: "page-practice",
    head: html`${d.text ? katexCss(meta) : ""}${d.next ? html`<link rel="prefetch" href="${contentUrl(meta, d.next.img.src)}" as="image">` : ""}`,
    scripts: d.text ? katexJs(meta) : "",
    body: html`<div class="practice" data-practice data-shortcuts>
  <header class="practice-head">
    <p class="practice-title">${session.title}</p>
    <p class="practice-count">第 <b>${session.position + 1}</b> / ${session.queue.length} 题</p>
  </header>
  <div class="track" aria-hidden="true"><span style="width: ${Math.round((100 * session.position) / session.queue.length)}%"></span></div>

  <article class="sheet">
    ${qmeta(q, d.text)}
    ${questionBody(meta, q, d.text)}
  </article>

  <div class="reveal-bar">
    ${revealToggle("answer", "答案与解析", "空格")}
    ${revealToggle("knowledge", "知识点", "K")}
  </div>
  <section id="answer" class="reveal-panel" aria-label="答案与解析">
    ${answerBody(meta, q, d.text)}
  </section>
  <section id="knowledge" class="reveal-panel" aria-label="知识点">
    ${knowledgePanel(q, d.sections, d.knowledge, d.titles)}
  </section>

  <p class="side-info">
    ${last && lastDay ? `上次自评：${GRADE_LABELS[last.grade]}（${lastDay.getUTCMonth() + 1}月${lastDay.getUTCDate()}日）` : "第一次做这道题"}
    · <a href="/q/${q.num}" target="_blank" rel="noopener">题目详情</a>
  </p>
</div>

<div class="gradebar">
  <div class="gradebar-inner">
    <form method="post" action="/practice/${session.id}/grade" class="grades">
      <input type="hidden" name="num" value="${q.num}">
      <button name="grade" value="mastered" class="grade grade-mastered" data-key="1"><kbd>1</kbd>完全掌握</button>
      <button name="grade" value="shaky" class="grade grade-shaky" data-key="2"><kbd>2</kbd>不熟练/错误</button>
      <button name="grade" value="unknown" class="grade grade-unknown" data-key="3"><kbd>3</kbd>完全不会</button>
    </form>
    <form method="post" action="/practice/${session.id}/skip" class="skip">
      <input type="hidden" name="num" value="${q.num}">
      <button class="btn-quiet js-skip">跳过 <kbd>→</kbd></button>
    </form>
  </div>
</div>`,
  });
}

export function practiceDonePage(meta: Meta, session: PracticeSession, grades: Record<string, number>) {
  return layout(meta, {
    title: "这组做完了",
    body: html`<section class="card done">
  <h1>这组做完了</h1>
  <p class="muted">${session.title} · 共 ${session.queue.length} 题</p>
  ${session.queue.length
    ? html`<ul class="legend legend-big">
    <li><i class="dot dot-mastered"></i>完全掌握 ${grades.mastered ?? 0}</li>
    <li><i class="dot dot-shaky"></i>不熟练/错误 ${grades.shaky ?? 0}</li>
    <li><i class="dot dot-unknown"></i>完全不会 ${grades.unknown ?? 0}</li>
  </ul>`
    : html`<p class="empty">这一组没有需要做的题。</p>`}
  <div class="done-actions">
    <a class="btn btn-primary" href="/">回首页</a>
    <a class="btn" href="/bank">去题库</a>
  </div>
</section>`,
  });
}
