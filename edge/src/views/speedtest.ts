import { html, raw } from "hono/html";
import type { Content } from "../content";
import type { Meta } from "../env";
import { layout } from "./layout";
import { contentUrl } from "./util";

/** Ten real images spread over the bank: question and first solution image of five questions. */
export function sampleImages(content: Content, meta: Meta): string[] {
  const all = content.all();
  const picks = Array.from({ length: Math.min(5, all.length) }, (_, i) => all[Math.floor((i * all.length) / 5)]);
  return picks.flatMap((q) => [contentUrl(meta, q.img.src), ...(q.solution[0] ? [contentUrl(meta, q.solution[0].src)] : [])]);
}

const SCRIPT = `
(() => {
  const images = JSON.parse(document.getElementById("speed-images").textContent);
  const rows = document.getElementById("speed-rows");
  const summary = document.getElementById("speed-summary");
  const button = document.getElementById("speed-run");
  const loadOnce = (url) => new Promise((resolve) => {
    const started = performance.now();
    const img = new Image();
    img.onload = () => resolve({ ok: true, ms: performance.now() - started });
    img.onerror = () => resolve({ ok: false, ms: performance.now() - started });
    img.src = url;
  });
  async function run() {
    button.disabled = true;
    rows.innerHTML = "";
    summary.textContent = "测试中……";
    const pings = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await fetch("/ping?nocache=" + Math.random(), { cache: "no-store" });
      pings.push(performance.now() - t);
    }
    let totalMs = 0, totalKb = 0, failed = 0;
    for (const base of images) {
      const url = base + "&nocache=" + Date.now();
      const r = await loadOnce(url);
      const entry = performance.getEntriesByName(new URL(url, location.href).href)[0];
      const kb = entry ? (entry.transferSize || entry.encodedBodySize) / 1024 : 0;
      totalMs += r.ms; totalKb += kb; if (!r.ok) failed++;
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + base.split("?")[0].replace("/content/", "") + "</td><td>" + (kb ? kb.toFixed(0) + " KB" : "—")
        + "</td><td>" + (r.ok ? r.ms.toFixed(0) + " ms" : "失败") + "</td>";
      rows.appendChild(tr);
    }
    pings.sort((a, b) => a - b);
    summary.textContent = "服务器往返（中位数）" + pings[2].toFixed(0) + " ms · 10 张图共 " + totalKb.toFixed(0) + " KB，用时 "
      + (totalMs / 1000).toFixed(1) + " 秒" + (failed ? " · " + failed + " 张失败" : "");
    button.disabled = false;
  }
  button.addEventListener("click", run);
  run();
})();`;

export const speedTestPage = (content: Content, meta: Meta) => layout(meta, {
  title: "测速",
  body: html`<header class="page-head"><h1>测速</h1></header>
<p class="note">依次下载 10 张真实题图（不走缓存），并测 5 次服务器往返时间。晚上在 Mac 或手机上打开这一页，看看速度能不能接受；正常刷题时图片会被缓存，看过的题会快很多。</p>
<section class="card">
  <p id="speed-summary" class="minor">准备中……</p>
  <table class="speed"><thead><tr><th>图片</th><th>大小</th><th>用时</th></tr></thead><tbody id="speed-rows"></tbody></table>
  <p><button class="btn btn-primary" id="speed-run">再测一次</button></p>
</section>
<script type="application/json" id="speed-images">${raw(JSON.stringify(sampleImages(content, meta)))}</script>
<script>${raw(SCRIPT)}</script>`,
});
