"""SQLite storage for the user's own data: review log, card states, "不做" overrides, practice sessions, settings.

Question content is not stored here; it lives in content/manifest.json and can be rebuilt from the PDFs.
"""
import json
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from .srs import CardState, schedule
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


@dataclass(frozen=True)
class PracticeSession:
    id: int
    title: str
    mode: str
    queue: list[int]
    position: int
    created_at: datetime
    finished_at: datetime | None

    @property
    def current(self) -> int | None:
        return self.queue[self.position] if self.position < len(self.queue) else None


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


def record_review(conn: sqlite3.Connection, num: int, grade: str, at: datetime,
                  mode: str, session_id: int | None = None) -> CardState:
    at = at.astimezone(TZ)
    day = study_day(at)
    card = schedule(get_card(conn, num), grade, day)
    with conn:
        conn.execute(
            "INSERT INTO reviews (num, grade, reviewed_at, study_day, mode, session_id) VALUES (?, ?, ?, ?, ?, ?)",
            (num, grade, at.isoformat(), day.isoformat(), mode, session_id),
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


def session_grades(conn: sqlite3.Connection, sid: int) -> dict[str, int]:
    rows = conn.execute("SELECT grade, COUNT(*) AS n FROM reviews WHERE session_id = ? GROUP BY grade", (sid,))
    return {row["grade"]: row["n"] for row in rows}


def history_for(conn: sqlite3.Connection, num: int) -> list[Review]:
    return [r for r in review_log(conn) if r.num == num]


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


def _session(row: sqlite3.Row) -> PracticeSession:
    return PracticeSession(
        id=row["id"],
        title=row["title"],
        mode=row["mode"],
        queue=json.loads(row["queue"]),
        position=row["position"],
        created_at=datetime.fromisoformat(row["created_at"]),
        finished_at=datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None,
    )


def create_session(conn: sqlite3.Connection, title: str, mode: str, queue: list[int], at: datetime) -> int:
    stamp = at.astimezone(TZ).isoformat()
    with conn:
        cur = conn.execute(
            "INSERT INTO sessions (title, mode, queue, position, created_at, finished_at) VALUES (?, ?, ?, 0, ?, ?)",
            (title, mode, json.dumps(queue), stamp, None if queue else stamp),
        )
    return cur.lastrowid


def get_session(conn: sqlite3.Connection, sid: int) -> PracticeSession | None:
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    return _session(row) if row else None


def advance_session(conn: sqlite3.Connection, sid: int, at: datetime) -> PracticeSession:
    session = get_session(conn, sid)
    position = min(session.position + 1, len(session.queue))
    finished = at.astimezone(TZ).isoformat() if position >= len(session.queue) else None
    with conn:
        conn.execute(
            "UPDATE sessions SET position = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ?",
            (position, finished, sid),
        )
    return get_session(conn, sid)


def latest_open_session(conn: sqlite3.Connection) -> PracticeSession | None:
    row = conn.execute("SELECT * FROM sessions WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1").fetchone()
    return _session(row) if row else None
