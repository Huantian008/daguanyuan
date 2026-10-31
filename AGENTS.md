# Repository Guidelines

大观园 is a 数二 (Math II) practice site built from local PDFs: 《大观严选》 for 高数 and 《线代臻选题》 for 线代 (see "Two question books" below). The same content and behavior live in two implementations, and progress does **not** sync between them:

- `edge/` — Cloudflare Worker + D1, the daily online site.
- `dgy/` — FastAPI + SQLite, the offline fallback.

Behavior changes (scheduling, review queues, drill, stats) must land in **both** implementations, each with its own tests.

## Layout

- `pipeline/` — extraction and export entrypoints:
  - `pipeline.build` (source PDFs → `content/`; it merges in the 线代 questions from `content/xiandai/`, and `--xiandai` refreshes only the 线代 part);
  - `pipeline.xiandai build` (the two 线代 PDFs → `content/xiandai/`);
  - `pipeline.validate` (check an existing `content/`: 613 高数 + 355 线代 questions);
  - `pipeline.export_edge` (`content/` + `bank-md/` + `knowledge-md/` → `edge/public/` and `edge/src/generated/`);
  - `pipeline.export_progress`;
  - inputs and checks for work done by other models (task descriptions in `docs/deepseek/`): `pipeline.transcribe_questions` / `transcribe_xiandai` (question text), `pipeline.xiandai_knowledge` (线代 mind map as text), `pipeline.link_questions` / `link_xiandai` (knowledge tags).
- `dgy/` — FastAPI app, Jinja templates, and the only copy of the front-end CSS/JS (`static/css/app.css`, `static/js/app.js`).
- `edge/` — Worker. `src/index.ts` bundles `src/generated/*.json`, pages are in `src/views/`, routes in `src/routes.ts`; numbered SQL in `migrations/`, Vitest in `test/`.
- `knowledge-md/` — maintained Chinese notes, tracked: 高数 `01`–`09` (pages in `00_总目录.md`), 线代 mind map `10`–`15` (pages in `线代总目录.md`); `question_links.json` maps both books' questions to sections.
- `bank-md/` — text stems/answers, one question per line, tracked: `questions.json` (高数) and `xiandai.json` (线代, by book number).
- `docs/` — feature plans in `docs/superpowers/plans/`, release records in `docs/releases/`, task descriptions for other models in `docs/deepseek/`, cross-platform setup in `docs/跨平台开发.md`.
- Generated and gitignored, never hand-edit: `content/`, `edge/public/`, `edge/src/generated/`, `edge/worker-configuration.d.ts`. `data/` is the real progress database.

## Commands

macOS uses `.venv/bin/python`, Windows uses `.venv\Scripts\python` (same arguments below).

```bash
python -m venv --system-site-packages .venv          # reuses globally installed PyMuPDF/Pillow
.venv/bin/python -m pip install -r requirements.txt  # Python >= 3.11
.venv/bin/python -m pipeline.build       # needs the source PDFs in the project's parent dir (DGY_SOURCE_DIR overrides)
.venv/bin/python -m pipeline.xiandai build    # 线代 PDFs → content/xiandai/; then pipeline.build (or --xiandai) merges it
.venv/bin/python -m pipeline.build --xiandai  # refresh only the 线代 questions and knowledge pages in content/
.venv/bin/python -m pipeline.validate    # verify existing content/ without rebuilding
.venv/bin/python -m pipeline.export_edge # regenerate edge/public + edge/src/generated
.venv/bin/python -m dgy --reload --data-dir <tmp>    # local site at 127.0.0.1:8000
.venv/bin/python -m pytest               # pdf-marked tests auto-skip when the PDFs are missing
.venv/bin/python -m pytest tests/test_srs.py::<case> # one test
```

```bash
cd edge
npm ci
npm test                                      # Vitest (Node 22.12+; 24 recommended); needs no generated artifacts
npx vitest run test/srs.test.ts -t "<case>"   # one test
npm run types                     # writes the gitignored worker-configuration.d.ts
npm run check                     # tsc; run pipeline.export_edge and npm run types first
npm run dev                       # wrangler dev; copy .dev.vars.example to .dev.vars and apply local migrations once
```

Neither the PDFs nor `content/`/`edge/public/` are in git — a prebuilt `content/` snapshot is provided for development, so rerun `pipeline.build` only when extraction logic or the PDFs change.

## Two question books

- **高数**: #001–#613, chapters `A`–`F`, notes `01`–`09`.
- **线代**: book numbers #001–#355, stored everywhere on the site as 1001–1355 (`XIANDAI_OFFSET` = 1000 in `dgy/bank.py`, `edge/src/content.ts`), chapters `L1`–`L6`, notes `10`–`15`. Progress tables keep plain integers, so 线代 needed no migration.
- Show a number with `qlabel` / `qshort` (`dgy/content.py`, `edge/src/content.ts`): `#001` for 高数, `线001` for 线代. Never `'%03d' % num` or `padStart`. Search terms go through `parse_label` / `parseLabel` (`线12` → 1012). Previous/next question stays inside one book (`neighbors`).
- A 线代 question has no difficulty, stars, minutes, original page, 答案速查 id or answer image: those manifest fields are `null`, and pages leave them out (the answer is text only, or 「答案见解析」 without it).
- `bank-md/xiandai.json` uses book numbers; `question_links.json` uses site numbers. `link_questions` / `link_xiandai` `--write` replace only their own book's links.
- Chapters carry a `group` (高等数学 / 线性代数); the bank page and home progress group by it.

## Keeping the two implementations in sync

| Python (`dgy/`) | Worker (`edge/src/`) |
| --- | --- |
| `srs.py`, `studyday.py`, `drill.py`, `stats.py`, `db.py` | same-named `.ts` files |
| `templates/*.html` (Jinja) | `views/*.ts` (same tags and classes) |
| `static/css/app.css`, `static/js/app.js` | copied by `export_edge`; edit only in `dgy/static/` |
| `markdown.py`, `bank.py` | pre-rendered into `generated/*.json` by `export_edge` |
| `content.py` (`qlabel`, `qshort`, `parse_label`, `neighbors`, `groups`) | `content.ts` (same names, camelCase) |

- `_theme_head.html`, `_qsize_toggle.html` and `_theme_toggle.html` must stay byte-identical to the constants in `edge/src/views/layout.ts`; `edge/test/content.test.ts` reads the Jinja files and fails on drift.
- Local SQLite has no `user_id` and no migrations (`dgy/db.py` `SCHEMA`). D1 tables all have `user_id NOT NULL` with no default, so every query must be scoped by uid; schema changes are new numbered files in `edge/migrations/` only. `edge/test/d1.ts` runs every real migration in filename order, so new migrations are tested automatically.
- Question content never enters either database; the databases store progress, card state, exclusions and settings only.
- A study day runs Shanghai 04:00 → 04:00 (`studyday.py` / `studyday.ts`); timestamps are ISO strings with `+08:00`. SRS has five levels with 1/3/7/14/30-day intervals and the ratings `mastered` / `shaky` / `unknown`.
- Grading happens only on question cards: `POST /q/<num>/grade` with `mode` = `warmup` | `due` (anything else is `browse`); a question has at most one review per study day. Grading it again that day changes that review's grade (it keeps its time and mode) and the card is replayed from the adjusted history (`card_from` / `cardFrom`), so a misclick is put right and a double click is one review; the buttons never lock. `app.js` grades in the background with `Accept: application/json`: the route then answers with the card's 做题记录 (`history_panel` / `historyPanel`) instead of a redirect, so the page does not reload, and the script updates the page's counts (`data-new`, `js-done`, `js-graded`). Requests carry the page's `owner`; grading, exclusions, settings and logout reject missing or mismatched owners. Grade forms also carry the study day; the server rejects expired submissions and the script clears yesterday's selection at 04:00 before deciding whether to submit again. Unconfirmed grades wait in account-scoped localStorage (`dgy-pending-grades:<owner>`). Network failures have a 15-second timeout, three delayed retries and a manual retry; login, account and date failures show specific recovery messages. Expired entries remain visible for the user to inspect and explicitly remove, never replaying into a new day. Legacy unscoped entries are preserved but never replayed automatically. Python locks with `BEGIN IMMEDIATE` before reading history; Worker checks a history snapshot inside an atomic D1 batch and retries conflicts, keeping the review and card consistent under concurrent requests.
- Home and review use `warmup_log` / `warmupLog` for the last N days with activity plus today's reviews, without a calendar cutoff. Worker `historiesFor` batches at most 99 question numbers plus the user id per query to stay within D1's 100-parameter limit. Chapter filters retain each card's original sequence number.

## Testing

- Python: `tests/factories.py` builds a fake content manifest (`two_books()` has both books), and `create_app(settings, clock)` injects settings and a fixed clock, so site tests need no PDFs.
- Worker: `edge/test/harness.ts` `setup()` provides a tunable `Clock`, a cookie-keeping `Client`, fake assets and an in-memory D1 (`node:sqlite`) that runs all real migrations; `edge/test/fixtures.ts` `twoBooks()` mirrors `two_books()`.
- Add regression tests for authentication, per-user isolation and migrations.
- No coverage threshold and no formatter or linter is configured; match surrounding code (Python: 4-space, type hints, `snake_case`; TS: 2-space, semicolons, double quotes, `camelCase`).

## Conventions

- Conventional Commits: `feat(edge): ...`, `fix: ...`, `docs(knowledge): ...`. Keep commits focused; PRs report validation commands/results and include screenshots for UI changes.
- Start feature work with a plan in `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`; after deploying, record acceptance in `docs/releases/YYYY-MM-DD-<topic>.md`.
- The repo is edited on both Windows and macOS: use `pathlib` (no drive letters, backslashes or `os.startfile`) and rely on the `tzdata` package, not the system timezone database.
- Preserve Chinese filenames, mathematical notation and source fidelity.

## Ask first / do not touch

- Source PDFs and the `【合集】A4版知识点` folder above the repo are read-only pipeline inputs (the 线代 question book's file name really ends in a space: `【A4紧凑】数二线代臻选题 .pdf`).
- Results from other models (in `content/xiandai/*/out/`, `content/linking/`, …) are checked first and only then written into `bank-md/` or `knowledge-md/` with the tool's `--write`; review them before writing.
- `data/` is the user's real progress. Develop with `--data-dir <tmp>`; tests must use temporary databases.
- `npx wrangler deploy` and remote migrations are releases; ask the user first. Apply remote migrations and deploy back-to-back (`npx wrangler d1 migrations apply dgy --remote`, then `npx wrangler deploy`) — old code and new schema do not mix.
- Keep secrets out of git. Set `APP_PASSWORD` and `SECRET_KEY` before exposing the Python app; account ids in `edge/wrangler.jsonc` must never change.

## More docs

- `README.md` (Chinese): day-to-day use, Cloudflare accounts, deploy/rollback, backups.
- `CLAUDE.md`: Claude Code's notes with additional architecture detail (OpenCode does not load it).
- `docs/跨平台开发.md`: Windows/macOS setup, dev material release, what must be copied by hand.
