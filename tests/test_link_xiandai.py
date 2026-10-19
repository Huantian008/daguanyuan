"""The 线代 tagging inputs and checks (pipeline.link_xiandai), with tiny fake notes and questions."""
import json

from pipeline import link_questions as lq
from pipeline import link_xiandai as lx

NOTES = {
    "01_函数极限连续.md": "# 函数、极限与连续\n\n## 1. 函数\n\n### 1.1 有界\n\n有界的定义\n",
    "10_行列式.md": "# 行列式\n\n<!-- p.1 -->\n\n## 1. 相关定义\n\n### 1.1 逆序数定义\n\n逆序数是排列中逆序的总数\n\n"
                    "### 1.2 行列式定义\n\n$n$ 阶行列式\n",
    "11_矩阵.md": "# 矩阵\n\n<!-- p.3 -->\n\n## 1. 矩阵乘法\n\n### 1.1 结合分配律\n\n$(AB)C=A(BC)$\n",
}


def question(num, chapter="L1", section="具体行列式计算", kp="具体行列式计算"):
    return {"num": 1000 + num, "chapter": chapter, "kp": kp, "section": section, "path": [section], "source": "2014数一二三"}


def _inputs(tmp_path):
    md = tmp_path / "md"
    md.mkdir()
    for name, text in NOTES.items():
        (md / name).write_text(text, encoding="utf-8")
    content = tmp_path / "xiandai"
    content.mkdir()
    questions = [question(1), question(2), question(41, "L2", "逆", "抽象逆")]
    (content / "manifest.json").write_text(json.dumps({"questions": questions}, ensure_ascii=False), encoding="utf-8")
    bank = tmp_path / "xiandai.json"
    bank.write_text(json.dumps({"questions": [
        {"num": n, "type": "fill", "stem": f"第 {n} 题 $|A|=\\underline{{\\qquad}}$", "options": None, "figure": False, "answer": "$1$"}
        for n in (1, 2, 41)]}, ensure_ascii=False), encoding="utf-8")
    work = tmp_path / "linking"
    lx.prepare(work, md, content, bank, tmp_path / "no-transcribe")
    return work, md


def test_prepare_takes_the_xiandai_sections_and_book_numbers(tmp_path):
    work, _md = _inputs(tmp_path)
    catalog = (work / "catalog.md").read_text(encoding="utf-8")
    assert "`10/1.1` 1.1 逆序数定义" in catalog and "`11/1.1`" in catalog and "01/1.1" not in catalog
    rows = [json.loads(line) for line in (work / "questions.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [r["num"] for r in rows] == [1, 2, 41]
    assert rows[2]["chapter_name"] == "矩阵" and rows[2]["knowledge_chapter"] == "11" and "第 41 题" in rows[2]["stem"]
    groups = json.loads((work / "kp_groups.json").read_text(encoding="utf-8"))
    assert [(g["id"], g["nums"]) for g in groups] == [("G001", [1, 2]), ("G002", [41])]


def test_check_uses_the_xiandai_chapters_and_write_keeps_gaoshu(tmp_path):
    work, md = _inputs(tmp_path)
    (work / "kp_defaults.json").write_text(json.dumps({"G001": ["10/1.2"], "G002": ["11/1.1"]}), encoding="utf-8")
    (work / "out" / "L1.json").write_text(json.dumps({"questions": [
        {"num": 1, "sections": ["10/1.2"], "confidence": "high", "note": ""},
        {"num": 2, "sections": ["11/1.1"], "confidence": "low", "note": "要用矩阵乘法"},
        {"num": 41, "sections": ["01/1.1"], "confidence": "high", "note": ""},
    ]}, ensure_ascii=False), encoding="utf-8")
    report = lx.check(work, md)
    assert any("目录里没有这些 key ['01/1.1']" in e for e in report.errors)  # a 高数 key is not in the 线代 catalog
    assert any("#002（行列式 / 具体行列式计算）主小节 11/1.1 不在本章" in w for w in report.warnings)

    (work / "out" / "L1.json").write_text(json.dumps({"questions": [
        {"num": 1, "sections": ["10/1.2"], "confidence": "high", "note": ""},
        {"num": 2, "sections": ["10/1.2", "10/1.1"], "confidence": "high", "note": ""},
        {"num": 41, "sections": ["11/1.1"], "confidence": "high", "note": ""},
    ]}, ensure_ascii=False), encoding="utf-8")
    report = lx.check(work, md)
    assert report.ok and not report.warnings
    lq.write_links({1: ["01/1.1"]}, md)  # the 高数 links already there
    lx.write(report, md)
    links = json.loads((md / "question_links.json").read_text(encoding="utf-8"))["links"]
    assert links == {"1": ["01/1.1"], "1001": ["10/1.2"], "1002": ["10/1.2", "10/1.1"], "1041": ["11/1.1"]}
