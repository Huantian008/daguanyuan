// 大观园：主题切换、题目字号；题卡和题目页的展开开关，题目页的快捷键；题卡评价在后台保存；知识点抽屉；知识点文字版的公式渲染。
// 页面不依赖这段脚本也能用：没有脚本时答案和知识点直接展开，评价整页提交，知识点链接打开文字版页面。
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

  // ---------- question text size: 标准 / 大 / 特大, on pages that show question text ----------

  const QSIZE_KEY = "dgy-qsize";
  const QSIZES = ["normal", "large", "xl"];
  const QSIZE_LABELS = { normal: "标准", large: "大", xl: "特大" };
  const sizeButton = document.querySelector(".js-qsize");
  if (sizeButton && document.querySelector(".qtext, .qanswer")) {
    const show = () => {
      const size = root.dataset.qsize || "xl";
      const label = `题目字号：${QSIZE_LABELS[size]}`;
      sizeButton.dataset.size = size;
      sizeButton.setAttribute("aria-label", label);
      sizeButton.title = `${label}（点按切换）`;
    };
    sizeButton.addEventListener("click", () => {
      const next = QSIZES[(QSIZES.indexOf(root.dataset.qsize || "xl") + 1) % QSIZES.length];
      if (next === "xl") delete root.dataset.qsize;
      else root.dataset.qsize = next;
      try {
        if (next === "xl") localStorage.removeItem(QSIZE_KEY);
        else localStorage.setItem(QSIZE_KEY, next);
      } catch {
        // private window or blocked storage: the choice lasts for this page only
      }
      show();
    });
    show();
    sizeButton.hidden = false;
  }

  // ---------- the question page's 「答案与解析」 toggle ----------

  const REVEAL_PEEK = 360; // px of a newly opened panel to bring into view

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
      } else if (key === "v" && sheets.length) {
        toggleView(sheets[0]);
      }
    });
  }

  // ---------- question as text or as the original image ----------

  const QVIEW_KEY = "dgy-qview";
  const setView = (sheet, mode) => {
    const view = sheet.querySelector(".qview");
    const button = sheet.querySelector(".js-qview");
    view.dataset.view = mode;
    button.textContent = mode === "text" ? "原图" : "文字";
    button.setAttribute("aria-pressed", String(mode === "image"));
  };
  const toggleView = (sheet) => {
    const view = sheet.querySelector(".qview");
    const next = view.dataset.view === "text" ? "image" : "text";
    setView(sheet, next);
    // A question with a figure always opens on its image, so switching it says nothing about the reader's preference.
    if (!("figure" in view.dataset)) {
      try {
        localStorage.setItem(QVIEW_KEY, next);
      } catch {
        // storage blocked: the choice lasts for this page only
      }
    }
  };
  const sheets = [...document.querySelectorAll(".sheet, .qcard")].filter((s) => s.querySelector(".qview") && s.querySelector(".js-qview"));
  let preferred = null;
  try {
    preferred = localStorage.getItem(QVIEW_KEY);
  } catch {
    // no stored preference
  }
  for (const sheet of sheets) {
    const view = sheet.querySelector(".qview");
    setView(sheet, !("figure" in view.dataset) && (preferred === "image" || preferred === "text") ? preferred : view.dataset.view);
    const button = sheet.querySelector(".js-qview");
    button.addEventListener("click", () => toggleView(sheet));
    button.hidden = false;
  }

  // ---------- chapter page: answer / solution folds on each question card, and the 考点 tree ----------

  document.querySelectorAll(".js-qc-toggle").forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      button.setAttribute("aria-expanded", String(open));
      if (button.dataset.label) button.textContent = `${open ? "隐藏" : "查看"}${button.dataset.label}`;
      panel.classList.toggle("is-open", open);
      if (open) renderMath(panel);
      if (panel.dataset.panel === "answer") button.closest(".qcard").classList.toggle("show-answer", open);
    });
  });

  // ---------- 考点 tree and top area on chapter pages ----------
  // The button in the chapter header opens and closes the tree. With a mouse on a wide screen the tree and the top area
  // (top bar and chapter header) each have a pin instead. Pinned, they stay where they are. Unpinned, they slide out of
  // the way and come back while the mouse is at that edge of the window (left for the tree, top for the top area) or the
  // keyboard focus is in them.

  const drill = document.querySelector(".drill");
  const mouseWide = drill && matchMedia("(hover: hover) and (pointer: fine) and (min-width: 961px)");

  // While a panel is hidden (`hidden()`), shows it when the mouse reaches one window edge and hides it again a moment
  // after the mouse moves away from it.
  const peekPanel = (parts, hidden, atEdge, near, onChange) => {
    let out = false;
    let timer = 0;
    const set = (on) => {
      clearTimeout(timer);
      timer = 0;
      if (out !== on) onChange((out = on));
    };
    document.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || !hidden()) return;
      if (atEdge(event)) set(true);
      else if (!out || near(event)) {
        clearTimeout(timer);
        timer = 0;
      } else if (!timer) {
        timer = setTimeout(() => {
          // a hidden panel keeps no focus, so a key press cannot work it unseen
          if (parts.some((part) => part.contains(document.activeElement))) document.activeElement.blur();
          set(false);
        }, 300);
      }
    }, { passive: true });
    for (const part of parts) {
      part.addEventListener("focusin", () => set(true));
      part.addEventListener("focusout", (event) => {
        if (!parts.some((p) => p.contains(event.relatedTarget))) set(false);
      });
    }
    return set;
  };

  const treeToggle = document.querySelector(".js-tree-toggle");
  const tree = document.querySelector("#kp-tree");
  const treePin = document.querySelector(".js-tree-pin");
  if (drill && treeToggle && tree && treePin) {
    // a new key: hiding the tree is now a choice made with the pin, so every tree starts out pinned
    const TREE_KEY = "dgy-tree-hidden";
    const narrow = matchMedia("(max-width: 960px)").matches;
    let closed = narrow;
    if (!narrow) {
      try {
        closed = localStorage.getItem(TREE_KEY) === "1";
      } catch {
        // storage blocked: the tree stays open
      }
    }
    const peekTree = peekPanel(
      [tree],
      () => closed && mouseWide.matches,
      (event) => event.clientX <= 16,
      (event) => event.clientX <= tree.offsetLeft + tree.offsetWidth + 24,
      (out) => drill.classList.toggle("tree-peek", out),
    );
    const show = () => {
      drill.classList.toggle("tree-closed", closed);
      treeToggle.setAttribute("aria-expanded", String(!closed));
      const label = closed ? "展开目录" : "收起目录";
      treeToggle.setAttribute("aria-label", label);
      treeToggle.title = label;
      treePin.setAttribute("aria-pressed", String(!closed));
      treePin.title = closed ? "目录自动隐藏，鼠标移到窗口左边缘时出现；点一下固定" : "目录已固定，点一下改为自动隐藏";
    };
    const flip = (keepOut) => {
      closed = !closed;
      peekTree(keepOut && closed);
      show();
      if (!narrow) {
        try {
          localStorage.setItem(TREE_KEY, closed ? "1" : "0");
        } catch {
          // the choice lasts for this page only
        }
      }
    };
    treeToggle.addEventListener("click", () => flip(false));
    // the mouse is on the pin, so an unpinned tree stays out until the mouse leaves it
    treePin.addEventListener("click", () => flip(true));
    show();
    treeToggle.hidden = false;
  }

  const topbar = document.querySelector(".topbar");
  const head = document.querySelector(".drill-head");
  const topPin = document.querySelector(".js-top-pin");
  if (drill && topbar && head && topPin) {
    const TOP_KEY = "dgy-top-pinned";
    let pinned = true;
    try {
      pinned = localStorage.getItem(TOP_KEY) !== "0";
    } catch {
      // storage blocked: the top area stays pinned
    }
    // the top area goes away only once the chapter header has stuck to the top bar
    let away = false;
    const sync = () => {
      const auto = !pinned && mouseWide.matches;
      root.classList.toggle("top-auto", auto);
      root.classList.toggle("top-away", auto && away);
    };
    const peekTop = peekPanel(
      [topbar, head],
      () => root.classList.contains("top-away"),
      (event) => event.clientY <= 24,
      (event) => event.clientY <= topbar.offsetHeight + head.offsetHeight + 24,
      (out) => root.classList.toggle("top-peek", out),
    );
    const measure = () => root.style.setProperty("--top-shift", `${topbar.offsetHeight + head.offsetHeight + 24}px`);
    const check = () => {
      const stuck = head.parentElement.getBoundingClientRect().top < topbar.offsetHeight;
      if (stuck === away) return;
      away = stuck;
      if (away) peekTop(false);
      sync();
    };
    let checking = false;
    addEventListener("scroll", () => {
      if (checking) return;
      checking = true;
      requestAnimationFrame(() => {
        checking = false;
        check();
      });
    }, { passive: true });
    const sizes = new ResizeObserver(measure);
    sizes.observe(topbar);
    sizes.observe(head);
    const show = () => {
      topPin.setAttribute("aria-pressed", String(pinned));
      topPin.title = pinned ? "顶部已固定，点一下改为自动隐藏" : "顶部自动隐藏，鼠标移到窗口上边缘时出现；点一下固定";
      sync();
    };
    topPin.addEventListener("click", () => {
      pinned = !pinned;
      try {
        localStorage.setItem(TOP_KEY, pinned ? "1" : "0");
      } catch {
        // the choice lasts for this page only
      }
      peekTop(true); // the mouse is on the pin: the top area stays until the mouse leaves it
      show();
    });
    mouseWide.addEventListener("change", sync);
    measure();
    check();
    show();
  }
  // slide only on later changes, not into the state the page opened in
  if (drill) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("pane-anim")));

  // ---------- grades on question cards: saved in the background, so the page does not reload ----------
  // A grade shows at once and goes to the server with fetch. Until the server has it, it waits in localStorage and is
  // sent again when a page loads or the network comes back, on the same study day only (later it would count for the
  // wrong day). Only one request per question is out at a time, so the grade that stays is the last one clicked.

  const PENDING_KEY = "dgy-pending-grades";
  // A study day runs 04:00 to 04:00 Shanghai time (UTC+8), so it is the UTC date four hours on.
  const studyDay = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  let pendingHere = {};
  const readPending = () => {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY)) || {};
    } catch {
      return pendingHere; // storage blocked: grades wait as long as this page is open
    }
  };
  const writePending = (pending) => {
    pendingHere = pending;
    try {
      if (Object.keys(pending).length) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      // kept in pendingHere
    }
  };
  const gradeForm = (num) => document.querySelector(`form.qc-grades[action="/q/${num}/grade"]`);

  // The counts on the page follow: 做过 X / Y on a chapter page, 今天已评 X / N on a review page.
  const countDone = () => {
    let done = 0;
    document.querySelectorAll(".js-done").forEach((count) => {
      done = Number(count.textContent) + 1;
      count.textContent = done;
    });
    document.querySelectorAll(".js-done-bar").forEach((bar) => {
      const total = Number(bar.dataset.total);
      bar.firstElementChild.style.width = `${total ? Math.round((100 * done) / total) : 0}%`;
      bar.classList.toggle("is-full", total > 0 && done >= total);
    });
  };
  const countGraded = () => {
    const graded = document.querySelectorAll(".qc-grades .is-picked").length;
    document.querySelectorAll(".js-graded").forEach((count) => {
      count.textContent = graded;
    });
    document.querySelectorAll(".js-all-graded").forEach((link) => link.classList.toggle("btn-primary", graded >= Number(link.dataset.total)));
  };
  const pick = (form, grade) => {
    form.querySelectorAll(".qc-grade").forEach((button) => button.classList.toggle("is-picked", button.value === grade));
    const card = form.closest(".qcard");
    if (card && "new" in card.dataset) {
      delete card.dataset.new;
      countDone();
    }
    countGraded();
  };
  const showUnsaved = (num, unsaved) => {
    const form = gradeForm(num);
    const note = form?.querySelector(".qc-unsaved");
    if (unsaved && form && !note) {
      const span = document.createElement("span");
      span.className = "qc-unsaved";
      span.textContent = "还没存上，联网后会自动补交";
      form.querySelector(".qc-grade").before(span);
    } else if (!unsaved) {
      note?.remove();
    }
  };

  const sending = new Set();
  const send = (num) => {
    const entry = readPending()[num];
    if (!entry || sending.has(num)) return;
    sending.add(num);
    fetch(`/q/${num}/grade`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({ grade: entry.grade, mode: entry.mode }),
      credentials: "same-origin",
      keepalive: true, // finishes even when the page is left right after the click
    })
      // anything but JSON is a failure: offline, or a login that has run out (the reply is then the login page)
      .then((res) => (res.ok && res.headers.get("content-type")?.includes("json") ? res.json() : Promise.reject(res.status)))
      .then((saved) => {
        const pending = readPending();
        if (pending[num]?.grade === entry.grade) {
          delete pending[num];
          writePending(pending);
        }
        const panel = document.getElementById(`qh-${num}`);
        if (panel) panel.innerHTML = saved.history;
        showUnsaved(num, false);
      })
      .catch(() => showUnsaved(num, true))
      .finally(() => {
        sending.delete(num);
        const latest = readPending()[num];
        if (latest && latest.grade !== entry.grade) send(num);
      });
  };
  const sendAll = () => {
    const pending = readPending();
    const today = studyDay();
    for (const num of Object.keys(pending)) {
      if (pending[num].day !== today) delete pending[num];
    }
    writePending(pending);
    Object.keys(pending).forEach(send);
  };

  document.addEventListener("submit", (event) => {
    const form = event.target;
    const button = event.submitter;
    if (!form.matches("form.qc-grades") || !button?.value) return;
    event.preventDefault();
    const num = form.getAttribute("action").split("/")[2];
    if (button.classList.contains("is-picked") && !readPending()[num]) return;
    pick(form, button.value);
    const pending = readPending();
    pending[num] = { grade: button.value, mode: form.elements.mode?.value ?? "", day: studyDay() };
    writePending(pending);
    send(num);
  });

  // Back to a page graded without reloading: a page the browser kept is as it was left, but one it shows from its
  // HTTP cache is the page as first loaded, before those grades. Load that one afresh.
  const navigation = performance.getEntriesByType("navigation")[0];
  if (document.querySelector("form.qc-grades") && navigation?.type === "back_forward" && navigation.transferSize === 0) {
    location.reload();
  } else {
    for (const [num, entry] of Object.entries(readPending())) {
      const form = gradeForm(num);
      if (form && entry.day === studyDay()) pick(form, entry.grade);
    }
    sendAll();
    addEventListener("online", sendAll);
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
