from datetime import date, datetime, timedelta

from dgy import stats
from dgy.content import Content
from dgy.db import Review
from dgy.srs import CardState
from dgy.studyday import TZ

from .factories import small_bank

TODAY = date(2026, 10, 16)


def review(num, day, grade="mastered", hour=21):
    at = datetime(day.year, day.month, day.day, hour, 0, tzinfo=TZ)
    return Review(num, grade, at, day, "kp")


def card(level, due, last_grade):
    return CardState(level=level, due=due, last_grade=last_grade, reps=1)


def test_mastery_distribution_counts_last_grades_and_new():
    cards = {1: card(3, TODAY, "mastered"), 2: card(1, TODAY, "shaky"), 3: card(1, TODAY, "unknown")}
    assert stats.mastery_distribution([1, 2, 3, 4], cards) == {"mastered": 1, "shaky": 1, "unknown": 1, "new": 1}


def test_due_queue_orders_by_due_date_and_skips_excluded_and_future():
    cards = {
        1: card(2, TODAY - timedelta(days=1), "shaky"),
        2: card(1, TODAY - timedelta(days=3), "unknown"),
        3: card(3, TODAY + timedelta(days=2), "mastered"),
        4: card(1, TODAY, "shaky"),
    }
    assert stats.due_queue(cards, active={1, 2, 3}, today=TODAY) == [2, 1]


def test_warmup_takes_questions_from_the_last_study_days_with_activity():
    reviews = [
        review(1, TODAY - timedelta(days=6)),
        review(2, TODAY - timedelta(days=4), hour=20),
        review(3, TODAY - timedelta(days=4), hour=21),
        review(4, TODAY - timedelta(days=1)),
        review(5, TODAY - timedelta(days=1)),
        review(4, TODAY),  # already redone today
    ]
    assert stats.warmup_queue(reviews, active={1, 2, 3, 4, 5}, today=TODAY, days=2) == [2, 3, 5]


def test_chapter_progress_ignores_excluded_questions():
    content = Content(small_bank())
    cards = {4: card(3, TODAY, "mastered"), 6: card(1, TODAY, "shaky")}
    progress = {p.code: (p.done, p.total) for p in stats.chapter_progress(content, cards, excluded={6})}
    assert progress["A"] == (0, 3)
    assert progress["B"] == (1, 2)


def test_weak_spots_rank_by_score_then_number_of_weak_questions():
    # score = shaky + 2 × unknown; 基本概念题 (2 shaky) ties with 0/0 (1 unknown) and has more to redo
    content = Content(small_bank())
    cards = {
        1: card(1, TODAY, "shaky"),
        3: card(1, TODAY, "unknown"),
        4: card(1, TODAY, "shaky"),
        5: card(1, TODAY, "shaky"),
    }
    spots = stats.weak_spots(content, cards, excluded=set(), top=2)
    assert [(s.section, s.kp, s.nums) for s in spots] == [
        ("导数概念", "基本概念题", [4, 5]),
        ("极限", "0/0", [3]),
    ]


def test_streak_counts_back_from_today_or_yesterday():
    days = {TODAY, TODAY - timedelta(days=1), TODAY - timedelta(days=2), TODAY - timedelta(days=5)}
    assert stats.streak(days, TODAY) == 3
    assert stats.streak(days - {TODAY}, TODAY) == 2
    assert stats.streak({TODAY - timedelta(days=3)}, TODAY) == 0


def test_daily_totals_count_distinct_questions():
    reviews = [review(1, TODAY), review(1, TODAY, hour=22), review(2, TODAY), review(3, TODAY - timedelta(days=2))]
    totals = stats.daily_totals(reviews, TODAY, days=3)
    assert [(t.day, t.count) for t in totals] == [
        (TODAY - timedelta(days=2), 1),
        (TODAY - timedelta(days=1), 0),
        (TODAY, 2),
    ]
