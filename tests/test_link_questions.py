import json

from dgy.sections import Section
from pipeline import link_questions as lq


def section(key, level=3, parent=None, title="标题"):
    slug, number = key.split("/")
    return Section(key, slug, number, level, title, "a", 10, 1, parent)


SECTIONS = {s.key: s for s in [
    section("01/7", level=2, title="洛必达、等价与泰勒"),
    section("01/7.2", parent="01/7", title="常用等价无穷小"),
    section("01/7.3", parent="01/7", title="泰勒公式"),
    section("03/5.1", parent=None, title="奇偶性"),
]}
QUESTIONS = [
    {"num": 1, "chapter": "A", "chapter_name": "函数极限连续", "kp": "0/0"},
    {"num": 2, "chapter": "A", "chapter_name": "函数极限连续", "kp": "0/0"},
]
GROUPS = [{"id": "G001", "chapter": "A", "chapter_name": "函数极限连续", "section": "极限", "kp": "0/0", "nums": [1, 2]}]


def test_excerpt_keeps_math_and_drops_markup():
    body = "<!-- p.10 -->\n> **有界** 若 $0<|x-x_0|<\\delta$，见 [2.3](./01_x.md#23)\n| a | b |\n|---|---|\n| c | d |"
    assert lq.excerpt(body) == "有界 若 $0<|x-x_0|<\\delta$，见 2.3 a b c d"
    assert lq.excerpt("字" * 200, limit=5) == "字字字字字…"


def test_catalog_lists_keys_with_children():
    text = lq.catalog_markdown(SECTIONS, {"01": "函数、极限与连续"}, {"01": {"7": "工具", "7.3": "Taylor 公式"}})
    assert "## 01 函数、极限与连续" in text
    assert "- `01/7` 7 洛必达、等价与泰勒 — 工具 下设：7.2 常用等价无穷小；7.3 泰勒公式" in text
    assert "  - `01/7.3` 7.3 泰勒公式 — Taylor 公式" in text


def run_check(entries, defaults=None):
    report = lq.Report()
    valid = lq.check_defaults(defaults if defaults is not None else {"G001": ["01/7.3"]}, GROUPS, SECTIONS, report)
    lq.check_results([("A.json", e) for e in entries], QUESTIONS, SECTIONS, valid, GROUPS, report)
    return report


def test_check_accepts_complete_results():
    report = run_check([
        {"num": 1, "sections": ["01/7.3", "01/7.2"], "confidence": "high"},
        {"num": 2, "sections": ["01/7.3"], "confidence": "low", "note": "题干残缺"},
    ])
    assert report.ok, report.errors
    assert report.links == {1: ["01/7.3", "01/7.2"], 2: ["01/7.3"]}
    assert any("低把握 1 题：#002" in line for line in report.info)


def test_check_reports_missing_unknown_duplicate_and_bad_fields():
    report = run_check([
        {"num": 1, "sections": ["01/7.3", "01/7.3"], "confidence": "high"},
        {"num": 1, "sections": ["01/7.3"], "confidence": "high"},
        {"num": 999, "sections": ["01/7.3"], "confidence": "high"},
        {"num": 2, "sections": ["01/7.9", "01/7.2", "01/7.3", "01/7"], "confidence": "maybe"},
    ], defaults={})
    text = "\n".join(report.errors)
    assert "缺少 G001" in text
    assert "小节重复" in text
    assert "#001 重复出现" in text
    assert "999" in text
    assert "最多 3 个小节" in text and "01/7.9" in text and "confidence" in text
    assert not report.ok


def test_check_warns_about_other_chapters_and_departures_from_the_default():
    report = run_check([
        {"num": 1, "sections": ["03/5.1"], "confidence": "high"},
        {"num": 2, "sections": ["01/7.2"], "confidence": "high"},
    ])
    assert report.ok
    warnings = "\n".join(report.warnings)
    assert "#001" in warnings and "不在本章对应的知识点章节" in warnings
    assert "#002（0/0）和考点默认值 ['01/7.3'] 完全不同" in warnings


def test_check_reports_unanswered_questions():
    report = run_check([{"num": 1, "sections": ["01/7.3"], "confidence": "high"}])
    assert any("还有 1 题没有结果：#002" in e for e in report.errors)


def test_write_links_sorts_by_number(tmp_path):
    path = lq.write_links({10: ["01/7.3"], 2: ["01/7.2", "01/7.3"]}, tmp_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert list(data["links"]) == ["2", "10"] and data["version"] == 1
