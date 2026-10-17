// Port of dgy/templates/_macros.html.
import { html, raw } from "hono/html";
import { sectionLabel, type Img, type KnowledgeEntry, type Question, type Section } from "../content";
import type { Meta } from "../env";
import type { UserState } from "../state";
import type { Distribution } from "../stats";
import { contentUrl, pad3, stars, type Html } from "./util";

export function qmeta(q: Question): Html {
  return html`<div class="qmeta">
  <span class="qnum">#${pad3(q.num)}</span>
  <span class="qkp">${q.kp}</span>
  <span class="qsrc">${q.source_full}</span>
  <span class="qdiff" title="原书得分率 ${q.difficulty}">${stars(q.stars)}</span>
  <span class="qmins">建议 ${q.minutes} 分钟</span>
  ${q.flags.map((flag) => html`<span class="flag">${flag}</span>`)}
</div>`;
}

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

export interface StartOptions {
  cls?: string;
  chapter?: string;
  section?: string;
  kp?: string;
  only?: string;
  nums?: string;
  disabled?: boolean;
}

export const startForm = (label: string, mode: string, o: StartOptions = {}): Html => html`<form method="post" action="/practice/start" class="inline">
  <input type="hidden" name="mode" value="${mode}">${hidden("chapter", o.chapter)}${hidden("section", o.section)}${hidden("kp", o.kp)}${o.only && o.only !== "all" ? hidden("only", o.only) : ""}${hidden("nums", o.nums)}
  <button class="${o.cls ?? "btn"}"${o.disabled ? raw(" disabled") : ""}>${label}</button>
</form>`;

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

/** A 「答案与解析」/「知识点」 switch; app.js opens and closes the panel it controls. */
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

export const knowledgePanel = (q: Question, sections: Section[], knowledge: KnowledgeEntry[], titles: Record<string, string>): Html =>
  html`<p class="kn-kp">书上的考点 <b>${q.kp}</b> <span class="muted">${q.path.join(" / ")}</span></p>
${sections.length ? knLinks(sections, titles) : chapterFallback(knowledge)}`;

export const relatedKnowledge = (sections: Section[], knowledge: KnowledgeEntry[], titles: Record<string, string>): Html =>
  sections.length ? knLinks(sections, titles) : chapterFallback(knowledge);

/** The questions tagged with a knowledge section (or an original page), with a button to practise the ones still to do. */
export function sectionQuestions(nums: number[], state: UserState, label = "本节题目"): Html {
  const open = nums.filter((n) => !state.excluded.has(n));
  return html`<div class="section-qs">
  <span class="section-qs-label">${label}</span>
  <span class="chips">${nums.map((n) => html`<a class="chip chip-${state.status(n)}" href="/q/${n}">${pad3(n)}</a>`)}</span>
  ${open.length ? startForm(`练这 ${open.length} 题`, "single", { cls: "btn btn-small", nums: open.join(",") }) : ""}
</div>`;
}

export type Status = "excluded" | "new" | "mastered" | "shaky" | "unknown";

export const STATUS_LABELS: Record<Status, string> = {
  excluded: "不做", new: "未做", mastered: "完全掌握", shaky: "不熟练/错误", unknown: "完全不会",
};
