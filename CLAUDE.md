# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 大观园 · 给 Claude Code 的项目说明

@AGENTS.md

上面通过 `@AGENTS.md` 引入了仓库的完整规范（目录结构、构建与测试命令、代码风格、提交规范、安全规则）。
**那是**本仓库唯一的说明来源，Codex 和其他 AI 工具读的也是同一个文件。不要在这里复制它的内容，
要改规范请直接改 `AGENTS.md`，两边自动一致。

下面是 Claude Code 额外需要知道的、`AGENTS.md` 里没写的部分。

## 这个项目是什么

用户的考研数学二刷题站（2027 考研，2026 年 12 月 19 日初试）。题目、答案、解析都从用户本机的
《大观严选》PDF 提取，不依赖外网。同一套内容有两份实现：

| 实现 | 位置 | 何时用 |
|---|---|---|
| 线上版 | `edge/`（Cloudflare Worker + D1） | 日常主力，地址 <https://math.leadertestofcn.site> |
| 本机版 | `dgy/`（FastAPI + SQLite） | 断网时的备用 |

**两边进度不自动同步**，改了调度、队列、SRS 等行为要**同时改两份**并各自跑测试。

## 架构要点

**内容流水线**：上一级目录的 PDF（可用 `DGY_SOURCE_DIR` 改）→ `pipeline.build` → `content/manifest.json` 和
`content/{q,a,s,k}/*.webp`（题面、答案、解析各 613 份，由 `pipeline.validate` 校验）→ `pipeline.export_edge` →
`edge/public/`（题库图片、`dgy/static/` 的副本、知识点示意图）和 `edge/src/generated/`（题库 manifest、预渲染成 HTML
的知识点、`meta.json` 里的 URL 版本号）。Worker 打包时把 generated 里的 JSON 编进去，所以题库、知识点、CSS/JS
改了之后都要重新 export 才会上线。题目内容从不进数据库，两边的数据库只存做题进度。

**逐题知识点标注**：`dgy/sections.py` 把文字版带编号的 h2/h3 解析成小节（key 如 `01/7.3`，含页面 anchor 和原版页序号），
`knowledge-md/question_links.json` 记每题 1–3 个小节 key（进 git）。export 时两者写进 `edge/src/generated/sections.json`。
标注本身交给 DeepSeek，任务说明在 `docs/deepseek/题目知识点标注.md`；`python -m pipeline.link_questions check --write`
校验通过才写入。文件缺失时页面退回整章链接。

**题目文字版**（网站尚未接入）：题干和答案速查由能看图的模型从图片转成 Markdown + LaTeX，任务说明在
`docs/deepseek/题目转LaTeX.md`。`python -m pipeline.transcribe_questions check --write` 校验通过后写入
`bank-md/questions.json`（进 git，一题一行）；校验会用 Node 跑 `pipeline/katex_check.mjs`，拿仓库自带的 KaTeX 编译每一段公式。
解析仍是图片。原书或答案速查印错的题，`answer` 存验算过的正确答案，`erratum` 写明原来印的是什么（审核时人工加，目前 21 题）。

**Python 与 Worker 的对应关系**（行为改动两边都改、都测）：

| Python（`dgy/`） | Worker（`edge/src/`） |
|---|---|
| `srs.py`、`studyday.py`、`queues.py`、`stats.py`、`db.py` | 同名 `.ts` |
| `templates/*.html`（Jinja） | `views/*.ts`（同样的标签和 class） |
| `static/css/app.css`、`static/js/app.js` | 不另写，export 时原样拷到 `edge/public/static/` |
| `markdown.py`（知识点 Markdown 渲染） | 不另写，读 export 生成的 `generated/knowledge.json` |
| `templates/_theme_head.html`、`_theme_toggle.html` | `views/layout.ts` 里的两个常量，`edge/test/content.test.ts` 检查两边逐字一致 |

所以前端样式和脚本只改 `dgy/static/` 一处；页面结构要改 Jinja 模板和 TS 视图两处。颜色全部是 `app.css` 里 `:root`
的变量，深色模式在同一文件里重新定义；知识点抽屉、展开开关和快捷键都在 `app.js`，不新增服务端接口。

**两边的数据模型不一样**：

- 本机版只有一个人用：表结构是 `dgy/db.py` 里的 `SCHEMA`（`CREATE TABLE IF NOT EXISTS`），没有迁移，也没有 `user_id`。
- 线上版多账号：表结构改动只能加 `edge/migrations/` 里的新编号文件；每张表都有 `user_id NOT NULL`，且**故意没有默认值**，
  每条 D1 查询都要带 uid。账号在 `wrangler.jsonc` 的 `vars.USERS` 里（解析见 `edge/src/users.ts`），`id` 建好后不能改。

**日期和调度**：一个「学习日」是上海时间 04:00 到次日 04:00（`study_day()` / `studyDay()`，TS 端直接按 UTC+8 算）。
两边都把时间存成带 `+08:00` 的 ISO 字符串。SRS 五级，间隔 1/3/7/14/30 天，自评只有 `mastered` / `shaky` / `unknown`。

**测试替身**：

- Python：`create_app(settings, clock)` 可注入设置和时钟；`tests/factories.py` 提供假 manifest，网站测试不需要 PDF。
- Worker：`edge/test/harness.ts` 的 `setup()` 给出可拨的 `Clock`、会存 cookie 的 `Client`、假的静态资源和内存 D1。
  内存 D1（`edge/test/d1.ts`）基于 `node:sqlite`，按文件名顺序执行**全部真实迁移**，新加的迁移文件会自动被测到。

## 跑单个测试与前置条件

```bash
.venv/bin/python -m pytest tests/test_srs.py::<测试名>
cd edge && npx vitest run test/srs.test.ts -t "<测试名>"
```

`npm run check` 依赖两样 git 忽略的生成物：`edge/worker-configuration.d.ts`（`npm run types`）和
`edge/src/generated/*.json`（`pipeline.export_edge`，它又需要 `content/`）。新的工作副本要先 export、再 `npm run types`，
然后才能类型检查和部署。Vitest 不依赖这两样。

## 改功能的惯例

先在 `docs/superpowers/plans/YYYY-MM-DD-<主题>.md` 写计划，再用 `feat` / `fix` 提交实现；部署后在
`docs/releases/YYYY-MM-DD-<主题>.md` 记下发布和验收（两边测试数量、Worker 版本号、浏览器检查）。

## 平台注意

项目同时有 Windows 和 macOS 两份工作副本，代码本身跨平台。写代码时：

- 一律用 `pathlib`，不要出现盘符、`\\` 或 `os.startfile`。
- 虚拟环境路径不同：Windows 是 `.venv\Scripts\python.exe`，macOS 是 `.venv/bin/python`（`AGENTS.md` 里的命令是 Windows 写法）。
- `start.bat` 是 Windows 批处理；macOS 上用 `.venv/bin/python -m dgy`。
- 时区靠 `tzdata` 包（已在 `requirements-web.txt` 里），不要依赖系统时区数据库。

跨平台环境搭建和「哪些文件必须手动拷」见 `docs/跨平台开发.md`。

## 不要碰的东西

- 仓库上一级目录里的源 PDF 和 `【合集】A4版知识点/`：只读，pipeline 只从那里读取。
- `data/`（用户的真实做题记录）在开发时用 `--data-dir` 指到临时目录，别对着真库跑测试。
- 部署（`npx wrangler deploy`）和对外的内容发布属于对外发布动作，先问用户。
