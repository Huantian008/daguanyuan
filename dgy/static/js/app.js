// 大观园：主题切换；练习页和题目页的展开开关与快捷键；知识点抽屉；知识点文字版的公式渲染。
// 页面不依赖这段脚本也能用：没有脚本时答案和知识点直接展开，知识点链接打开文字版页面。
(() => {
  const root = document.documentElement;
  const version = document.currentScript ? new URL(document.currentScript.src, location.href).searchParams.get("v") : null;
  const staticUrl = (path) => `/static/${path}${version ? `?v=${version}` : ""}`;

  // ---------- theme: follow the system, or light / dark chosen in the top bar ----------

  const THEME_KEY = "dgy-theme";
  const THEMES = ["auto", "light", "dark"];
  const THEME_LABELS = { auto: "跟随系统", light: "浅色", dark: "深色" };
  const themeButton = document.querySelector(".js-theme");
  if (themeButton) {
    const show = () => {
      const mode = root.dataset.theme || "auto";
      const label = `主题：${THEME_LABELS[mode]}`;
      themeButton.dataset.mode = mode;
      themeButton.setAttribute("aria-label", label);
      themeButton.title = `${label}（点按切换）`;
    };
    themeButton.addEventListener("click", () => {
      const next = THEMES[(THEMES.indexOf(root.dataset.theme || "auto") + 1) % THEMES.length];
      if (next === "auto") delete root.dataset.theme;
      else root.dataset.theme = next;
      try {
        if (next === "auto") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, next);
      } catch {
        // private window or blocked storage: the choice lasts for this page only
      }
      show();
    });
    show();
    themeButton.hidden = false;
  }

  // ---------- 「答案与解析」「知识点」 toggles ----------

  const REVEAL_PEEK = 360; // px of a newly opened panel to show above the grade bar

  const toggleReveal = (id) => {
    const button = document.querySelector(`.js-reveal[aria-controls="${id}"]`);
    const panel = document.getElementById(id);
    if (!button || !panel) return;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    panel.classList.toggle("is-open", open);
    // Scroll just enough to bring the start of a panel that opened below the fold into view, keeping the question visible.
    const shortfall = open ? panel.getBoundingClientRect().top - (innerHeight - REVEAL_PEEK) : 0;
    if (shortfall > 0) scrollBy({ top: shortfall, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  document.querySelectorAll(".js-reveal").forEach((button) => {
    button.addEventListener("click", () => toggleReveal(button.getAttribute("aria-controls")));
  });

  if (document.querySelector("[data-shortcuts]")) {
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target.closest("input, textarea, select, [contenteditable], dialog")) return;
      const key = event.key.toLowerCase();
      // Space on a focused button or link presses it; leave that to the browser.
      if (key === " " && event.target.closest("button, summary, a")) return;
      if (key === " " || key === "s") {
        event.preventDefault();
        toggleReveal("answer");
      } else if (key === "k") {
        toggleReveal("knowledge");
      } else if (["1", "2", "3"].includes(key)) {
        document.querySelector(`button[data-key="${key}"]`)?.click();
      } else if (event.key === "ArrowRight") {
        document.querySelector(".js-skip")?.click();
      }
    });
  }

  // ---------- formulas ----------

  const renderMath = (scope) => {
    if (!window.katex) return;
    scope.querySelectorAll(".math.inline, .math.block").forEach((el) => {
      if (el.dataset.rendered) return;
      window.katex.render(el.textContent, el, {
        displayMode: el.classList.contains("block"),
        throwOnError: false,
        strict: "ignore",
      });
      el.dataset.rendered = "1";
    });
  };

  let katexLoading = null;
  const loadKatex = () => {
    if (window.katex) return Promise.resolve();
    katexLoading ??= new Promise((resolve, reject) => {
      const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: staticUrl("vendor/katex/katex.min.css") });
      const js = Object.assign(document.createElement("script"), { src: staticUrl("vendor/katex/katex.min.js") });
      js.onload = resolve;
      js.onerror = reject;
      document.head.append(css, js);
    });
    return katexLoading;
  };

  // ---------- knowledge drawer: a tagged section's text, without leaving the page ----------

  const chapters = new Map();
  const loadChapter = (src) => {
    if (!chapters.has(src)) {
      const page = fetch(src, { credentials: "same-origin" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => new DOMParser().parseFromString(text, "text/html"))
        .catch((error) => {
          chapters.delete(src);
          throw error;
        });
      chapters.set(src, page);
    }
    return chapters.get(src);
  };

  // A section is its heading's following siblings, up to the next heading of the same or a higher level.
  const sectionOf = (doc, anchor, base) => {
    const head = doc.getElementById(anchor);
    if (!head) return null;
    const level = Number(head.tagName.slice(1));
    const nodes = [];
    for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
      if (/^H[1-6]$/.test(el.tagName) && Number(el.tagName.slice(1)) <= level) break;
      if (el.classList.contains("section-qs")) continue;
      const copy = document.importNode(el, true);
      copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      copy.querySelectorAll("img[src]").forEach((img) => { img.src = new URL(img.getAttribute("src"), base).href; });
      copy.querySelectorAll("a[href]").forEach((a) => { a.href = new URL(a.getAttribute("href"), base).href; });
      nodes.push(copy);
    }
    return nodes;
  };

  const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  let drawer = null;
  let trigger = null;
  let opened = 0;

  const buildDrawer = () => {
    drawer = document.createElement("dialog");
    drawer.className = "drawer";
    drawer.setAttribute("aria-labelledby", "drawer-title");
    drawer.innerHTML = `<div class="drawer-inner">
      <header class="drawer-head">
        <div><p class="eyebrow drawer-chapter"></p><h2 id="drawer-title" class="drawer-title"></h2></div>
        <button type="button" class="drawer-close" aria-label="关闭">${CLOSE_ICON}</button>
      </header>
      <div class="drawer-body"><div class="prose" aria-live="polite"></div></div>
      <footer class="drawer-foot">
        <a class="btn btn-small drawer-text" target="_blank" rel="noopener">在文字版中打开</a>
        <a class="btn btn-small btn-ghost drawer-original" target="_blank" rel="noopener">看原版</a>
      </footer>
    </div>`;
    drawer.querySelector(".drawer-close").addEventListener("click", () => drawer.close());
    // A click outside the panel lands on the dialog itself (its backdrop).
    drawer.addEventListener("click", (event) => { if (event.target === drawer) drawer.close(); });
    drawer.addEventListener("close", () => { trigger?.focus(); });
    document.body.append(drawer);
  };

  const message = (text, href) => {
    const p = Object.assign(document.createElement("p"), { className: "muted", textContent: text });
    if (href) p.append(" ", Object.assign(document.createElement("a"), { href, textContent: "打开文字版", target: "_blank", rel: "noopener" }));
    return p;
  };

  const openSection = async (link) => {
    if (!drawer) buildDrawer();
    const token = ++opened;
    trigger = link;
    const body = drawer.querySelector(".prose");
    const pageLink = link.closest(".kn-link")?.querySelector(".kn-page-link");
    drawer.querySelector(".drawer-chapter").textContent = link.querySelector(".kn-chapter")?.textContent ?? "";
    drawer.querySelector(".drawer-title").textContent = link.querySelector(".kn-title")?.textContent ?? link.textContent;
    drawer.querySelector(".drawer-text").href = link.href;
    const original = drawer.querySelector(".drawer-original");
    original.href = link.dataset.original;
    original.textContent = pageLink?.textContent ?? "看原版";
    body.replaceChildren(message("正在载入……"));
    if (!drawer.open) drawer.showModal();
    drawer.querySelector(".drawer-body").scrollTop = 0;
    try {
      const base = new URL(link.dataset.src, location.href);
      const [doc] = await Promise.all([loadChapter(link.dataset.src), loadKatex().catch(() => {})]);
      if (token !== opened) return;
      const nodes = sectionOf(doc, link.dataset.anchor, base);
      if (!nodes) throw new Error("section not found");
      body.replaceChildren(...nodes);
      renderMath(body);
    } catch {
      if (token === opened) body.replaceChildren(message("没能载入这一节。", link.href));
    }
  };

  if (typeof HTMLDialogElement === "function") {
    document.addEventListener("click", (event) => {
      const link = event.target.closest(".js-kn-open");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openSection(link);
    });
    // Start fetching the chapter as soon as the pointer is on a section link.
    document.addEventListener("pointerover", (event) => {
      const link = event.target.closest?.(".js-kn-open");
      if (link) loadChapter(link.dataset.src).catch(() => {});
    });
  }

  renderMath(document);
})();
