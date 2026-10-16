// Port of dgy/templates/practice.html and practice_done.html.
import { html } from "hono/html";
import type { KnowledgeEntry, Question } from "../content";
import type { PracticeSession } from "../db";
import type { Meta } from "../env";
import { GRADE_LABELS } from "../srs";
import type { Review } from "../stats";
import { layout } from "./layout";
import { images, qmeta } from "./parts";
import { contentUrl, pad3 } from "./util";

export interface PracticeData {
  session: PracticeSession;
  q: Question;
  next: Question | undefined;
  history: Review[];
  knowledge: KnowledgeEntry[];
}

export function practicePage(meta: Meta, d: PracticeData) {
  const { session, q } = d;
  const last = d.history[d.history.length - 1];
  const lastDay = last ? new Date(`${last.studyDay}T00:00:00Z`) : null;
  return layout(meta, {
    title: `#${pad3(q.num)} ${q.kp}`,
    pageClass: "page-practice",
    head: d.next ? html`<link rel="prefetch" href="${contentUrl(meta, d.next.img.src)}" as="image">` : "",
    body: html`<div class="practice" data-practice>
  <header class="practice-head">
    <div>
      <p class="eyebrow">${session.title}</p>
      <p class="muted">第 ${session.position + 1} / ${session.queue.length} 题</p>
    </div>
    <span class="timer js-timer" title="这道题已用时间">00:00</span>
  </header>
  <div class="track" aria-hidden="true"><span style="width: ${Math.round((100 * session.position) / session.queue.length)}%"></span></div>

  <article class="sheet">
    ${qmeta(q)}
    <div class="qbody">${images(meta, [q.img], "qimg", `题目 #${pad3(q.num)}`, 1.6, false)}</div>
  </article>

  <details class="reveal answer">
    <summary>显示答案 <kbd>空格</kbd></summary>
    <div class="reveal-body">${images(meta, [q.answer], "aimg", "答案", 2.2)}</div>
  </details>
  <details class="reveal solution">
    <summary>看解析 <kbd>S</kbd> <span class="muted">${q.solution.length} 张图</span></summary>
    <div class="reveal-body">${images(meta, q.solution, "simg", "解析", 2)}</div>
  </details>

  <p class="side-info">
    ${last && lastDay ? `上次自评：${GRADE_LABELS[last.grade]}（${lastDay.getUTCMonth() + 1}月${lastDay.getUTCDate()}日）` : "第一次做这道题"}
    ${d.knowledge.map((k) => html` · <a href="/knowledge/${k.slug}" target="_blank" rel="noopener">知识点：${k.title}</a>`)}
    · <a href="/q/${q.num}" target="_blank" rel="noopener">题目详情</a>
  </p>
</div>

<div class="gradebar">
  <div class="gradebar-inner">
    <form method="post" action="/practice/${session.id}/grade" class="grades">
      <input type="hidden" name="num" value="${q.num}">
      <input type="hidden" name="elapsed" value="" class="js-elapsed">
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
