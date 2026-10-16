import pytest

from pipeline import sources
from pipeline.answers import parse_answers
from pipeline.questions import parse_questions
from pipeline.text import years

pytestmark = pytest.mark.pdf


@pytest.fixture(scope="module")
def answers():
    return parse_answers(sources.ANSWERS_PDF)


def test_maps_every_question_to_one_answer_image(answers):
    assert sorted(answers) == list(range(1, 614))
    assert all(a.xref > 0 for a in answers.values())


def test_quick_ids_follow_chapter_numbering(answers):
    assert answers[1].quick_id == "01-001"
    assert answers[117].quick_id == "01-117"
    assert answers[118].quick_id == "02-001"
    assert answers[613].quick_id == "06-089"


def test_answer_rows_cite_the_same_year_as_their_question(answers):
    questions = {q.num: q for q in parse_questions(sources.QUESTIONS_PDF)}
    disagree = [
        n for n, a in answers.items()
        if years(a.source_text) and years(questions[n].source)
        and not years(a.source_text) & years(questions[n].source)
    ]
    assert disagree == []
