-- Same tables as the local Python version (dgy/db.py), so progress can move between the two.
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
