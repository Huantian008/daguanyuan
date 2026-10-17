// Port of dgy/templates/dashboard.html.
import { html } from "hono/html";
import type { PracticeSession } from "../db";
import type { Meta } from "../env";
import type { ChapterProgress, DayTotal, Distribution, WeakSpot } from "../stats";
import { cnDate, type Day } from "../studyday";
import { layout } from "./layout";
import { distBar, legend, startForm } from "./parts";

export interface DashboardData {
  today: Day;
  daysLeft: number;
  warmup: number[];
  due: number[];
  openSession: PracticeSession | null;
  progress: ChapterProgress[];
  dist: Distribution;
  activeTotal: number;
  weak: WeakSpot[];
  chapterNames: Record<string, string>;
  totals: DayTotal[];
  streak: number;
}

export function dashboardPage(meta: Meta, d: DashboardData) {
  const today = d.totals[d.totals.length - 1];
  const maxCount = Math.max(1, ...d.totals.map((t) => t.count));
  const s = d.openSession;
  // only the first step that has questions today gets the primary button
  const dueCls = d.warmup.length ? "btn" : "btn btn-primary";
  const onwardsCls = d.warmup.length || d.due.length ? "btn" : "btn btn-primary";
  return layout(meta, {
    title: "今天",
    nav: "home",
    body: html`<section class="hero">
  <div>
    <h1>今天的数学</h1>
    <p class="hero-date">${cnDate(d.today)}</p>
  </div>
  <p class="countdown">考研初试 · 还有 <strong>${d.daysLeft}</strong> 天</p>
</section>

<ol class="tonight" aria-label="今晚的顺序">
  <li class="step${d.warmup.length ? "" : " is-clear"}" data-warmup-count="${d.warmup.length}">
    <div class="step-head"><span class="step-no" aria-hidden="true">1</span><h2>热身</h2></div>
    <p class="step-count"><b>${d.warmup.length}</b> 题</p>
    <p class="step-note">把前几天做过的题再做一遍</p>
    ${d.warmup.length ? startForm("开始热身", "warmup", { cls: "btn btn-primary" }) : html`<p class="step-clear">今天不用热身</p>`}
  </li>
  <li class="step${d.due.length ? "" : " is-clear"}" data-due-count="${d.due.length}">
    <div class="step-head"><span class="step-no" aria-hidden="true">2</span><h2>到期复习</h2></div>
    <p class="step-count"><b>${d.due.length}</b> 题</p>
    <p class="step-note">按复习间隔排到今天的题</p>
    ${d.due.length ? startForm("开始复习", "due", { cls: dueCls }) : html`<p class="step-clear">今天没有到期的题</p>`}
  </li>
  <li class="step">
    <div class="step-head"><span class="step-no" aria-hidden="true">3</span><h2>继续往下做</h2></div>
    ${s
      ? html`<p class="step-count"><b>${s.queue.length - s.position}</b> 题没做完</p>
    <p class="step-note">${s.title}</p>
    <div class="step-actions">
      <a class="${onwardsCls}" href="/practice/${s.id}">继续上次</a>
      <a class="btn" href="/bank">换个考点</a>
    </div>`
      : html`<p class="step-count"><b>${d.progress.reduce((n, p) => n + p.total - p.done, 0)}</b> 题没做过</p>
    <p class="step-note">去题库点开章节，按考点往下刷</p>
    <a class="${onwardsCls}" href="/bank">去题库选题</a>`}
  </li>
</ol>

<div class="grid">
  <section class="card">
    <header class="card-head"><h2>进度</h2><span class="muted">做过的题 / 要做的题</span></header>
    <ul class="progress">
      ${d.progress.map((p) => html`<li>
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
      ? html`<ul class="weak">${d.weak.map((w) => html`<li>
        <div>
          <b>${w.section} / ${w.kp}</b>
          <span class="muted">${d.chapterNames[w.chapter]} · ${w.nums.length} 题待巩固</span>
        </div>
        ${startForm("去巩固", "group", { cls: "btn btn-small", chapter: w.chapter, section: w.section, kp: w.kp, only: "weak" })}
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
