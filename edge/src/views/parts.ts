// Port of dgy/templates/_macros.html.
import { html, raw } from "hono/html";
import type { Img, Question } from "../content";
import type { Meta } from "../env";
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

export type Status = "excluded" | "new" | "mastered" | "shaky" | "unknown";

export const STATUS_LABELS: Record<Status, string> = {
  excluded: "不做", new: "未做", mastered: "完全掌握", shaky: "不熟练/错误", unknown: "完全不会",
};
