import fitz
import pytest

from pipeline import sources
from pipeline.questions import parse_questions
from pipeline.solutions import align, parse_outline, solution_images

pytestmark = pytest.mark.pdf


@pytest.fixture(scope="module")
def outline():
    return parse_outline(sources.SOLUTIONS_PDF)


@pytest.fixture(scope="module")
def alignment(outline):
    return align(outline, parse_questions(sources.QUESTIONS_PDF))


def test_outline_has_619_leaves_in_the_six_shu_er_chapters(outline):
    leaves = [e for e in outline if e.is_leaf and e.chapter in ("A", "B", "C", "D", "E", "F")]
    assert len(leaves) == 619


def test_every_question_gets_a_solution(alignment):
    assert sorted(alignment.matched) == list(range(1, 614))


def test_skips_exactly_the_six_non_shu_er_entries(alignment):
    skipped = sorted((e.chapter, e.title) for e in alignment.skipped)
    assert skipped == sorted([
        ("D", "2021数一（仅数学一）"),
        ("D", "2024数一（仅数学一）"),
        ("F", "1994数一; 26版🐙1000第十五章强化51"),
        ("F", "1997数三"),
        ("F", "2018数三"),
        ("F", "2021数三"),
    ])


def test_tricky_questions_match_the_right_entry(alignment):
    title = {n: e.title for n, e in alignment.matched.items()}
    assert title[1] == "2004数三"
    assert title[17] == "2025数一"
    assert title[340] == "🐙早年1000; 880第三章基础解答22"
    assert title[564] == "2021数一（仅数学一）"
    assert title[613] == "2015数二"


def test_outline_path_gives_section_and_subsection(alignment):
    assert alignment.matched[1].path[:2] == ("函数性质", "有界")
    assert alignment.matched[275].path[:2] == ("积分计算", "两函数相乘")


def test_every_solution_has_one_to_five_images(outline, alignment):
    with fitz.open(sources.SOLUTIONS_PDF) as doc:
        counts = [len(solution_images(doc, outline, alignment.matched[n])) for n in range(1, 614)]
    assert min(counts) >= 1
    assert max(counts) <= 5
