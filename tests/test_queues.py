import random
from datetime import date, datetime, timedelta

from dgy.content import Content
from dgy.db import Review
from dgy.queues import QueueSpec, build_queue
from dgy.srs import CardState
from dgy.studyday import TZ

from .factories import small_bank

TODAY = date(2026, 10, 16)
CONTENT = Content(small_bank())


def build(spec, cards=None, reviews=(), excluded=frozenset({6})):
    return build_queue(spec, CONTENT, cards or {}, list(reviews), set(excluded), TODAY,
                       warmup_days=3, rng=random.Random(0))


def test_group_by_chapter_in_book_order():
    title, nums = build(QueueSpec(mode="group", chapter="A"))
    assert nums == [1, 2, 3]
    assert title == "函数极限连续"


def test_group_by_kp_with_title_path():
    title, nums = build(QueueSpec(mode="group", chapter="B", section="导数概念", kp="基本概念题"))
    assert nums == [4, 5]
    assert title == "一元微分 / 导数概念 / 基本概念题"


def test_group_only_new_and_only_weak():
    cards = {1: CardState(level=3, last_grade="mastered", reps=1), 2: CardState(level=1, last_grade="unknown", reps=1)}
    assert build(QueueSpec(mode="group", chapter="A", only="new"), cards)[1] == [3]
    assert build(QueueSpec(mode="group", chapter="A", only="weak"), cards)[1] == [2]


def test_group_skips_excluded_questions():
    assert build(QueueSpec(mode="group", chapter="B"))[1] == [4, 5]


def test_due_mode():
    cards = {4: CardState(level=1, due=TODAY, last_grade="shaky", reps=1),
             5: CardState(level=3, due=TODAY + timedelta(days=3), last_grade="mastered", reps=1)}
    assert build(QueueSpec(mode="due"), cards) == ("到期复习", [4])


def test_warmup_mode():
    at = datetime(2026, 10, 15, 21, 0, tzinfo=TZ)
    reviews = [Review(2, "mastered", at, date(2026, 10, 15), "group")]
    assert build(QueueSpec(mode="warmup"), reviews=reviews) == ("热身 · 重做前几天的题", [2])


def test_single_mode_allows_an_excluded_question_on_purpose():
    assert build(QueueSpec(mode="single", nums=(6,))) == ("#006", [6])


def test_single_mode_shortens_the_title_of_a_long_list():
    assert build(QueueSpec(mode="single", nums=(1, 2, 3)))[0] == "#001、#002、#003"
    assert build(QueueSpec(mode="single", nums=(1, 2, 3, 4, 5, 6))) == ("#001 等 6 题", [1, 2, 3, 4, 5, 6])


def test_random_mode_picks_distinct_active_questions():
    _title, nums = build(QueueSpec(mode="random", count=3))
    assert len(nums) == 3 and len(set(nums)) == 3 and 6 not in nums
