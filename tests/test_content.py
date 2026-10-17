import json

from dgy.content import Content, load_content

from .factories import small_bank


def test_load_content_reads_manifest(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps(small_bank(), ensure_ascii=False), encoding="utf-8")
    content = load_content(tmp_path)
    assert sorted(content.questions) == [1, 2, 3, 4, 5, 6]
    assert content.questions[1].kp == "有界"
    assert content.questions[1].img.src == "q/001.webp"


def test_load_content_reads_sections_and_question_links(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps(small_bank(), ensure_ascii=False), encoding="utf-8")
    md = tmp_path / "md"
    md.mkdir()
    (md / "00_总目录.md").write_text("| 10–11 | [01 函数](./01_x.md) | 转写 |\n", encoding="utf-8")
    (md / "01_x.md").write_text("# 函数\n\n## 1. 函数基础\n\n<!-- p.10 -->\n\n### 1.1 有界\n\n## 2. 数列极限\n\n<!-- p.11 -->\n",
                                encoding="utf-8")
    (md / "question_links.json").write_text(json.dumps(
        {"version": 1, "links": {"3": ["01/2", "01/1.1"], "1": ["01/1.1"], "99": ["01/1"]}}), encoding="utf-8")
    content = load_content(tmp_path, md)
    assert [s.key for s in content.sections_for(3)] == ["01/2", "01/1.1"]
    assert content.sections_for(2) == []
    assert content.questions_for("01/1.1") == [1, 3]
    assert content.questions_on_page("01", 1) == [1, 3]
    assert content.questions_on_page("01", 2) == [3]
    assert 99 not in content.links  # not in the question bank


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
