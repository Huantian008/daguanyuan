import json

import fitz
import pytest
from PIL import Image

from pipeline import sources
from pipeline.build import QUESTION_ZOOM, build

pytestmark = pytest.mark.pdf


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("content")
    return out, build(out, only={1, 564, 593}, with_knowledge=False)


@pytest.fixture(scope="module")
def fixed(tmp_path_factory):
    out = tmp_path_factory.mktemp("fixed")
    manifest = build(out, only={329, 520}, with_knowledge=False)
    return out, {q["num"]: q for q in manifest["questions"]}


def test_builds_only_the_requested_questions(built):
    _out, manifest = built
    assert [q["num"] for q in manifest["questions"]] == [1, 564, 593]


def test_question_record_has_metadata_and_images_on_disk(built):
    out, manifest = built
    q = manifest["questions"][0]
    assert (q["chapter"], q["kp"], q["section"], q["source_full"]) == ("A", "有界", "函数性质", "2004数三")
    assert q["quick_id"] == "01-001"
    assert (out / q["img"]["src"]).stat().st_size > 1000
    assert q["img"]["w"] > 300
    assert (out / q["answer"]["src"]).exists()
    assert q["solution"] and all((out / s["src"]).exists() for s in q["solution"])


def test_scope_flags(built):
    _out, manifest = built
    flags = {q["num"]: q["flags"] for q in manifest["questions"]}
    assert flags == {1: [], 564: ["仅数一"], 593: ["选做"]}


def test_manifest_written_as_utf8_json(built):
    out, _manifest = built
    data = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert data["questions"][0]["kp"] == "有界"
    assert [c["code"] for c in data["chapters"]] == ["A", "B", "C", "D", "E", "F"]


def test_question_whose_source_page_lost_a_line_uses_the_statement_from_the_solution_book(fixed):
    out, questions = fixed
    q = questions[329]
    with Image.open(out / q["img"]["src"]) as img, Image.open(out / q["solution"][0]["src"]) as statement:
        assert img.width > statement.width - 40 and img.height > statement.height - 40  # only white margins trimmed


def test_question_with_a_short_clip_is_rendered_past_it(fixed):
    out, questions = fixed
    with fitz.open(sources.QUESTIONS_PDF) as doc:
        page = doc[193]  # #520 is the third block on this page; its own BBox ends above the options row
        own_clip = [fitz.Rect(bbox) * page.transformation_matrix for _x, name, _i, bbox in page.get_xobjects() if name == "fzFrm2"]
    assert questions[520]["img"]["h"] > own_clip[0].height * QUESTION_ZOOM + 30
