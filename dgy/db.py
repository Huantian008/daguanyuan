"""SQLite storage for the user's own data: review log, card states, "不做" overrides, settings, and the practice sets
of the one-by-one practice page, which is gone; their rows stay for the backup.

Question content is not stored here; it lives in content/manifest.json and can be rebuilt from the PDFs.
"""
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from .srs import CardState, card_from, schedule
from .studyday import TZ, study_day

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    num INTEGER NOT NULL,
    grade TEXT NOT NULL CHECK (grade IN ('mastered', 'shaky', 'unknown')),
    reviewed_at TEXT NOT NULL,
    study_day TEXT NOT NULL,
    elapsed_sec INTEGER,
    mode TEXT NOT NULL,
    session_id INTEGER
);
CREATE INDEX IF NOT EXISTS reviews_by_day ON reviews (study_day);
CREATE INDEX IF NOT EXISTS reviews_by_num ON reviews (num);

CREATE TABLE IF NOT EXISTS cards (
    num INTEGER PRIMARY KEY,
    level INTEGER NOT NULL,
    due TEXT,
    last_grade TEXT,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exclusions (
    num INTEGER PRIMARY KEY,
    is_excluded INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    queue TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


@dataclass(frozen=True)
class Review:
    num: int
    grade: str
    reviewed_at: datetime
    study_day: date
    mode: str


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.execute("PRAGMA user_version = 1")
    conn.commit()


def _card(row: sqlite3.Row) -> CardState:
    return CardState(
        level=row["level"],
        due=date.fromisoformat(row["due"]) if row["due"] else None,
        last_grade=row["last_grade"],
        reps=row["reps"],
        lapses=row["lapses"],
    )


def get_card(conn: sqlite3.Connection, num: int) -> CardState:
    row = conn.execute("SELECT * FROM cards WHERE num = ?", (num,)).fetchone()
    return _card(row) if row else CardState()


def all_cards(conn: sqlite3.Connection) -> dict[int, CardState]:
    return {row["num"]: _card(row) for row in conn.execute("SELECT * FROM cards")}


def record_review(conn: sqlite3.Connection, num: int, grade: str, at: datetime, mode: str) -> CardState:
    """Grade a question. The first grade of a study day is a new review. Grading it again that day changes that review
    instead, so a misclick is put right rather than counted twice: the card is worked out again from the days before,
    and the review keeps its time and mode. The same grade again changes nothing, so a double click is one review."""
    at = at.astimezone(TZ)
    day = study_day(at)
    history = conn.execute("SELECT id, grade, study_day FROM reviews WHERE num = ? ORDER BY reviewed_at, id", (num,)).fetchall()
    same_day = [r for r in history if r["study_day"] == day.isoformat()]
    if same_day and same_day[-1]["grade"] == grade:
        return get_card(conn, num)
    with conn:
        if same_day:
            earlier = [(r["grade"], date.fromisoformat(r["study_day"])) for r in history if r["study_day"] < day.isoformat()]
            card = schedule(card_from(earlier), grade, day)
            conn.execute("UPDATE reviews SET grade = ? WHERE id = ?", (grade, same_day[0]["id"]))
            # a double click can leave two reviews of the day; the changed one is all that stays
            conn.execute("DELETE FROM reviews WHERE num = ? AND study_day = ? AND id <> ?",
                         (num, day.isoformat(), same_day[0]["id"]))
        else:
            card = schedule(get_card(conn, num), grade, day)
            conn.execute(
                "INSERT INTO reviews (num, grade, reviewed_at, study_day, mode) VALUES (?, ?, ?, ?, ?)",
                (num, grade, at.isoformat(), day.isoformat(), mode),
            )
        conn.execute(
            "INSERT INTO cards (num, level, due, last_grade, reps, lapses) VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (num) DO UPDATE SET level = excluded.level, due = excluded.due, "
            "last_grade = excluded.last_grade, reps = excluded.reps, lapses = excluded.lapses",
            (num, card.level, card.due.isoformat(), card.last_grade, card.reps, card.lapses),
        )
    return card


def review_log(conn: sqlite3.Connection, since: date | None = None) -> list[Review]:
    sql, args = "SELECT * FROM reviews", ()
    if since is not None:
        sql, args = sql + " WHERE study_day >= ?", (since.isoformat(),)
    rows = conn.execute(sql + " ORDER BY reviewed_at, id", args)
    return [
        Review(row["num"], row["grade"], datetime.fromisoformat(row["reviewed_at"]),
               date.fromisoformat(row["study_day"]), row["mode"])
        for row in rows
    ]


def history_for(conn: sqlite3.Connection, num: int) -> list[Review]:
    return [r for r in review_log(conn) if r.num == num]


def histories_for(conn: sqlite3.Connection, nums: list[int]) -> dict[int, list[Review]]:
    """Each question's reviews, oldest first, in one query."""
    found: dict[int, list[Review]] = {num: [] for num in nums}
    if not nums:
        return found
    rows = conn.execute(f"SELECT * FROM reviews WHERE num IN ({','.join('?' * len(nums))}) ORDER BY reviewed_at, id", nums)
    for row in rows:
        found[row["num"]].append(Review(row["num"], row["grade"], datetime.fromisoformat(row["reviewed_at"]),
                                        date.fromisoformat(row["study_day"]), row["mode"]))
    return found


def graded_on(conn: sqlite3.Connection, day: date) -> dict[int, str]:
    """The grade each question got on a study day (the last one, if it was graded more than once)."""
    rows = conn.execute("SELECT num, grade FROM reviews WHERE study_day = ? ORDER BY reviewed_at, id", (day.isoformat(),))
    return {row["num"]: row["grade"] for row in rows}


def set_excluded(conn: sqlite3.Connection, nums, excluded: bool) -> None:
    with conn:
        conn.executemany(
            "INSERT INTO exclusions (num, is_excluded) VALUES (?, ?) "
            "ON CONFLICT (num) DO UPDATE SET is_excluded = excluded.is_excluded",
            [(n, int(excluded)) for n in nums],
        )


def exclusion_overrides(conn: sqlite3.Connection) -> dict[int, bool]:
    return {row["num"]: bool(row["is_excluded"]) for row in conn.execute("SELECT * FROM exclusions")}


def get_setting(conn: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    with conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
