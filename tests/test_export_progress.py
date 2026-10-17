import sqlite3
from datetime import datetime

from dgy import db
from dgy.studyday import TZ
from pipeline.export_progress import MIGRATIONS, export_progress_sql

EVENING = datetime(2026, 10, 16, 22, 0, tzinfo=TZ)


def _local_db(path):
    conn = db.connect(path)
    db.init_db(conn)
    sid = db.create_session(conn, "到期复习", "due", [5, 6], EVENING)
    db.record_review(conn, 5, "shaky", EVENING, mode="due", session_id=sid)
    with conn:  # reviews from before the timer was removed still carry their time; it is copied as is
        conn.execute("UPDATE reviews SET elapsed_sec = 300")
    db.set_excluded(conn, [7], True)
    db.set_setting(conn, "exam_date", "2026-12-19")
    db.set_setting(conn, "note", "it's fine")
    conn.close()


def _apply(sql):
    """The online schema is every migration in order, as D1 has it."""
    target = sqlite3.connect(":memory:")
    for migration in MIGRATIONS:
        target.executescript(migration.read_text(encoding="utf-8"))
    target.executescript(sql)
    return target


def test_exported_sql_recreates_progress_in_a_fresh_d1_schema(tmp_path):
    _local_db(tmp_path / "app.db")
    target = _apply(export_progress_sql(tmp_path / "app.db"))
    assert target.execute("SELECT num, grade, study_day, elapsed_sec, mode FROM reviews").fetchall() == [
        (5, "shaky", "2026-10-16", 300, "due")]
    assert target.execute("SELECT num, level, due, last_grade, reps FROM cards").fetchall() == [
        (5, 1, "2026-10-17", "shaky", 1)]
    assert target.execute("SELECT num, is_excluded FROM exclusions").fetchall() == [(7, 1)]
    assert dict(target.execute("SELECT key, value FROM settings").fetchall()) == {
        "exam_date": "2026-12-19", "note": "it's fine"}
    assert target.execute("SELECT title, queue FROM sessions").fetchall() == [("到期复习", "[5, 6]")]


def test_progress_goes_to_the_owner_account_by_default(tmp_path):
    _local_db(tmp_path / "app.db")
    target = _apply(export_progress_sql(tmp_path / "app.db"))
    for table in ("reviews", "cards", "exclusions", "sessions", "settings"):
        assert target.execute(f"SELECT DISTINCT user_id FROM {table}").fetchall() == [(1,)], table


def test_progress_can_be_imported_into_another_account_without_touching_the_owner(tmp_path):
    _local_db(tmp_path / "app.db")
    target = _apply(export_progress_sql(tmp_path / "app.db"))
    target.executescript(export_progress_sql(tmp_path / "app.db", user_id=2))
    assert target.execute("SELECT user_id, COUNT(*) FROM cards GROUP BY user_id ORDER BY user_id").fetchall() == [
        (1, 1), (2, 1)]
    assert target.execute("SELECT user_id, COUNT(*) FROM reviews GROUP BY user_id ORDER BY user_id").fetchall() == [
        (1, 1), (2, 1)]


def test_import_does_not_clash_with_rows_already_online(tmp_path):
    _local_db(tmp_path / "app.db")
    sql = export_progress_sql(tmp_path / "app.db")
    target = _apply(sql)
    target.executescript(sql)  # importing twice must not fail on primary keys
    assert target.execute("SELECT COUNT(*) FROM cards").fetchone() == (1,)
    assert target.execute("SELECT COUNT(*) FROM reviews").fetchone() == (2,)
