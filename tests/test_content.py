import json

from dgy.content import Content, load_content

from .factories import small_bank


def test_load_content_reads_manifest(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps(small_bank(), ensure_ascii=False), encoding="utf-8")
    content = load_content(tmp_path)
    assert sorted(content.questions) == [1, 2, 3, 4, 5, 6]
    assert content.questions[1].kp == "有界"
    assert content.questions[1].img.src == "q/001.webp"


def test_default_exclusions_come_from_flags():
    content = Content(small_bank())
    assert content.default_excluded() == {6}


def test_outline_groups_questions_by_section_then_kp_in_book_order():
    outline = Content(small_bank()).outline("B")
    assert [(sec, [(kp, [q.num for q in qs]) for kp, qs in kps]) for sec, kps in outline] == [
        ("导数概念", [("基本概念题", [4, 5])]),
        ("导数计算", [("隐函数求导", [6])]),
    ]


def test_chapter_lookup():
    content = Content(small_bank())
    assert content.chapter("B").name == "一元微分"
    assert [q.num for q in content.in_chapter("A")] == [1, 2, 3]
