import json

import pytest

from pipeline.build import build

pytestmark = pytest.mark.pdf


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("content")
    return out, build(out, only={1, 564, 593}, with_knowledge=False)


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
