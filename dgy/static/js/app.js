// 大观园：练习页计时与快捷键；知识点文字版的公式渲染。页面不依赖这段脚本也能用。
(() => {
  const practice = document.querySelector("[data-practice]");
  if (practice) {
    const started = Date.now();
    const elapsed = () => Math.round((Date.now() - started) / 1000);
    const timer = document.querySelector(".js-timer");
    const tick = () => {
      const s = elapsed();
      timer.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    };
    if (timer) {
      tick();
      setInterval(tick, 1000);
    }
    document.querySelectorAll(".js-elapsed").forEach((input) => {
      input.form.addEventListener("submit", () => { input.value = elapsed(); });
    });

    const toggle = (selector) => {
      const details = document.querySelector(selector);
      if (details) details.open = !details.open;
    };
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target.closest("input, textarea, select, button, summary, a")) return;
      if (event.key === " ") {
        event.preventDefault();
        toggle("details.answer");
      } else if (event.key === "s" || event.key === "S") {
        toggle("details.solution");
      } else if (["1", "2", "3"].includes(event.key)) {
        document.querySelector(`button[data-key="${event.key}"]`)?.click();
      } else if (event.key === "ArrowRight") {
        document.querySelector(".js-skip")?.click();
      }
    });
  }

  if (window.katex) {
    document.querySelectorAll(".math.inline, .math.block").forEach((el) => {
      window.katex.render(el.textContent, el, {
        displayMode: el.classList.contains("block"),
        throwOnError: false,
        strict: "ignore",
      });
    });
  }
})();
