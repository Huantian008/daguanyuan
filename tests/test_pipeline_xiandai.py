import collections

import fitz
import pytest

from pipeline import chapters, sources
from pipeline.solutions import parse_outline
from pipeline.xiandai import pair_solutions, parse_questions, solution_regions

pdf = pytest.mark.pdf


@pytest.fixture(scope="module")
def questions():
    return parse_questions(sources.XIANDAI_QUESTIONS_PDF)


@pytest.fixture(scope="module")
def outline():
    return parse_outline(sources.XIANDAI_SOLUTIONS_PDF)


def test_chapter_of_covers_both_books_and_nothing_between():
    assert chapters.chapter_of(613) == "F"
    assert chapters.chapter_of(1001) == "L1"
    assert chapters.chapter_of(1040) == "L1" and chapters.chapter_of(1041) == "L2"
    assert chapters.chapter_of(1355) == "L6"
    for gap in (614, 1000, 1356):
        with pytest.raises(ValueError):
            chapters.chapter_of(gap)


@pdf
def test_finds_all_355_questions_in_order(questions):
    assert [q.num for q in questions] == list(range(1001, 1356))
    assert [q.book_num for q in questions] == list(range(1, 356))
    counts = collections.Counter(q.chapter for q in questions)
    assert counts == {c.code: c.last - c.first + 1 for c in chapters.XIANDAI_CHAPTERS}


@pdf
def test_question_path_comes_from_the_outline(questions):
    first, q028 = questions[0], questions[27]
    assert (first.path, first.section, first.kp, first.source) == (("具体行列式计算",), "具体行列式计算", "具体行列式计算", "2014数一二三")
    assert q028.path == ("(代数)余子式相关问题", "代数余子式求和", "部分代数余子式求和")
    assert (q028.section, q028.kp) == ("(代数)余子式相关问题", "部分代数余子式求和")


@pdf
def test_question_band_holds_the_question_and_not_the_info_bars(questions):
    with fitz.open(sources.XIANDAI_QUESTIONS_PDF) as doc:
        q = questions[146]  # #147
        text = doc[q.page_index].get_text("text", clip=fitz.Rect(q.rect))
    assert "列向量" in text and "必有非零解" in text
    assert "#147" not in text and "#148" not in text


@pdf
def test_every_question_pairs_with_its_leaf_in_the_answer_book(questions, outline):
    pairing = pair_solutions(outline, questions)
    assert sorted(pairing.matched) == list(range(1001, 1356))
    assert pairing.weak == []
    assert len(pairing.skipped) == 22 and {e.chapter for e in pairing.skipped} == {"G"}  # 数学一专项
    assert pairing.matched[1147].title == "2001数三"


@pdf
def test_solution_regions_keep_text_answers_and_drop_the_heading(questions, outline):
    pairing = pair_solutions(outline, questions)
    with fitz.open(sources.XIANDAI_SOLUTIONS_PDF) as doc:
        regions = solution_regions(doc, outline, pairing.matched[1147])
        text = " ".join(doc[p].get_text("text", clip=r) for p, r in regions)
    assert "答案（D）" in text
    assert "2001" not in text and "2002" not in text  # neither this heading nor the next question's
