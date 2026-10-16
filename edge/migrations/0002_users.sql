-- Accounts: every table now belongs to one user (see src/users.ts).
-- The rows that already exist are the owner's progress, so they all go to user 1.
--
-- SQLite cannot change a primary key in place, so each table is rebuilt: create the new one, copy, drop the old one, rename.
-- user_id has no default on purpose: a query that forgets it fails instead of quietly writing into the owner's account.

CREATE TABLE reviews_new (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    num INTEGER NOT NULL,
    grade TEXT NOT NULL CHECK (grade IN ('mastered', 'shaky', 'unknown')),
    reviewed_at TEXT NOT NULL,
    study_day TEXT NOT NULL,
    elapsed_sec INTEGER,
    mode TEXT NOT NULL,
    session_id INTEGER
);
INSERT INTO reviews_new (id, user_id, num, grade, reviewed_at, study_day, elapsed_sec, mode, session_id)
    SELECT id, 1, num, grade, reviewed_at, study_day, elapsed_sec, mode, session_id FROM reviews;
DROP TABLE reviews;
ALTER TABLE reviews_new RENAME TO reviews;
CREATE INDEX reviews_by_day ON reviews (user_id, study_day);
CREATE INDEX reviews_by_num ON reviews (user_id, num);

CREATE TABLE cards_new (
    user_id INTEGER NOT NULL,
    num INTEGER NOT NULL,
    level INTEGER NOT NULL,
    due TEXT,
    last_grade TEXT,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    PRIMARY KEY (user_id, num)
);
INSERT INTO cards_new (user_id, num, level, due, last_grade, reps, lapses)
    SELECT 1, num, level, due, last_grade, reps, lapses FROM cards;
DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;

CREATE TABLE exclusions_new (
    user_id INTEGER NOT NULL,
    num INTEGER NOT NULL,
    is_excluded INTEGER NOT NULL,
    PRIMARY KEY (user_id, num)
);
INSERT INTO exclusions_new (user_id, num, is_excluded) SELECT 1, num, is_excluded FROM exclusions;
DROP TABLE exclusions;
ALTER TABLE exclusions_new RENAME TO exclusions;

CREATE TABLE sessions_new (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    queue TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    finished_at TEXT
);
INSERT INTO sessions_new (id, user_id, title, mode, queue, position, created_at, finished_at)
    SELECT id, 1, title, mode, queue, position, created_at, finished_at FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
CREATE INDEX sessions_by_user ON sessions (user_id);

CREATE TABLE settings_new (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
INSERT INTO settings_new (user_id, key, value) SELECT 1, key, value FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
