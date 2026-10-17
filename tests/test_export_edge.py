import json

import pytest

from pipeline.export_edge import export_edge

from .factories import small_bank

KNOWLEDGE = [
    {"slug": "01", "title": "函数、极限与连续", "group": "高等数学", "md": "01_x.md",
     "pages": [{"src": "k/gaoshu-010.webp", "w": 10, "h": 10}]},
    {"slug": "xiandai", "title": "线性代数", "group": "线性代数", "md": None, "toc": [],
     "pages": [{"src": "k/xiandai-001.webp", "w": 10, "h": 10}]},
]


@pytest.fixture
def dirs(tmp_path):
    content = tmp_path / "content"
    bank = small_bank()
    bank["knowledge"] = KNOWLEDGE
    for q in bank["questions"]:
        for src in [q["img"]["src"], q["answer"]["src"]] + [s["src"] for s in q["solution"]]:
            (content / src).parent.mkdir(parents=True, exist_ok=True)
            (content / src).write_bytes(b"img")
    for k in KNOWLEDGE:
        for p in k["pages"]:
            (content / p["src"]).parent.mkdir(parents=True, exist_ok=True)
            (content / p["src"]).write_bytes(b"page")
    (content / "manifest.json").write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
    static = tmp_path / "static"
    (static / "css").mkdir(parents=True)
    (static / "css" / "app.css").write_text("body{}", encoding="utf-8")
    md = tmp_path / "md"
    (md / "assets" / "diagrams").mkdir(parents=True)
    (md / "assets" / "diagrams" / "d.png").write_bytes(b"png")
    (md / "00_总目录.md").write_text("# 总目录\n\n核对说明\n", encoding="utf-8")
    (md / "01_x.md").write_text("# 函数\n\n## 1. 函数基础\n\n<!-- p.10 -->\n若 $f'(x)$ 有界\n", encoding="utf-8")
    (md / "question_links.json").write_text(json.dumps({"version": 1, "links": {"3": ["01/1"], "4": ["99/9"]}}),
                                            encoding="utf-8")
    bank = tmp_path / "bank"
    bank.mkdir()
    (bank / "questions.json").write_text(json.dumps({"version": 1, "questions": [
        {"num": 3, "type": "fill", "stem": "求 $x$", "options": None, "figure": False, "answer": "$1$"}]}), encoding="utf-8")
    return content, static, md, tmp_path / "edge"


def test_copies_images_static_files_and_diagrams_into_public(dirs):
    content, static, md, edge = dirs
    export_edge(content, static, md, edge)
    public = edge / "public"
    assert (public / "content" / "q" / "001.webp").read_bytes() == b"img"
    assert (public / "content" / "k" / "gaoshu-010.webp").exists()
    assert (public / "static" / "css" / "app.css").exists()
    assert (public / "knowledge" / "assets" / "diagrams" / "d.png").exists()
    assert not (public / "content" / "manifest.json").exists()


def test_writes_manifest_and_prerendered_knowledge(dirs):
    content, static, md, edge = dirs
    export_edge(content, static, md, edge)
    generated = edge / "src" / "generated"
    manifest = json.loads((generated / "manifest.json").read_text(encoding="utf-8"))
    assert [q["num"] for q in manifest["questions"]] == [1, 2, 3, 4, 5, 6]
    knowledge = json.loads((generated / "knowledge.json").read_text(encoding="utf-8"))
    assert 'class="math inline"' in knowledge["chapters"]["01"]["html"]
    assert knowledge["chapters"]["01"]["toc"] == [["1-函数基础", "1. 函数基础"]]
    assert "xiandai" not in knowledge["chapters"]
    assert "核对说明" in knowledge["overview"]


def test_writes_sections_and_question_links(dirs):
    content, static, md, edge = dirs
    export_edge(content, static, md, edge)
    data = json.loads((edge / "src" / "generated" / "sections.json").read_text(encoding="utf-8"))
    assert data["sections"] == [{"key": "01/1", "slug": "01", "number": "1", "level": 2, "title": "函数基础",
                                 "anchor": "1-函数基础", "pdf_page": 10, "page_index": None, "parent": None}]
    assert data["links"] == {"3": ["01/1"]}  # unknown sections are dropped


def test_writes_the_rendered_question_text(dirs, tmp_path):
    content, static, md, edge = dirs
    export_edge(content, static, md, edge, bank_dir=tmp_path / "bank")
    bank = json.loads((edge / "src" / "generated" / "bank.json").read_text(encoding="utf-8"))
    assert list(bank) == ["3"]
    assert bank["3"]["stem"] == '<p>求 <span class="math inline">x</span></p>\n'
    assert bank["3"]["search"] == "求 x" and bank["3"]["answer_key"] is None


def test_report_counts_files_and_versions(dirs):
    content, static, md, edge = dirs
    report = export_edge(content, static, md, edge)
    assert report.files == 6 * 3 + 2 + 1 + 1  # q/a/s per question, 2 knowledge pages, css, diagram
    assert report.too_large == []
    meta = json.loads((edge / "src" / "generated" / "meta.json").read_text(encoding="utf-8"))
    assert meta["content_v"] == "20261016120000"
    assert meta["asset_v"].isdigit()


def test_flags_files_over_the_size_limit(dirs):
    content, static, md, edge = dirs
    report = export_edge(content, static, md, edge, max_bytes=3)
    assert "content/k/gaoshu-010.webp" in report.too_large
