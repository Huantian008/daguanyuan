-- Each user's note on a question: at most one row per question, removed when the note is emptied.
-- user_id has no default on purpose, as in 0002: a query that forgets it fails.

CREATE TABLE notes (
    user_id INTEGER NOT NULL,
    num INTEGER NOT NULL,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, num)
);
