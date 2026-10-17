import json
import re

from dgy.config import PROJECT_ROOT
from dgy.markdown import render_markdown
from dgy.sections import load_links, load_sections, parse_markdown_index, parse_sections, section_bodies

MARKDOWN_DIR = PROJECT_ROOT / "knowledge-md"

SAMPLE = """# 函数、极限与连续

<!-- source: 原 PDF 第 10-12 页 -->

## 考试大纲

<!-- p.10 -->
大纲正文

## 1. 函数基础

### 1.1 有界、奇偶与周期

有界的定义

## 2. 数列极限

<!-- p.11 -->
引言

### 2.1 定义与几何意义

$|x_n-a|<\\varepsilon$

### 2.2 基本性质

<!-- p.12 -->
唯一性

#### 细节

更细的内容
"""


def test_parse_sections_keys_titles_pages_and_parents():
    sections = parse_sections("01", SAMPLE, first_page=10)
    assert [(s.key, s.level, s.title, s.pdf_page, s.page_index, s.parent) for s in sections] == [
        ("01/1", 2, "函数基础", 10, 1, None),  # no page mark inside: the last one before it
        ("01/1.1", 3, "有界、奇偶与周期", 10, 1, "01/1"),
        ("01/2", 2, "数列极限", 11, 2, None),
        ("01/2.1", 3, "定义与几何意义", 11, 2, "01/2"),
        ("01/2.2", 3, "基本性质", 12, 3, "01/2"),
    ]


def test_parse_sections_anchors_match_the_rendered_page():
    html, _toc = render_markdown(SAMPLE)
    ids = set(re.findall(r'id="([^"]+)"', html))
    assert all(s.anchor in ids for s in parse_sections("01", SAMPLE))


def test_section_bodies_stop_at_any_heading():
    bodies = section_bodies(SAMPLE)
    assert bodies["1"].strip() == ""
    assert "引言" in bodies["2"] and "定义" not in bodies["2"]
    assert "唯一性" in bodies["2.2"] and "更细" not in bodies["2.2"]


def test_parse_markdown_index_maps_files_to_page_ranges():
    text = "| 10–22 | [01 函数](./01_函数极限连续.md) | 转写 |\n| 58-59 | [07 多元](./07_多元函数微分.md) | 转写 |"
    assert parse_markdown_index(text) == [("01_函数极限连续.md", 10, 22), ("07_多元函数微分.md", 58, 59)]


def test_load_links_keeps_known_keys_in_order(tmp_path):
    (tmp_path / "01_函数极限连续.md").write_text(SAMPLE, encoding="utf-8")
    sections = load_sections(tmp_path)
    (tmp_path / "question_links.json").write_text(json.dumps(
        {"version": 1, "links": {"1": ["01/2.1", "99/1", "01/1.1"], "2": ["99/1"]}}), encoding="utf-8")
    assert load_links(tmp_path, sections) == {1: ("01/2.1", "01/1.1")}


def test_load_links_without_a_file_is_empty(tmp_path):
    assert load_links(tmp_path, {}) == {}


def test_real_knowledge_sections_resolve_to_anchors_and_pages():
    sections = load_sections(MARKDOWN_DIR)
    assert len(sections) > 150
    for slug in sorted({s.slug for s in sections.values()}):
        path = next(MARKDOWN_DIR.glob(f"{slug}_*.md"))
        ids = set(re.findall(r'id="([^"]+)"', render_markdown(path.read_text(encoding="utf-8"))[0]))
        for s in sections.values():
            if s.slug == slug:
                assert s.anchor in ids, s.key
                assert s.pdf_page and s.page_index and s.page_index >= 1, s.key


def test_real_links_file_only_uses_known_sections():
    path = MARKDOWN_DIR / "question_links.json"
    if not path.exists():
        return
    sections = load_sections(MARKDOWN_DIR)
    data = json.loads(path.read_text(encoding="utf-8"))
    for num, keys in data["links"].items():
        assert 1 <= int(num) <= 613
        assert 1 <= len(keys) <= 3 and all(k in sections for k in keys), num
