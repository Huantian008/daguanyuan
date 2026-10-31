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
    if (open) renderMath(panel);
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
    if (next === "text") renderMath(view);
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

  const gradeOwner = document.body.dataset.gradeOwner;
  const PENDING_KEY = `dgy-pending-grades:${gradeOwner}`;
  // A study day runs 04:00 to 04:00 Shanghai time (UTC+8).
  const studyDay = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  let pageDay = document.body.dataset.studyDay || studyDay();
  let pendingHere = {};
  let storageAvailable = true;
  const readPending = () => {
    if (!gradeOwner) return {};
    if (!storageAvailable) return pendingHere;
    try {
      const stored = JSON.parse(localStorage.getItem(PENDING_KEY)) || {};
      return Object.fromEntries(Object.entries(stored).filter(([num, entry]) =>
        /^\d+$/.test(num) && entry?.owner === gradeOwner && typeof entry.id === "string"
        && ["mastered", "shaky", "unknown"].includes(entry.grade) && /^\d{4}-\d{2}-\d{2}$/.test(entry.day)));
    } catch {
      storageAvailable = false;
      return pendingHere;
    }
  };
  const writePending = (pending) => {
    if (!gradeOwner) return;
    pendingHere = pending;
    try {
      if (Object.keys(pending).length) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      storageAvailable = false;
    }
  };
  const gradeForm = (num) => document.querySelector(`form.qc-grades[action="/q/${num}/grade"]`);
  try {
    if (gradeOwner && Object.keys(JSON.parse(localStorage.getItem("dgy-pending-grades")) || {}).length) {
      const note = document.createElement("p");
      note.className = "note";
      note.setAttribute("role", "status");
      note.textContent = "有旧版本留下的未同步评价，无法确认所属账号，未自动提交。请核对做题记录后重新评价。";
      document.getElementById("main")?.prepend(note);
    }
  } catch { /* Unreadable legacy storage is never submitted. */ }

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
    document.querySelectorAll(".js-graded").forEach((count) => { count.textContent = graded; });
    document.querySelectorAll(".js-all-graded").forEach((link) => link.classList.toggle("btn-primary", graded >= Number(link.dataset.total)));
  };
  const pick = (form, grade) => {
    form.querySelectorAll(".qc-grade").forEach((button) => {
      button.classList.toggle("is-picked", button.value === grade);
      button.setAttribute("aria-pressed", String(button.value === grade));
    });
    const card = form.closest(".qcard");
    if (card && "new" in card.dataset) {
      delete card.dataset.new;
      countDone();
    }
    countGraded();
  };
  const refreshDay = () => {
    const next = studyDay();
    if (pageDay === next) return;
    pageDay = next;
    document.querySelectorAll("form.qc-grades").forEach((form) => {
      form.querySelectorAll(".qc-grade").forEach((button) => {
        button.classList.toggle("is-picked", false);
        button.setAttribute("aria-pressed", "false");
      });
      if (form.elements.day) form.elements.day.value = next;
    });
    countGraded();
  };
  const sending = new Set();
  const retries = new Map();
  const failures = new Map();
  const retryDelays = [1500, 4000, 10000];
  const cancelRetry = (num) => {
    const retry = retries.get(num);
    if (retry?.timer) clearTimeout(retry.timer);
    retries.delete(num);
  };
  const failureText = (code) => ({
    login_required: "登录已过期，评价尚未保存，请重新登录。",
    owner_mismatch: "当前登录账号已改变，评价未提交。请回到原账号后重试。",
    day_changed: "这条评价已跨学习日，尚未保存。请核对记录后重新评价。",
    rejected: "评价未保存，请刷新页面后重试。",
    retry_exhausted: "自动重试未成功，评价仍保留。请点击“立即重试”。",
  })[code] || "评价尚未保存，正在等待重试；也可以点击“立即重试”。";
  const showSaveStatus = (num, state, message) => {
    const form = gradeForm(num);
    const note = form?.querySelector(".qc-save-status");
    if (!note) return;
    form.setAttribute("aria-busy", String(state === "saving"));
    note.classList.toggle("visually-hidden", state !== "failed");
    note.classList.toggle("qc-unsaved", state === "failed");
    note.textContent = message ?? ({ saving: "正在保存评价", saved: "评价已保存", failed: failureText() })[state];
    const retry = form.querySelector(".js-grade-retry");
    if (retry) retry.hidden = state !== "failed" || readPending()[num]?.day !== studyDay()
      || ["login_required", "owner_mismatch", "day_changed"].includes(failures.get(num));
  };
  const pendingBox = document.getElementById("pending-grades");
  const renderPending = () => {
    if (!pendingBox) return;
    const entries = Object.entries(readPending());
    pendingBox.hidden = !entries.length;
    const list = pendingBox.querySelector("ul");
    list.replaceChildren();
    for (const [num, entry] of entries) {
      const expired = entry.day !== studyDay() || failures.get(num) === "day_changed";
      const row = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/q/${num}`;
      link.textContent = entry.label || "查看题目";
      const message = document.createElement("span");
      const grade = { mastered: "掌握", shaky: "不熟练", unknown: "不会" }[entry.grade];
      message.textContent = `${entry.day} · ${grade} · ${expired ? "已过期，未保存，请核对后重新评价" : sending.has(num) ? "正在保存" : failureText(failures.get(num))}`;
      row.append(link, message);
      if (expired) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-small";
        remove.textContent = "已核对，移除待处理项";
        remove.addEventListener("click", () => {
          const pending = readPending();
          if (pending[num]?.id !== entry.id) return;
          delete pending[num];
          writePending(pending);
          cancelRetry(num);
          failures.delete(num);
          showSaveStatus(num, "saved", "待处理项已移除；未补记学习记录。");
          renderPending();
        });
        row.append(remove);
      }
      list.append(row);
    }
    const login = pendingBox.querySelector(".js-sync-login");
    login.hidden = ![...failures.values()].some((code) => code === "login_required" || code === "owner_mismatch");
    login.href = `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
    pendingBox.querySelector(".js-sync-retry").hidden = !entries.some(([num, entry]) => entry.day === studyDay()
      && !["login_required", "owner_mismatch", "day_changed"].includes(failures.get(num)));
  };
  const send = async (num) => {
    const entry = readPending()[num];
    if (!entry || sending.has(num)) return;
    if (entry.day !== studyDay()) {
      cancelRetry(num);
      showSaveStatus(num, "failed", failureText("day_changed"));
      renderPending();
      return;
    }
    sending.add(num);
    showSaveStatus(num, "saving");
    renderPending();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`/q/${num}/grade`, {
        method: "POST", headers: { Accept: "application/json" },
        body: new URLSearchParams({ grade: entry.grade, mode: entry.mode, owner: gradeOwner, day: entry.day }),
        credentials: "same-origin", keepalive: true, signal: controller.signal,
      });
      const json = res.headers.get("content-type")?.includes("json");
      if (res.status === 401 || (res.ok && !json)) throw "login_required";
      if (!res.ok) {
        const detail = json ? await res.json().catch(() => ({})) : {};
        throw detail.code || (res.status === 409 ? "owner_mismatch" : res.status >= 500 || res.status === 429 ? "network" : "rejected");
      }
      const saved = await res.json();
      const pending = readPending();
      if (pending[num]?.id === entry.id) {
        delete pending[num];
        writePending(pending);
      }
      cancelRetry(num);
      failures.delete(num);
      if (!pending[num]) {
        const panel = document.getElementById(`qh-${num}`);
        if (panel) panel.innerHTML = saved.history;
        showSaveStatus(num, "saved");
      }
    } catch (error) {
      const code = entry.day !== studyDay() ? "day_changed" : typeof error === "string" ? error : "network";
      failures.set(num, code);
      showSaveStatus(num, "failed", failureText(code));
      const latest = readPending()[num];
      if (code === "network" && latest?.id === entry.id && latest.day === studyDay()) {
        const retry = retries.get(num) ?? { id: entry.id, count: 0 };
        if (retry.count < retryDelays.length) {
          retry.timer = setTimeout(() => { retry.timer = null; send(num); }, retryDelays[retry.count++]);
          retries.set(num, retry);
        } else {
          failures.set(num, "retry_exhausted");
          showSaveStatus(num, "failed", failureText("retry_exhausted"));
        }
      }
    } finally {
      clearTimeout(timeout);
      sending.delete(num);
      renderPending();
      const latest = readPending()[num];
      if (latest && latest.id !== entry.id) send(num);
    }
  };
  const sendAll = () => {
    refreshDay();
    for (const num of Object.keys(readPending())) { cancelRetry(num); send(num); }
    renderPending();
  };
  pendingBox?.querySelector(".js-sync-retry").addEventListener("click", sendAll);
  document.querySelectorAll(".js-grade-retry").forEach((button) => button.addEventListener("click", () => {
    const num = button.closest("form").getAttribute("action").split("/")[2];
    cancelRetry(num);
    send(num);
  }));
  document.addEventListener("submit", (event) => {
    const form = event.target;
    const button = event.submitter;
    if (!form.matches("form.qc-grades") || !button?.value || !gradeOwner) return;
    event.preventDefault();
    refreshDay();
    const num = form.getAttribute("action").split("/")[2];
    if (button.classList.contains("is-picked") && !readPending()[num]) return;
    pick(form, button.value);
    const pending = readPending();
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pending[num] = { grade: button.value, mode: form.elements.mode?.value ?? "", day: studyDay(), owner: gradeOwner, id, label: form.dataset.questionLabel };
    cancelRetry(num);
    failures.delete(num);
    writePending(pending);
    send(num);
  });

  const navigation = performance.getEntriesByType("navigation")[0];
  if (document.querySelector("form.qc-grades") && navigation?.type === "back_forward" && navigation.transferSize === 0) {
    location.reload();
  } else {
    refreshDay();
    for (const [num, entry] of Object.entries(readPending())) {
      const form = gradeForm(num);
      if (form && entry.day === studyDay()) pick(form, entry.grade);
    }
    sendAll();
    addEventListener("online", sendAll);
    addEventListener("focus", sendAll);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) sendAll(); });
  }

  // ---------- enlarged solution images: native scrolling on touch, drag with a mouse ----------
  if (typeof HTMLDialogElement === "function") {
    let viewer, image, stage, origin, scale = 1, baseWidth = 0, drag = null;
    const resize = () => {
      const oldWidth = image.getBoundingClientRect().width || baseWidth;
      const centerX = (stage.scrollLeft + stage.clientWidth / 2) / oldWidth;
      const centerY = (stage.scrollTop + stage.clientHeight / 2) / oldWidth;
      image.style.width = `${baseWidth * scale}px`;
      stage.scrollLeft = centerX * baseWidth * scale - stage.clientWidth / 2;
      stage.scrollTop = centerY * baseWidth * scale - stage.clientHeight / 2;
      viewer.querySelector(".zoom-value").textContent = `${Math.round(scale * 100)}%`;
      viewer.querySelector('[data-zoom="out"]').disabled = scale <= 1;
      viewer.querySelector('[data-zoom="in"]').disabled = scale >= 4;
    };
    const fit = () => {
      baseWidth = Math.min(image.naturalWidth || 1600, Math.max(1, stage.clientWidth - 24));
      scale = 1;
      resize();
      stage.scrollTop = stage.scrollLeft = 0;
    };
    const buildViewer = () => {
      viewer = document.createElement("dialog");
      viewer.className = "image-viewer";
      viewer.setAttribute("aria-label", "放大解析图片");
      viewer.innerHTML = `<div class="image-viewer-inner"><header class="image-viewer-head">
        <button type="button" class="btn btn-small" data-zoom="out" aria-label="缩小解析图片">缩小</button>
        <span class="zoom-value" role="status" aria-live="polite"></span>
        <button type="button" class="btn btn-small" data-zoom="in" aria-label="放大解析图片">放大</button>
        <button type="button" class="btn btn-small" data-zoom="fit">适合屏幕</button>
        <button type="button" class="btn btn-small zoom-close" autofocus>关闭</button>
      </header><div class="zoom-stage" tabindex="0" aria-label="解析图片，可滚动查看"><img alt="放大的解析" draggable="false"></div></div>`;
      document.body.append(viewer);
      image = viewer.querySelector("img");
      stage = viewer.querySelector(".zoom-stage");
      image.addEventListener("load", fit);
      viewer.querySelector(".zoom-close").addEventListener("click", () => viewer.close());
      viewer.addEventListener("close", () => { origin?.focus(); });
      viewer.addEventListener("click", (event) => {
        if (event.target === viewer) viewer.close();
        const action = event.target.closest("[data-zoom]")?.dataset.zoom;
        if (action === "fit") fit();
        else if (action) { scale = Math.max(1, Math.min(4, scale + (action === "in" ? 0.5 : -0.5))); resize(); }
      });
      stage.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
        stage.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      stage.addEventListener("pointermove", (event) => {
        if (!drag) return;
        stage.scrollLeft = drag.left - event.clientX + drag.x;
        stage.scrollTop = drag.top - event.clientY + drag.y;
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(name, () => { drag = null; });
      addEventListener("resize", () => { if (viewer.open) fit(); });
    };
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a.solution-zoom");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!viewer) buildViewer();
      origin = link;
      image.src = link.href;
      if (!viewer.open) viewer.showModal();
      fit();
    });
  }

  // ---------- formulas ----------

  function renderMath(scope, { skipCards = false, includeHidden = false } = {}) {
    if (!window.katex) return;
    scope.querySelectorAll(".math.inline, .math.block").forEach((el) => {
      if (el.dataset.rendered) return;
      if (skipCards && el.closest(".qcard")) return;
      if (!includeHidden && el.closest('.qc-panel:not(.is-open), .reveal-panel:not(.is-open), .qview[data-view="image"] .qtext, details:not([open])')) return;
      window.katex.render(el.textContent, el, {
        displayMode: el.classList.contains("block"),
        throwOnError: false,
        strict: "ignore",
      });
      el.dataset.rendered = "1";
    });
  }

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

  // Render only visible/nearby question cards. Answers and image-mode text render when explicitly opened.
  const cards = [...document.querySelectorAll(".qcard")];
  if (cards.length && typeof IntersectionObserver === "function") {
    renderMath(document, { skipCards: true });
    const nearby = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.bottom >= -400 && rect.top <= innerHeight + 400;
    });
    nearby.forEach((card) => renderMath(card));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        renderMath(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "400px" });
    cards.forEach((card) => observer.observe(card));
  } else {
    renderMath(document);
  }
  document.addEventListener("toggle", (event) => {
    if (event.target.matches("details[open]")) renderMath(event.target);
  }, true);
  addEventListener("beforeprint", () => renderMath(document, { includeHidden: true }));
})();
