"""The 线代 book on the site: its labels, its missing 答案速查, its subject group and its knowledge chapters."""
import json

import pytest

from dgy.bank import load_bank
from dgy.content import Content, parse_label, qlabel, qshort
from dgy.sections import load_sections
from pipeline.build import merge_xiandai

from .factories import manifest, question, two_books, xiandai_question
from .test_app import _make_env, visible

XIANDAI_KNOWLEDGE = [
    {"slug": "01", "title": "函数、极限与连续", "group": "高等数学", "md": "01_函数极限连续.md",
     "pages": [{"src": "k/gaoshu-010.webp", "w": 10, "h": 10}]},
    {"slug": "10", "title": "行列式", "group": "线性代数", "md": "10_行列式.md",
     "pages": [{"src": "k/xiandai-001.webp", "w": 10, "h": 10}, {"src": "k/xiandai-002.webp", "w": 10, "h": 10}]},
    {"slug": "11", "title": "矩阵", "group": "线性代数", "md": "11_矩阵.md",
     "pages": [{"src": "k/xiandai-003.webp", "w": 10, "h": 10}]},
]
TEXT_002 = {"num": 2, "type": "fill", "stem": "$n$ 阶行列式 $D_n=\\underline{\\qquad\\qquad}$.", "options": None,
            "figure": False, "answer": "$2^{n+1}-2$"}


@pytest.fixture
def env(tmp_path):
    return _make_env(tmp_path, bank=two_books(), knowledge=XIANDAI_KNOWLEDGE, xiandai_texts=[TEXT_002])


def test_labels_name_the_book():
    assert (qlabel(7), qlabel(1001), qlabel(1355)) == ("#007", "线001", "线355")
    assert (qshort(7), qshort(1041)) == ("007", "线041")
    assert [parse_label(t) for t in ("123", "#123", "线12", "线012", " 线1 ", "线", "abc")] == [123, 123, 1012, 1012, 1001, None, None]


def test_bank_loads_the_xiandai_file_under_site_numbers(tmp_path):
    (tmp_path / "xiandai.json").write_text(json.dumps({"questions": [TEXT_002]}, ensure_ascii=False), encoding="utf-8")
    assert list(load_bank(tmp_path)) == [1002]


def test_neighbors_stay_in_the_same_book():
    content = Content(two_books())
    assert content.neighbors(3) == (2, None)
    assert content.neighbors(1001) == (None, 1002)
    assert content.neighbors(1002) == (1001, 1041)
    assert [g for g, _chapters in content.groups()] == ["高等数学", "线性代数"]


def test_a_manifest_without_groups_is_all_gaoshu():
    m = manifest([question(1)])
    for c in m["chapters"]:
        del c["group"]
    assert [g for g, _ in Content(m).groups()] == ["高等数学"]


def test_xiandai_question_page(env):
    page = visible(env.client.get("/q/1001").text)
    assert "线001 具体行列式计算" in page
    assert "答案见解析" in page and "答案速查编号" not in page and "建议" not in page
    assert "线002 →" in page and "←" not in page


def test_xiandai_text_answer_has_no_answer_image(env):
    html = env.client.get("/q/1002").text
    assert "2^{n+1}-2" in html and "答案原图" not in html and "答案见解析" not in html
    assert "← 线001" in visible(html)


def test_last_gaoshu_question_does_not_lead_into_xiandai(env):
    page = visible(env.client.get("/q/3").text)
    assert "← #002" in page and "线001" not in page


def test_search_by_xiandai_number(env):
    r = env.client.get("/bank/search", params={"q": "线1"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/q/1001"
    r = env.client.get("/bank/search", params={"q": "2"}, follow_redirects=False)
    assert r.headers["location"] == "/q/2"
    assert "线041" in visible(env.client.get("/bank/search", params={"q": "抽象逆"}).text)


def test_bank_and_home_group_the_chapters_by_subject(env):
    bank = visible(env.client.get("/bank").text)
    assert bank.index("高等数学") < bank.index("函数极限连续") < bank.index("线性代数") < bank.index("行列式")
    home = visible(env.client.get("/").text)
    assert home.index("高等数学") < home.index("线性代数") < home.index("二次型")


def test_xiandai_chapter_page_cards(env):
    html = env.client.get("/bank/L1").text
    assert 'id="q-1001"' in html and 'id="q-1002"' in html and 'id="q-1041"' not in html
    assert 'title="线001"' in html and "qc-meta" not in html
    assert "/knowledge/10?tab=text" in html  # the chapter's knowledge until the questions are tagged


def test_gaoshu_card_keeps_its_meta(env):
    assert "建议 5 分钟" in visible(env.client.get("/bank/A").text)


def test_grading_a_xiandai_question(env):
    r = env.client.post("/q/1001/grade", data={"owner": "local", "grade": "mastered"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/L1#q-1001"
    bank = visible(env.client.get("/bank").text)
    assert bank.index("行列式 做过 1 / 2 题") > bank.index("线性代数")


def test_old_xiandai_knowledge_link_goes_to_its_first_chapter(env):
    r = env.client.get("/knowledge/xiandai", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/knowledge/10"
    page = visible(env.client.get("/knowledge/10").text)
    assert "行列式" in page and "刷行列式的题" in page


def test_knowledge_chapter_without_markdown_shows_the_original_only(env):
    html = env.client.get("/knowledge/11?tab=text").text
    assert "xiandai-003.webp" in html


def test_sections_take_xiandai_first_pages_from_its_index(tmp_path):
    (tmp_path / "线代总目录.md").write_text("| 3–12 | [11 矩阵](./11_矩阵.md) | 转写 |\n", encoding="utf-8")
    (tmp_path / "11_矩阵.md").write_text("# 矩阵\n\n<!-- p.4 -->\n\n## 3. 矩阵逆\n\n### 3.1 逆定义\n\n设 $A$\n", encoding="utf-8")
    sections = load_sections(tmp_path)
    assert sections["11/3.1"].pdf_page == 4 and sections["11/3.1"].page_index == 2


def test_merge_xiandai_replaces_the_xiandai_part(tmp_path):
    built = two_books()
    xiandai = {"chapters": [c for c in built["chapters"] if c["group"] == "线性代数"],
               "questions": [q for q in built["questions"] if q["num"] > 1000], "alignment": {"weak": [], "skipped": []}}
    (tmp_path / "manifest.json").write_text(json.dumps(xiandai, ensure_ascii=False), encoding="utf-8")
    gaoshu = manifest([question(1)])
    merged = merge_xiandai(merge_xiandai(gaoshu, tmp_path), tmp_path)  # twice: nothing is doubled
    assert [q["num"] for q in merged["questions"]] == [1, 1001, 1002, 1041]
    assert [c["code"] for c in merged["chapters"]][-7:] == ["F", "L1", "L2", "L3", "L4", "L5", "L6"]
    assert merged["chapter_links"]["L1"] == ["10"]
    assert merge_xiandai(merged, tmp_path / "missing")["questions"] == [question(1)]
