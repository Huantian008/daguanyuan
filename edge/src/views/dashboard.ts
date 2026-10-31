// Port of dgy/templates/dashboard.html.
import { html } from "hono/html";
import type { DrillKp } from "../drill";
import type { Meta } from "../env";
import type { ChapterProgress, DayTotal, Distribution, WeakSpot } from "../stats";
import { cnDate, type Day } from "../studyday";
import { layout } from "./layout";
import { distBar, legend } from "./parts";

/** Where 继续往下做 goes; `resumed` when it carries on from the last question graded, not from the start of the book. */
export interface Onward {
  code: string;
  name: string;
  kp: DrillKp;
  resumed: boolean;
  num: number;
}

export interface DashboardData {
  /** the calendar date, which turns at midnight; everything else on the page goes by the study day */
  date: Day;
  daysLeft: number;
  warmup: number[];
  due: number[];
  onward: Onward | null;
  progress: ChapterProgress[];
  dist: Distribution;
  activeTotal: number;
  /** each with the ?kp= of its 考点 on the chapter page */
  weak: [WeakSpot, number][];
  chapterNames: Record<string, string>;
  totals: DayTotal[];
  streak: number;
}

export function dashboardPage(meta: Meta, d: DashboardData) {
  const today = d.totals[d.totals.length - 1];
  const maxCount = Math.max(1, ...d.totals.map((t) => t.count));
  const o = d.onward;
  // only the first step that has questions today gets the primary button
  const dueCls = d.warmup.length ? "btn" : "btn btn-primary";
  const onwardsCls = d.warmup.length || d.due.length ? "btn" : "btn btn-primary";
  return layout(meta, {
    title: "今天",
    nav: "home",
    body: html`<section class="hero">
  <div>
    <h1>今天的数学</h1>
    <p class="hero-date">${cnDate(d.date)}</p>
  </div>
  <p class="countdown">考研初试 · 还有 <strong>${d.daysLeft}</strong> 天</p>
</section>

<ol class="tonight" aria-label="今晚的顺序">
  <li class="step${d.warmup.length ? "" : " is-clear"}" data-warmup-count="${d.warmup.length}">
    <div class="step-head"><span class="step-no" aria-hidden="true">1</span><h2>热身</h2></div>
    <p class="step-count"><b>${d.warmup.length}</b> 题</p>
    <p class="step-note">把前几天做过的题再做一遍</p>
    ${d.warmup.length ? html`<a class="btn btn-primary" href="/review/warmup">开始热身</a>` : html`<p class="step-clear">今天不用热身</p>`}
  </li>
  <li class="step${d.due.length ? "" : " is-clear"}" data-due-count="${d.due.length}">
    <div class="step-head"><span class="step-no" aria-hidden="true">2</span><h2>到期复习</h2></div>
    <p class="step-count"><b>${d.due.length}</b> 题</p>
    <p class="step-note">按复习间隔排到今天的题</p>
    ${d.due.length ? html`<a class="${dueCls}" href="/review/due">开始复习</a>` : html`<p class="step-clear">今天没有到期的题</p>`}
  </li>
  <li class="step">
    <div class="step-head"><span class="step-no" aria-hidden="true">3</span><h2>继续往下做</h2></div>
    ${o
      ? html`<p class="step-count"><b>${o.kp.total - o.kp.done}</b> 题没做</p>
    <p class="step-note">${o.name} / ${o.kp.section} / ${o.kp.kp}</p>
    <div class="step-actions">
      <a class="${onwardsCls}" href="/bank/${o.code}?kp=${o.kp.index}#q-${o.num}">${o.resumed ? "继续上次" : "开始做题"}</a>
      <a class="btn" href="/bank">换个考点</a>
    </div>`
      : html`<p class="step-count"><b>0</b> 题没做过</p>
    <p class="step-note">整本题库都做过一遍了</p>
    <a class="${onwardsCls}" href="/bank">去题库</a>`}
  </li>
</ol>

<div class="grid">
  <section class="card">
    <header class="card-head"><h2>进度</h2><span class="muted">做过的题 / 要做的题</span></header>
    <ul class="progress">
      ${d.progress.map((p, i) => html`${i === 0 || p.group !== d.progress[i - 1].group ? html`<li class="progress-group">${p.group}</li>` : ""}<li>
        <a class="progress-name" href="/bank/${p.code}">${p.name}</a>
        <span class="bar" aria-hidden="true"><span style="width: ${p.percent}%"></span></span>
        <span class="progress-num">${p.done}/${p.total}</span>
      </li>`)}
    </ul>
  </section>

  <section class="card">
    <header class="card-head"><h2>掌握情况</h2><span class="muted">共 ${d.activeTotal} 题</span></header>
    ${distBar(d.dist)}
    ${legend(d.dist)}
    <h3 class="minor">优先巩固</h3>
    ${d.weak.length
      ? html`<ul class="weak">${d.weak.map(([w, kpIndex]) => html`<li>
        <div>
          <b>${w.section} / ${w.kp}</b>
          <span class="muted">${d.chapterNames[w.chapter]} · ${w.nums.length} 题待巩固</span>
        </div>
        <a class="btn btn-small" href="/bank/${w.chapter}?kp=${kpIndex}">去巩固</a>
      </li>`)}</ul>`
      : html`<p class="empty">还没有自评为“不熟练”或“完全不会”的题，做题后这里会列出最该补的考点。</p>`}
  </section>

  <section class="card">
    <header class="card-head"><h2>学习趋势</h2><a href="/history">学习记录</a></header>
    <div class="kpis">
      <div><b>${today.count}</b><span>今日题数</span></div>
      <div><b>${d.streak}</b><span>连续学习天数</span></div>
    </div>
    <div class="spark" role="img" aria-label="近 30 天每天做的题数">${d.totals.map((t) => html`<span title="${cnDate(t.day)}：${t.count} 题" style="height: ${Math.round((100 * t.count) / maxCount)}%"></span>`)}</div>
    <p class="spark-axis"><span>30 天前</span><span>今天</span></p>
  </section>
</div>`,
  });
}
