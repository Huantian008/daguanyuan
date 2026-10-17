from datetime import date, datetime

import pytest

from dgy import db
from dgy.studyday import TZ

EVENING = datetime(2026, 10, 16, 22, 0, tzinfo=TZ)
AFTER_MIDNIGHT = datetime(2026, 10, 17, 1, 30, tzinfo=TZ)


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "app.db")
    db.init_db(c)
    yield c
    c.close()


def test_record_review_updates_card_and_log(conn):
    card = db.record_review(conn, 5, "shaky", EVENING, mode="kp")
    assert (card.level, card.due) == (1, date(2026, 10, 17))
    assert db.get_card(conn, 5) == card
    [entry] = db.review_log(conn)
    assert (entry.num, entry.grade, entry.study_day, entry.mode) == (5, "shaky", date(2026, 10, 16), "kp")


def test_review_after_midnight_is_logged_on_the_previous_study_day(conn):
    db.record_review(conn, 7, "mastered", AFTER_MIDNIGHT, mode="due")
    assert db.review_log(conn)[0].study_day == date(2026, 10, 16)


def test_second_review_builds_on_the_existing_card(conn):
    db.record_review(conn, 9, "mastered", EVENING, "kp")
    card = db.record_review(conn, 9, "mastered", datetime(2026, 10, 23, 21, 0, tzinfo=TZ), "due")
    assert (card.level, card.reps) == (4, 2)
    assert set(db.all_cards(conn)) == {9}


def test_review_log_since_filters_by_study_day(conn):
    db.record_review(conn, 1, "mastered", EVENING, "kp")
    db.record_review(conn, 2, "mastered", datetime(2026, 10, 18, 21, 0, tzinfo=TZ), "kp")
    assert [r.num for r in db.review_log(conn, since=date(2026, 10, 17))] == [2]


def test_exclusion_overrides_roundtrip(conn):
    db.set_excluded(conn, [1, 2], True)
    db.set_excluded(conn, [2], False)
    assert db.exclusion_overrides(conn) == {1: True, 2: False}


def test_settings_roundtrip(conn):
    assert db.get_setting(conn, "exam_date", "2026-12-19") == "2026-12-19"
    db.set_setting(conn, "exam_date", "2026-12-20")
    assert db.get_setting(conn, "exam_date", "2026-12-19") == "2026-12-20"


def test_practice_session_walks_its_queue_and_finishes(conn):
    sid = db.create_session(conn, "到期复习", "due", [3, 1, 2], EVENING)
    s = db.get_session(conn, sid)
    assert (s.queue, s.position, s.current, s.finished_at) == ([3, 1, 2], 0, 3, None)
    assert db.latest_open_session(conn).id == sid
    db.advance_session(conn, sid, EVENING)
    assert db.get_session(conn, sid).current == 1
    db.advance_session(conn, sid, EVENING)
    finished = db.advance_session(conn, sid, EVENING)
    assert finished.current is None and finished.finished_at is not None
    assert db.latest_open_session(conn) is None
