// Migration 0002 puts every table under a user. It runs once, on the live database that already holds the owner's progress.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

/** A database as it is online today: schema 0001 with some of the owner's progress in every table. */
function liveDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration("0001_init.sql"));
  sqlite.exec(`
    INSERT INTO sessions (id, title, mode, queue, position, created_at, finished_at)
      VALUES (7, '到期复习', 'due', '[5,6]', 1, '2026-10-16T21:00:00+08:00', NULL);
    INSERT INTO reviews (id, num, grade, reviewed_at, study_day, elapsed_sec, mode, session_id) VALUES
      (11, 5, 'shaky', '2026-10-16T21:00:00+08:00', '2026-10-16', 300, 'due', 7),
      (12, 5, 'mastered', '2026-10-17T21:00:00+08:00', '2026-10-17', NULL, 'kp', NULL);
    INSERT INTO cards (num, level, due, last_grade, reps, lapses) VALUES (5, 2, '2026-10-19', 'mastered', 2, 0);
    INSERT INTO exclusions (num, is_excluded) VALUES (6, 1);
    INSERT INTO settings (key, value) VALUES ('exam_date', '2026-12-20');
  `);
  return sqlite;
}

function migrated() {
  const sqlite = liveDatabase();
  sqlite.exec(migration("0002_users.sql"));
  return sqlite;
}

const rows = (sqlite: DatabaseSync, sql: string) => sqlite.prepare(sql).all().map((row) => ({ ...row }));

describe("migration 0002: accounts", () => {
  it("gives the progress that already exists to user 1 and changes nothing else", () => {
    const sqlite = migrated();
    expect(rows(sqlite, "SELECT id, user_id, num, grade, elapsed_sec, session_id FROM reviews ORDER BY id")).toEqual([
      { id: 11, user_id: 1, num: 5, grade: "shaky", elapsed_sec: 300, session_id: 7 },
      { id: 12, user_id: 1, num: 5, grade: "mastered", elapsed_sec: null, session_id: null },
    ]);
    expect(rows(sqlite, "SELECT * FROM cards")).toEqual([
      { user_id: 1, num: 5, level: 2, due: "2026-10-19", last_grade: "mastered", reps: 2, lapses: 0 }]);
    expect(rows(sqlite, "SELECT * FROM exclusions")).toEqual([{ user_id: 1, num: 6, is_excluded: 1 }]);
    expect(rows(sqlite, "SELECT * FROM settings")).toEqual([{ user_id: 1, key: "exam_date", value: "2026-12-20" }]);
    expect(rows(sqlite, "SELECT id, user_id, title, queue, position, finished_at FROM sessions")).toEqual([
      { id: 7, user_id: 1, title: "到期复习", queue: "[5,6]", position: 1, finished_at: null }]);
  });

  it("lets another user have the same question, setting and exclusion, but not the same twice", () => {
    const sqlite = migrated();
    sqlite.exec(`
      INSERT INTO cards (user_id, num, level, due, last_grade, reps, lapses) VALUES (2, 5, 1, NULL, 'unknown', 1, 1);
      INSERT INTO exclusions (user_id, num, is_excluded) VALUES (2, 6, 0);
      INSERT INTO settings (user_id, key, value) VALUES (2, 'exam_date', '2026-12-19');
    `);
    expect(rows(sqlite, "SELECT COUNT(*) AS n FROM cards")).toEqual([{ n: 2 }]);
    expect(() => sqlite.exec("INSERT INTO cards (user_id, num, level, reps, lapses) VALUES (1, 5, 1, 1, 1)")).toThrow(/UNIQUE/i);
    expect(() => sqlite.exec("INSERT INTO exclusions (user_id, num, is_excluded) VALUES (1, 6, 1)")).toThrow(/UNIQUE/i);
    expect(() => sqlite.exec("INSERT INTO settings (user_id, key, value) VALUES (1, 'exam_date', 'x')")).toThrow(/UNIQUE/i);
  });

  it("refuses rows that do not say whose they are", () => {
    const sqlite = migrated();
    expect(() => sqlite.exec("INSERT INTO exclusions (num, is_excluded) VALUES (9, 1)")).toThrow(/NOT NULL/i);
    expect(() => sqlite.exec(
      "INSERT INTO reviews (num, grade, reviewed_at, study_day, mode) VALUES (1, 'shaky', 'x', '2026-10-16', 'kp')")).toThrow(/NOT NULL/i);
  });

  it("keeps handing out new ids after the old ones", () => {
    const sqlite = migrated();
    sqlite.exec("INSERT INTO sessions (user_id, title, mode, queue, created_at) VALUES (2, 't', 'due', '[]', 'x')");
    expect(rows(sqlite, "SELECT MAX(id) AS id FROM sessions")).toEqual([{ id: 8 }]);
  });

  it("indexes the lookups every page makes", () => {
    const sqlite = migrated();
    const indexes = rows(sqlite, "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    expect(indexes.map((i) => i.name)).toEqual(["reviews_by_day", "reviews_by_num", "sessions_by_user"]);
  });
});

describe("migration 0003: notes", () => {
  it("adds the table and leaves the progress alone", () => {
    const sqlite = migrated();
    const before = rows(sqlite, "SELECT * FROM reviews ORDER BY id");
    sqlite.exec(migration("0003_notes.sql"));
    expect(rows(sqlite, "SELECT * FROM reviews ORDER BY id")).toEqual(before);
    expect(rows(sqlite, "SELECT COUNT(*) AS n FROM notes")).toEqual([{ n: 0 }]);
  });

  it("gives each user one note per question, and no note without a user", () => {
    const sqlite = migrated();
    sqlite.exec(migration("0003_notes.sql"));
    sqlite.exec("INSERT INTO notes (user_id, num, body, updated_at) VALUES (1, 5, 'a', 'x'), (2, 5, 'b', 'x')");
    expect(() => sqlite.exec("INSERT INTO notes (user_id, num, body, updated_at) VALUES (1, 5, 'c', 'x')")).toThrow();
    expect(() => sqlite.exec("INSERT INTO notes (num, body, updated_at) VALUES (6, 'd', 'x')")).toThrow();
  });
});
