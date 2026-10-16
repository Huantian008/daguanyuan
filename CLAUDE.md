# 大观园 · 给 Claude Code 的项目说明

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

## 平台注意

项目同时有 Windows 和 macOS 两份工作副本，代码本身跨平台。写代码时：

- 一律用 `pathlib`，不要出现盘符、`\\` 或 `os.startfile`。
- 虚拟环境路径不同：Windows 是 `.venv\Scripts\python.exe`，macOS 是 `.venv/bin/python`。
- `start.bat` 是 Windows 批处理；macOS 上用 `.venv/bin/python -m dgy`。
- 时区靠 `tzdata` 包（已在 `requirements-web.txt` 里），不要依赖系统时区数据库。

跨平台环境搭建和「哪些文件必须手动拷」见 `docs/跨平台开发.md`。

## 不要碰的东西

- `pipeline/`、`dgy/`、`edge/` 之外的源 PDF 和 `【合集】A4版知识点/`（在仓库的上一级目录，只读）。
- `data/`（用户的真实做题记录）在开发时用 `--data-dir` 指到临时目录，别对着真库跑测试。
- 部署（`npx wrangler deploy`）和对外的内容发布属于对外发布动作，先问用户。
