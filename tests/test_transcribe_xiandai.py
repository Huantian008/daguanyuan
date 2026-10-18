import json

from PIL import Image, ImageDraw

from pipeline import transcribe_xiandai as tx
from pipeline.link_questions import Report

# The three test questions, transcribed from the original statements in the answer book (see docs/deepseek/线代题目转写.md).
PROBE_ANSWERS = [
    {"num": 2, "type": "fill", "figure": False, "options": None, "confidence": "high", "note": "",
     "stem": "$n$ 阶行列式 $\\begin{vmatrix}2&0&\\cdots&0&2\\\\-1&2&\\cdots&0&2\\\\\\vdots&\\vdots&&\\vdots&\\vdots\\\\"
             "0&0&\\cdots&2&2\\\\0&0&\\cdots&-1&2\\end{vmatrix}=\\underline{\\qquad\\qquad}$.",
     "answer": "$2^{n+1}-2$", "answer_basis": "label", "mismatch": "题目本把第 2 行和第 $n$ 行的 $-1$ 印成了 $1$"},
    {"num": 13, "type": "fill", "figure": False, "options": None, "confidence": "high", "note": "答案取自手写解析最后一行",
     "stem": "已知线性方程组 $\\begin{cases}ax_1+x_3=1,\\\\x_1+ax_2+x_3=0,\\\\x_1+2x_2+ax_3=0,\\\\ax_1+bx_2=2\\end{cases}$ 有解，"
             "其中 $a,b$ 为常数.若 $\\begin{vmatrix}a&0&1\\\\1&a&1\\\\1&2&a\\end{vmatrix}=4$，"
             "则 $\\begin{vmatrix}1&a&1\\\\1&2&a\\\\a&b&0\\end{vmatrix}=\\underline{\\qquad\\qquad}$.",
     "answer": "$8$", "answer_basis": "derived", "mismatch": "题目本第二个方程印成 $x_1+ax_3+x_3=0$"},
    {"num": 147, "type": "choice", "figure": False, "confidence": "high", "note": "",
     "stem": "设 $A$ 是 $n$ 阶矩阵, $\\alpha$ 是 $n$ 维列向量.若 $r\\begin{pmatrix}A&\\alpha\\\\\\alpha^{\\mathrm{T}}&0\\end{pmatrix}=r(A)$, "
             "则线性方程组（　　）",
     "options": {"A": "$Ax=\\alpha$ 必有无穷多解", "B": "$Ax=\\alpha$ 必有唯一解.",
                 "C": "$\\begin{pmatrix}A&\\alpha\\\\\\alpha^{\\mathrm{T}}&0\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}=0$ 仅有零解",
                 "D": "$\\begin{pmatrix}A&\\alpha\\\\\\alpha^{\\mathrm{T}}&0\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}=0$ 必有非零解."},
     "answer": "D", "answer_basis": "label"},
]


def _work_dir(tmp_path, results, name="L1-001-013.json"):
    (tmp_path / "out").mkdir(exist_ok=True)
    rows = [{"num": n, "pdf_text": ""} for n in range(1, 356)]
    (tmp_path / "questions.jsonl").write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    (tmp_path / "out" / name).write_text(json.dumps({"questions": results}, ensure_ascii=False), encoding="utf-8")
    return tmp_path


def test_pdf_hint_drops_the_private_use_brackets():
    assert tx.pdf_hint("r A α αT 0    = r A") == "r A α αT 0 = r A"


def test_entry_needs_an_answer_basis_and_a_real_mismatch():
    report = Report()
    tx.check_entry("#t", PROBE_ANSWERS[0], report)
    assert report.ok and not report.warnings
    report = Report()
    tx.check_entry("#t", dict(PROBE_ANSWERS[0], answer_basis="guess", mismatch=" ", stem="(本题满分 12 分) 设"), report)
    assert any("answer_basis" in e for e in report.errors) and any("mismatch" in e for e in report.errors)
    assert any("本题满分" in w for w in report.warnings)


def test_probe_passes_the_original_statement_and_catches_the_typos(tmp_path):
    report, _ = tx.check(_work_dir(tmp_path, PROBE_ANSWERS, "probe.json"), probe=True)
    assert report.ok, report.errors
    copied = [dict(PROBE_ANSWERS[0], stem=PROBE_ANSWERS[0]["stem"].replace("-1&", "1&")),  # as the question book prints it
              dict(PROBE_ANSWERS[1], answer="$4$", answer_basis="label"), PROBE_ANSWERS[2]]
    report, _ = tx.check(_work_dir(tmp_path, copied, "probe.json"), probe=True)
    assert any("#002" in e and "-1&2" in e for e in report.errors)
    assert any("#013" in e and "答案" in e for e in report.errors)
    assert any("#013" in e and "answer_basis" in e for e in report.errors)


def test_full_check_lists_derived_answers_and_mismatches(tmp_path):
    report, entries = tx.check(_work_dir(tmp_path, PROBE_ANSWERS))
    assert sorted(entries) == [2, 13, 147]
    assert any("还有 352 题没有结果" in e for e in report.errors)
    assert "答案从解析推出 1 题：#013" in report.info
    assert "题目本与原书不同 2 题：#002、#013" in report.info


def test_solution_bands_are_numbered_on_through_the_images(tmp_path, monkeypatch):
    monkeypatch.setattr(tx, "REL_IMG_DIR", "img")
    srcs = []
    for k, height in enumerate((300, 1500)):  # 1000 px wide: the second one is over 640k pixels and gets cut
        img = Image.new("RGB", (1000, height), "white")
        draw = ImageDraw.Draw(img)
        for top in range(20, height - 100, 300):
            draw.rectangle((10, top, 990, top + 100), fill="black")
        srcs.append(tmp_path / f"src{k}.png")
        img.save(srcs[-1])
    out = tmp_path / "out"
    out.mkdir()
    paths = tx._solution_pngs(srcs, out, "s002")
    assert paths[0] == "img/s002-1.png" and len(paths) >= 3
    assert sorted(p.name for p in out.iterdir()) == sorted(f"s002-{i}.png" for i in range(1, len(paths) + 1))
