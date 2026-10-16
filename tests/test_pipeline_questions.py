import collections

import pytest

from pipeline import chapters
from pipeline.questions import parse_questions
from pipeline import sources

pytestmark = pytest.mark.pdf


@pytest.fixture(scope="module")
def questions():
    return parse_questions(sources.QUESTIONS_PDF)


def test_finds_all_613_questions_in_order(questions):
    assert [q.num for q in questions] == list(range(1, 614))


def test_every_question_has_a_content_rect_below_its_info_bar(questions):
    for q in questions:
        x0, y0, x1, y1 = q.rect
        assert x1 - x0 > 100 and y1 - y0 > 5, q.num


def test_first_question_metadata(questions):
    q = questions[0]
    assert q.kp == "有界"
    assert q.orig_page == 1
    assert q.source == "2004数三"
    assert q.difficulty == pytest.approx(0.57)
    assert q.stars == 2
    assert q.minutes == 4
    assert q.page_index == 10


def test_chapter_sizes_match_the_book(questions):
    counts = collections.Counter(chapters.chapter_of(q.num) for q in questions)
    assert counts == {"A": 117, "B": 127, "C": 154, "D": 66, "E": 60, "F": 89}


def test_chapter_of_boundaries():
    assert chapters.chapter_of(117) == "A"
    assert chapters.chapter_of(118) == "B"
    assert chapters.chapter_of(613) == "F"
    with pytest.raises(ValueError):
        chapters.chapter_of(614)
