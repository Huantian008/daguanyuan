"""Turn the local progress database (data/app.db) into SQL for the online D1 database.

    .venv\\Scripts\\python -m pipeline.export_progress            # writes data\\progress.sql
    cd edge && npx wrangler d1 execute dgy --remote --file=..\\data\\progress.sql

Card states, 不做 marks and settings replace the online rows for the same question or key; reviews and practice
sessions are added with new ids, so importing never clashes with what is already online.

The online database has one set of tables per account; the progress goes to the owner's account (user 1)
unless another user id is given.
"""
import sqlite3
import sys
from pathlib import Path

from . import sources

# The online schema is every migration, in name order (D1 applies them the same way).
MIGRATIONS = sorted((sources.PROJECT_ROOT / "edge" / "migrations").glob("*.sql"))
OWNER_ID = 1
DEFAULT_DB = sources.PROJECT_ROOT / "data" / "app.db"
DEFAULT_OUT = sources.PROJECT_ROOT / "data" / "progress.sql"


def _sql(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _insert(verb: str, table: str, columns: list[str], row, user_id: int) -> str:
    values = ", ".join([_sql(user_id)] + [_sql(row[c]) for c in columns])
    return f"{verb} INTO {table} (user_id, {', '.join(columns)}) VALUES ({values});"


def export_progress_sql(db_path: Path, user_id: int = OWNER_ID) -> str:
    conn = sqlite3.connect(f"file:{Path(db_path).as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        rows = lambda table: conn.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()  # noqa: E731
        lines = []
        lines += [_insert("INSERT", "sessions", ["title", "mode", "queue", "position", "created_at", "finished_at"], r, user_id)
                  for r in rows("sessions")]
        lines += [_insert("INSERT", "reviews", ["num", "grade", "reviewed_at", "study_day", "elapsed_sec", "mode"], r, user_id)
                  for r in rows("reviews")]
        lines += [_insert("INSERT OR REPLACE", "cards", ["num", "level", "due", "last_grade", "reps", "lapses"], r, user_id)
                  for r in rows("cards")]
        lines += [_insert("INSERT OR REPLACE", "exclusions", ["num", "is_excluded"], r, user_id) for r in rows("exclusions")]
        lines += [_insert("INSERT OR REPLACE", "settings", ["key", "value"], r, user_id) for r in rows("settings")]
    finally:
        conn.close()
    return "\n".join(lines) + "\n"


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DB
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    sql = export_progress_sql(source)
    target.write_text(sql, encoding="utf-8")
    counts = {verb: sql.count(f"INTO {verb} ") for verb in ("reviews", "cards", "exclusions", "sessions", "settings")}
    print(f"已写出 {target}：" + "，".join(f"{name} {n} 行" for name, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
