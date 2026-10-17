from datetime import date, datetime, timezone

from dgy.studyday import TZ, calendar_day, study_day


def test_after_midnight_still_counts_as_the_previous_evening():
    assert study_day(datetime(2026, 10, 17, 1, 30, tzinfo=TZ)) == date(2026, 10, 16)


def test_new_day_starts_at_four_am():
    assert study_day(datetime(2026, 10, 17, 3, 59, tzinfo=TZ)) == date(2026, 10, 16)
    assert study_day(datetime(2026, 10, 17, 4, 0, tzinfo=TZ)) == date(2026, 10, 17)


def test_calendar_day_turns_at_midnight_not_at_four():
    assert calendar_day(datetime(2026, 10, 16, 23, 59, tzinfo=TZ)) == date(2026, 10, 16)
    assert calendar_day(datetime(2026, 10, 17, 0, 30, tzinfo=TZ)) == date(2026, 10, 17)
    assert calendar_day(datetime(2026, 10, 17, 3, 59, tzinfo=TZ)) == date(2026, 10, 17)
    assert calendar_day(datetime(2026, 10, 16, 16, 0, tzinfo=timezone.utc)) == date(2026, 10, 17)


def test_converts_other_timezones_to_shanghai_first():
    # 18:00 UTC = 02:00 next day in Shanghai -> still the 16th's study day
    assert study_day(datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)) == date(2026, 10, 16)
