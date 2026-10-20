from datetime import date, datetime

import pytest

from dgy import db
from dgy.srs import CardState, schedule
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


def test_grading_again_the_same_study_day_changes_that_days_grade(conn):
    db.record_review(conn, 5, "mastered", EVENING, "warmup")
    card = db.record_review(conn, 5, "unknown", AFTER_MIDNIGHT, "browse")
    # as if it had been graded unknown in the first place: one review, no extra level jump
    assert card == schedule(CardState(), "unknown", date(2026, 10, 16))
    assert db.get_card(conn, 5) == card
    # the review keeps its time and the page it was first graded on
    [entry] = db.review_log(conn)
    assert (entry.grade, entry.study_day, entry.mode, entry.reviewed_at) == ("unknown", date(2026, 10, 16), "warmup", EVENING)


def test_a_changed_grade_is_worked_out_from_the_days_before(conn):
    db.record_review(conn, 9, "mastered", EVENING, "browse")
    db.record_review(conn, 9, "shaky", datetime(2026, 10, 23, 21, 0, tzinfo=TZ), "due")
    card = db.record_review(conn, 9, "mastered", datetime(2026, 10, 23, 21, 5, tzinfo=TZ), "due")
    assert (card.level, card.due, card.reps, card.lapses, card.last_grade) == (4, date(2026, 11, 6), 2, 0, "mastered")
    assert [r.grade for r in db.history_for(conn, 9)] == ["mastered", "mastered"]


def test_the_same_grade_again_changes_nothing(conn):
    first = db.record_review(conn, 5, "mastered", EVENING, "browse")
    assert db.record_review(conn, 5, "mastered", AFTER_MIDNIGHT, "due") == first
    assert [(r.grade, r.mode) for r in db.review_log(conn)] == [("mastered", "browse")]


def test_a_doubled_review_of_the_day_is_folded_into_one_when_the_grade_changes(conn):
    # the two requests of a double click can both get in before either has written
    with conn:
        for _ in range(2):
            conn.execute("INSERT INTO reviews (num, grade, reviewed_at, study_day, mode) "
                         "VALUES (5, 'mastered', ?, '2026-10-16', 'browse')", (EVENING.isoformat(),))
    card = db.record_review(conn, 5, "shaky", AFTER_MIDNIGHT, "browse")
    assert card == schedule(CardState(), "shaky", date(2026, 10, 16))
    assert [r.grade for r in db.history_for(conn, 5)] == ["shaky"]


def test_a_first_grade_sent_twice_at_once_is_one_review(conn, monkeypatch):
    # the page script sends a grade again when it never heard back; here the other request writes after this one has
    # read the reviews of the day and before it writes
    def racing(state, grade, day):
        monkeypatch.setattr(db, "schedule", schedule)
        db.record_review(conn, 5, grade, EVENING, "warmup")
        return schedule(state, grade, day)
    monkeypatch.setattr(db, "schedule", racing)
    card = db.record_review(conn, 5, "mastered", EVENING, "warmup")
    assert card == db.get_card(conn, 5) == schedule(CardState(), "mastered", date(2026, 10, 16))
    assert [(r.grade, r.mode) for r in db.review_log(conn)] == [("mastered", "warmup")]


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
