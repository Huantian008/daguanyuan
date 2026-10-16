from datetime import date

import pytest

from dgy.srs import CardState, schedule

TODAY = date(2026, 10, 16)


def test_first_time_mastered_jumps_to_level_3_seven_days():
    s = schedule(CardState(), "mastered", TODAY)
    assert (s.level, s.due) == (3, date(2026, 10, 23))
    assert (s.reps, s.lapses, s.last_grade) == (1, 0, "mastered")


def test_mastered_moves_up_one_level_and_caps_at_30_days():
    assert schedule(CardState(level=3, reps=1), "mastered", TODAY).due == date(2026, 10, 30)
    capped = schedule(CardState(level=5, reps=4), "mastered", TODAY)
    assert (capped.level, capped.due) == (5, date(2026, 11, 15))


def test_first_time_shaky_comes_back_tomorrow():
    s = schedule(CardState(), "shaky", TODAY)
    assert (s.level, s.due) == (1, date(2026, 10, 17))


def test_shaky_moves_down_one_level():
    s = schedule(CardState(level=4, reps=3), "shaky", TODAY)
    assert (s.level, s.due) == (3, date(2026, 10, 23))


def test_unknown_resets_to_level_1_and_counts_a_lapse():
    s = schedule(CardState(level=5, reps=6, lapses=1), "unknown", TODAY)
    assert (s.level, s.due, s.lapses, s.reps) == (1, date(2026, 10, 17), 2, 7)


def test_rejects_unknown_grade():
    with pytest.raises(ValueError):
        schedule(CardState(), "perfect", TODAY)
