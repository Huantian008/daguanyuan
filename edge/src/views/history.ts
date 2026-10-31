// Port of dgy/templates/history.html and settings.html.
import { html } from "hono/html";
import { qlabel, type Question } from "../content";
import type { Meta } from "../env";
import { GRADE_LABELS } from "../srs";
import type { Review } from "../stats";
import { clockOf, cnDate, type Day } from "../studyday";
import { layout } from "./layout";

export interface HistoryDay {
  day: Day;
  items: Review[];
  count: number;
}

export function historyPage(meta: Meta, days: HistoryDay[], questions: Map<number, Question>) {
  return layout(meta, {
    title: "学习记录",
    nav: "history",
    body: html`<header class="page-head"><h1>学习记录</h1><span class="muted">最近 60 天，凌晨 4 点前做的题算前一天</span></header>
${days.length
    ? days.map((d) => html`<section class="card day">
  <header class="card-head"><h2>${cnDate(d.day)}</h2><span class="muted">${d.count} 题</span></header>
  <ul class="history">
    ${d.items.map((r) => html`<li>
      <span class="muted time">${clockOf(r.reviewedAt)}</span>
      <a href="/q/${r.num}"><span class="qnum">${qlabel(r.num)}</span> ${questions.get(r.num)?.kp ?? ""}</a>
      <span class="chip chip-${r.grade}">${GRADE_LABELS[r.grade]}</span>
    </li>`)}
  </ul>
</section>`)
    : html`<p class="empty">还没有做题记录。去<a href="/bank">题库</a>选一个考点开始吧。</p>`}`,
  });
}

export interface SettingsData {
  examDate: string;
  warmupDays: number;
  saved: boolean;
  builtAt: string;
  userName: string;
}

export function settingsPage(meta: Meta, d: SettingsData) {
  return layout(meta, {
    title: "设置",
    nav: "settings",
    body: html`<header class="page-head"><h1>设置</h1></header>
${d.saved ? html`<p class="note note-ok" role="status">已保存。</p>` : ""}
<form class="card form" method="post" action="/settings">
  <input type="hidden" name="owner" value="${meta.grade_owner ?? ""}">
  <label for="exam_date">考研初试日期</label>
  <input id="exam_date" name="exam_date" type="date" value="${d.examDate}" required>
  <label for="warmup_days">热身取最近几个学习日的题</label>
  <select id="warmup_days" name="warmup_days">
    ${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<option value="${n}"${n === d.warmupDays ? html` selected` : ""}>${n} 天</option>`)}
  </select>
  <button class="btn btn-primary">保存设置</button>
</form>
<section class="card">
  <h2>数据</h2>
  <ul class="plain">
    <li>学习数据存在 Cloudflare D1 数据库里，Cloudflare 会保留最近 7 天的历史，可以回溯到任一时刻。</li>
    <li><a href="/settings/export">下载全部学习数据（JSON）</a>，建议每周存一份。</li>
    <li>题库生成时间：${d.builtAt}</li>
  </ul>
  <p class="muted">当前登录：${d.userName}</p>
  <form method="post" action="/logout"><input type="hidden" name="owner" value="${meta.grade_owner ?? ""}"><button class="btn">退出登录</button></form>
</section>`,
  });
}
