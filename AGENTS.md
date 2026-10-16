# Repository Guidelines

## Project Structure & Module Organization

Math II practice runs on a Cloudflare Worker and offline Python fallback; progress does not synchronize.

- `dgy/`: FastAPI routes, Jinja templates, and static CSS/JavaScript.
- `pipeline/`: PDF extraction, validation, and Worker exports. Source PDFs default to the parent directory; override with `DGY_SOURCE_DIR`.
- `edge/src/`: TypeScript Worker, views, authentication, and D1 persistence; `edge/migrations/` contains numbered SQL migrations.
- `knowledge-md/`: maintained Chinese notes/diagrams; `docs/`: implementation plans.
- `tests/` and `edge/test/`: Python and Worker tests.
- `content/`, `edge/public/`, and `edge/src/generated/`: generated outputs; regenerate rather than edit. `data/` stores personal SQLite progress/backups.

## Build, Test, and Development Commands

From the repository root, run `python -m venv --system-site-packages .venv`, then `.venv\Scripts\python -m pip install -r requirements.txt`.

| Command | Purpose |
| --- | --- |
| `.venv\Scripts\python -m pipeline.build` | Extract PDFs and validate the 613-question bank. |
| `.venv\Scripts\python -m dgy --reload` | Serve at `127.0.0.1:8000` with reload. |
| `.venv\Scripts\python -m pytest` | Run Python tests. |
| `.venv\Scripts\python -m pytest -m "not pdf"` | Skip PDF-dependent tests. |
| `.venv\Scripts\python -m pipeline.export_edge` | Generate Worker assets and content modules. |

In `edge/`, install with `npm ci`; generate bindings with `npm run types`. Run `npm test` (Vitest), `npm run check` (TypeScript), and `npm run dev` (Wrangler). First copy `.dev.vars.example` to `.dev.vars`, populate secrets, and run `npx wrangler d1 migrations apply dgy --local`.

## Coding Style & Naming Conventions

Use four-space Python indentation, type hints, `snake_case` functions/modules, and `PascalCase` classes. TypeScript uses two spaces, semicolons, double quotes, and `camelCase` functions. No formatter/linter is configured; match surrounding code. Align scheduling/queue behavior across implementations. Preserve Chinese filenames, mathematical notation, and source fidelity.

## Testing Guidelines

Use pytest files named `test_*.py` and Vitest files named `*.test.ts`. Mark PDF-dependent tests with `pdf`; missing PDFs cause skips. Reuse fixtures with temporary databases and deterministic dates/randomness. Add regression tests for changed behavior, especially authentication, user isolation, and migrations. No coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow existing Conventional Commit subjects: `feat(edge): ...`, `fix: ...`, or `docs(knowledge): ...`. Keep commits focused. PRs should describe changes, link relevant issues, report validation commands/results, and include UI screenshots. Explain migration and content-regeneration steps when applicable.

## Security & Configuration

Keep secrets, PDFs, generated outputs, and progress untracked. Use `--data-dir` for development. Preserve account IDs and user-scoped D1 queries. Set `APP_PASSWORD` and `SECRET_KEY` before exposing the Python application.
