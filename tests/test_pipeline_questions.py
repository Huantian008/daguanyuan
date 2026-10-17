import collections

import fitz
import pytest

from pipeline import chapters
from pipeline.questions import STATEMENT_FROM_SOLUTION, form_shown_whole, parse_questions, widen
from pipeline import sources

pdf = pytest.mark.pdf


@pytest.fixture(scope="module")
def questions():
    return parse_questions(sources.QUESTIONS_PDF)


@pytest.fixture(scope="module")
def doc():
    with fitz.open(sources.QUESTIONS_PDF) as d:
        yield d


def _text(doc, q) -> str:
    return doc[q.page_index].get_text("text", clip=fitz.Rect(q.rect))


@pdf
def test_finds_all_613_questions_in_order(questions):
    assert [q.num for q in questions] == list(range(1, 614))


@pdf
def test_every_question_has_a_content_rect_below_its_info_bar(questions):
    for q in questions:
        x0, y0, x1, y1 = q.rect
        assert x1 - x0 > 100 and y1 - y0 > 5, q.num


@pdf
def test_first_question_metadata(questions):
    q = questions[0]
    assert q.kp == "有界"
    assert q.orig_page == 1
    assert q.source == "2004数三"
    assert q.difficulty == pytest.approx(0.57)
    assert q.stars == 2
    assert q.minutes == 4
    assert q.page_index == 10


@pdf
def test_chapter_sizes_match_the_book(questions):
    counts = collections.Counter(chapters.chapter_of(q.num) for q in questions)
    assert counts == {"A": 117, "B": 127, "C": 154, "D": 66, "E": 60, "F": 89}


def test_chapter_of_boundaries():
    assert chapters.chapter_of(117) == "A"
    assert chapters.chapter_of(118) == "B"
    assert chapters.chapter_of(613) == "F"
    with pytest.raises(ValueError):
        chapters.chapter_of(614)


def test_widen_leaves_a_clip_alone_when_it_cuts_nothing():
    clip = fitz.Rect(50, 100, 550, 200)
    inside, below, touching = fitz.Rect(60, 110, 90, 120), fitz.Rect(60, 260, 90, 270), fitz.Rect(60, 190, 90, 200.4)
    assert widen(clip, [inside, below, touching]) == clip


def test_widen_takes_in_a_cut_box_and_pads_only_that_side():
    clip = fitz.Rect(50, 100, 550, 200)
    assert widen(clip, [fitz.Rect(60, 190, 90, 215)]) == fitz.Rect(50, 100, 550, 217)


def test_widen_keeps_going_while_the_grown_clip_cuts_more():
    clip = fitz.Rect(50, 100, 550, 200)
    ink = [fitz.Rect(60, 190, 90, 215), fitz.Rect(200, 210, 230, 240), fitz.Rect(200, 300, 230, 310)]
    assert widen(clip, ink) == fitz.Rect(50, 100, 550, 242)


@pdf
def test_only_520_has_a_clip_that_cuts_through_its_question(questions):
    assert [q.num for q in questions if q.widened_bbox] == [520]


@pdf
def test_520_shows_its_options_row(questions, doc):
    q = questions[519]
    clipped = _text(doc, q)  # the form's own BBox still clips the page
    with form_shown_whole(doc, q):
        whole = _text(doc, q)
    assert "A. vf u2" not in clipped
    for option in ("A. vf u2", "B. v", "C. vf u", "D. v"):
        assert option in whole
    assert "A. vf u2" not in _text(doc, q)  # the in-memory change is undone afterwards


@pdf
def test_statement_from_solution_only_where_the_source_page_lost_part_of_the_stem(questions, doc):
    assert STATEMENT_FROM_SOLUTION == {42, 56, 307, 329, 439}
    text = {q.num: _text(doc, q) for q in questions if q.num in STATEMENT_FROM_SOLUTION}
    assert text[329].startswith("x0,y0") and "已知曲线" not in text[329]  # first line hidden under the badge
    for n in (42, 56, 307, 439):
        assert text[n].rstrip().endswith("=") and "_" not in text[n], n  # answer blank dropped
