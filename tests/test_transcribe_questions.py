import json
import shutil

import pytest
from PIL import Image, ImageDraw

from pipeline import transcribe_questions as tq
from pipeline.link_questions import Report

GOOD_CHOICE = {
    "num": 1, "type": "choice", "figure": False, "answer": "A", "confidence": "high",
    "stem": "函数 $f(x)=\\dfrac{|x|\\sin(x-2)}{x(x-1)(x-2)^2}$ 在下列哪个区间内有界（　　）.",
    "options": {"A": "$(-1,0)$", "B": "$(0,1)$", "C": "$(1,2)$", "D": "$(2,3)$"},
}
PDF_TEXT_1 = "(7) 函数f x   = x sin x-2   x x-1   x-2   2 在下列哪个区间内有界( ). A. -1,0 . B. 0,1 . C. 1,2 . D. 2,3 ."


def errors_and_warnings(entry):
    report = Report()
    tq.check_entry("#t", entry, report)
    return "\n".join(report.errors), "\n".join(report.warnings)


def test_math_segments_like_the_dollarmath_renderer():
    text = "设 $a$，且 $$\\int_0^1 f$$ 价格 \\$5，$b^2$"
    assert tq.math_segments(text) == [(True, "\\int_0^1 f"), (False, "a"), (False, "b^2")]
    assert tq.unbalanced_dollars("求 $x") and not tq.unbalanced_dollars("$x$ 与 $$y$$")


def test_plain_chars_keep_function_names_even_after_another_command():
    # \displaystyle\lim must still count as "lim", not vanish together with \displaystyle.
    assert tq.plain_chars("$\\displaystyle\\lim_{x\\to0}\\mathrm{e}^x$") == {"l": 1, "i": 1, "m": 1, "x": 2, "0": 1, "e": 1}


def test_labels_at_the_start_are_ignored_and_reported():
    assert tq.strip_labels("【例 6.12】(2018, 数二) 计算积分") == " 计算积分"
    assert tq.coverage("【例 6.4】(2022, 数二) 求 x2", {"stem": "求 $x^2$"}) == 1.0
    _errors, warnings = errors_and_warnings(dict(GOOD_CHOICE, stem="(2018, 数二) 求极限（　　）"))
    assert "出处" in warnings


def test_coverage_finds_the_pdf_text_again():
    assert tq.coverage(PDF_TEXT_1, GOOD_CHOICE) == 1.0
    assert tq.coverage(PDF_TEXT_1, dict(GOOD_CHOICE, stem="函数在下列哪个区间内有界（　　）.")) < tq.COVERAGE_MIN
    assert tq.coverage("只有汉字", {"stem": "只有汉字"}) == 1.0


def test_check_entry_accepts_a_good_choice_and_a_figure_choice_without_options():
    assert errors_and_warnings(GOOD_CHOICE) == ("", "")
    assert errors_and_warnings(dict(GOOD_CHOICE, options=None, figure=True)) == ("", "")


def test_check_entry_catches_format_mistakes():
    errors, warnings = errors_and_warnings(dict(GOOD_CHOICE, stem="(2) 设 $x", options={"A": "a", "B": "b", "C": "c"}))
    assert "A、B、C、D" in errors and "$ 没有成对" in errors and "(2)" in warnings
    errors, _ = errors_and_warnings({"num": 5, "type": "fill", "stem": "求 ____", "options": {"A": "a"}, "figure": False,
                                     "answer": "", "confidence": "low"})
    assert "空位" in errors and "只有选择题才有 options" in errors and "answer 不能为空" in errors and "note" in errors
    errors, _ = errors_and_warnings({"num": 6, "type": "proof", "stem": "证明", "answer": "略", "confidence": "high"})
    assert "type 只能是" in errors and "缺少字段 options" in errors and "figure" in errors


def test_probe_needs_the_structure_only_the_image_shows():
    good = {
        12: {"type": "solve", "stem": "求极限 $\\displaystyle\\lim\\limits_{x \\to 0}\\frac{\\sqrt{1+2\\sin{x}}-x-1}{x\\ln(1+x)}$."},
        205: {"type": "choice", "figure": True, "stem": "已知函数 $y=f(x)$ ……则其导函数 $y=f^{\\prime}(x)$ 的图形为（　　）."},
        300: {"type": "fill", "stem": "$\\displaystyle\\int_{-2}^2(x+\\left|x\\right|)\\mathrm{e}^{-\\lvert x\\rvert}\\,\\mathrm{d}x$"},
    }
    report = Report()
    tq.check_probe(good, report)
    assert report.ok, report.errors
    bad = {**good, 12: dict(good[12], stem="$\\lim_{x\\to0}\\frac{1+2\\sin x-x-1}{x\\ln(1+x)}$"), 205: dict(good[205], figure=False)}
    report = Report()
    tq.check_probe(bad, report)
    assert any("#012" in e and "sqrt" in e for e in report.errors)
    assert any("#205" in e and "figure" in e for e in report.errors)


def test_split_bands_cuts_in_the_middle_of_blank_gaps():
    img = Image.new("RGB", (100, 900), "white")
    draw = ImageDraw.Draw(img)
    for top in (100, 400, 700):
        draw.rectangle((10, top, 90, top + 100), fill="black")
    bands = tq.split_bands(img, max_pixels=100 * 450)
    assert [b.height for b in bands] == [300, 300, 300]  # cut at rows 300 and 600, the middles of the gaps
    for band in bands:
        assert band.width * band.height <= 100 * 450
        assert min(band.convert("L").crop((0, band.height - 1, 100, band.height)).getdata()) == 255
    small = Image.new("RGB", (100, 100), "white")
    assert tq.split_bands(small, max_pixels=100 * 450) == [small]


def test_type_hint():
    assert tq.type_hint(PDF_TEXT_1) == "choice"
    assert tq.type_hint("微分方程的通解是_____") == "fill"
    assert tq.type_hint("求极限 lim x→0") == "solve"


def test_write_bank_one_question_per_line(tmp_path):
    entries = {2: dict(GOOD_CHOICE, num=2, note="不进题库"), 1: GOOD_CHOICE}
    path = tq.write_bank(entries, tmp_path)
    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines[3].startswith('  {"num": 1,') and lines[4].startswith('  {"num": 2,')
    data = json.loads(path.read_text(encoding="utf-8"))
    assert [q["num"] for q in data["questions"]] == [1, 2]
    assert list(data["questions"][1]) == list(tq.FIELDS)  # confidence and note stay out


def test_write_bank_keeps_an_erratum(tmp_path):
    fixed = dict(GOOD_CHOICE, answer="C", erratum="速查原印 D")
    data = json.loads(tq.write_bank({1: fixed}, tmp_path).read_text(encoding="utf-8"))
    assert data["questions"][0]["erratum"] == "速查原印 D"
    assert errors_and_warnings(fixed) == ("", "")
    assert "erratum" in errors_and_warnings(dict(GOOD_CHOICE, erratum=" "))[0]


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_katex_errors_use_the_sites_katex():
    errors = tq.katex_errors([
        {"id": "ok", "tex": "\\displaystyle\\lim_{x\\to0}\\frac{\\mathrm{e}^x-1}{x}", "display": False},
        {"id": "broken", "tex": "\\frac{1}{", "display": False},
        {"id": "unknown", "tex": "\\foo x", "display": True},
    ])
    assert [e["id"] for e in errors] == ["broken", "unknown"]


def test_check_reads_chapter_files_but_not_the_probe(tmp_path):
    (tmp_path / "out").mkdir()
    rows = [{"num": 1, "pdf_text": PDF_TEXT_1}, {"num": 2, "pdf_text": "设函数f x 连续"}]
    (tmp_path / "questions.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    (tmp_path / "out" / "A.json").write_text(json.dumps({"questions": [GOOD_CHOICE]}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "out" / "probe.json").write_text(json.dumps({"questions": [GOOD_CHOICE]}, ensure_ascii=False), encoding="utf-8")
    report, entries = tq.check(tmp_path)
    assert list(entries) == [1]
    assert any("还有 1 题没有结果：#002" in e for e in report.errors)
    assert not any("重复" in e for e in report.errors)


def test_full_width_punctuation_inside_a_formula_is_an_error():
    report = Report()
    entry = dict(GOOD_CHOICE, stem="设 $f(x)=\\begin{cases}x, & x>0，\\\\ 0, & x\\leqslant0\\end{cases}$，则（　　）.")
    tq.check_formulas([("#t", entry)], report)
    assert any("全角标点「，」" in e for e in report.errors)
    report = Report()
    tq.check_formulas([("#t", GOOD_CHOICE)], report)  # full-width punctuation outside $…$ is fine
    assert not any("全角" in e for e in report.errors)


def test_a_second_probe_file_for_a_new_model(tmp_path):
    (tmp_path / "out").mkdir()
    (tmp_path / "questions.jsonl").write_text(json.dumps({"num": 1, "pdf_text": PDF_TEXT_1}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "out" / "A.json").write_text(json.dumps({"questions": [GOOD_CHOICE]}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "out" / "probe-harness.json").write_text(json.dumps({"questions": [dict(GOOD_CHOICE, stem="改过")]},
                                                                    ensure_ascii=False), encoding="utf-8")
    _report, entries = tq.check(tmp_path, probe=True, probe_file="probe-harness.json")
    assert entries[1]["stem"] == "改过"
    report, entries = tq.check(tmp_path)  # the full check leaves every probe file out
    assert entries[1]["stem"] == GOOD_CHOICE["stem"] and report.ok, report.errors
