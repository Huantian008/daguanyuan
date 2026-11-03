import json
import re
import sqlite3
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from dgy.config import Settings
from dgy.main import create_app
from dgy.studyday import TZ

from .factories import small_bank

KNOWLEDGE = [
    {"slug": "01", "title": "函数、极限与连续", "group": "高等数学", "md": "01_函数极限连续.md",
     "pages": [{"src": "k/gaoshu-010.webp", "w": 10, "h": 10}]},
    {"slug": "xiandai", "title": "线性代数", "group": "线性代数", "md": None, "toc": [],
     "pages": [{"src": "k/xiandai-001.webp", "w": 10, "h": 10}]},
]


class Clock:
    def __init__(self, at):
        self.at = at

    def __call__(self):
        return self.at


def _make_env(tmp_path, password=None, links=None, texts=None, bank=None, knowledge=KNOWLEDGE, xiandai_texts=None):
    content = tmp_path / "content"
    bank = bank or small_bank()
    bank["knowledge"] = knowledge
    content.mkdir()
    (content / "manifest.json").write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
    srcs = [q["img"]["src"] for q in bank["questions"]] + [q["answer"]["src"] for q in bank["questions"] if q["answer"]]
    srcs += [s["src"] for q in bank["questions"] for s in q["solution"]] + [p["src"] for k in knowledge for p in k["pages"]]
    for src in srcs:
        (content / src).parent.mkdir(parents=True, exist_ok=True)
        (content / src).write_bytes(b"img")
    md = tmp_path / "md"
    (md / "assets").mkdir(parents=True)
    (md / "00_总目录.md").write_text("# 总目录\n\n核对说明\n\n| 10–10 | [01 函数](./01_函数极限连续.md) | 转写 |\n",
                                   encoding="utf-8")
    (md / "01_函数极限连续.md").write_text("# 函数、极限与连续\n\n## 1. 函数基础\n\n<!-- p.10 -->\n若 $f'(x)$ 有界\n",
                                       encoding="utf-8")
    if links:
        (md / "question_links.json").write_text(json.dumps({"version": 1, "links": links}), encoding="utf-8")
    bank_dir = None
    for name, rows in (("questions.json", texts), ("xiandai.json", xiandai_texts)):
        if rows:
            bank_dir = tmp_path / "bank"
            bank_dir.mkdir(exist_ok=True)
            (bank_dir / name).write_text(json.dumps({"version": 1, "questions": rows}, ensure_ascii=False), encoding="utf-8")
    settings = Settings(content_dir=content, data_dir=tmp_path / "data", knowledge_md_dir=md,
                        password=password, secret_key="test-secret", bank_dir=bank_dir)
    clock = Clock(datetime(2026, 10, 16, 21, 0, tzinfo=TZ))
    return SimpleNamespace(client=TestClient(create_app(settings, clock)), clock=clock, settings=settings)


@pytest.fixture
def env(tmp_path):
    return _make_env(tmp_path)


def visible(html):
    """Page text as the reader sees it (tags removed, whitespace collapsed)."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def grade(env, num, value, **form):
    r = env.client.post(f"/q/{num}/grade", data={"owner": "local", "grade": value, **form}, follow_redirects=False)
    assert r.status_code == 303


def review_modes(env):
    with sqlite3.connect(env.settings.db_path) as conn:
        return conn.execute("SELECT num, mode FROM reviews ORDER BY id").fetchall()


def test_dashboard_shows_exam_countdown_and_empty_queues(env):
    page = env.client.get("/").text
    assert "还有 64 天" in visible(page)
    assert 'data-due-count="0"' in page and 'data-warmup-count="0"' in page
    # nothing to warm up or review: a calm note instead of a disabled button
    assert "今天不用热身" in page and "今天没有到期的题" in page and "disabled" not in page
    # nothing graded yet: 继续往下做 starts at the first 考点 of the book, and has the only primary button
    assert "<b>1</b> 题没做" in page and "函数极限连续 / 函数性质 / 有界" in page
    assert '<a class="btn btn-primary" href="/bank/A?kp=1#q-1">开始做题</a>' in page


def test_dashboard_date_and_countdown_turn_at_midnight_while_the_rest_goes_by_study_day(env):
    grade(env, 1, "shaky")
    env.clock.at = datetime(2026, 10, 17, 0, 30, tzinfo=TZ)
    page = env.client.get("/").text
    assert '<p class="hero-date">10月17日周六</p>' in page and "还有 63 天" in visible(page)
    # still the 16th's study day: nothing to warm up yet, and #1 counts for today
    assert 'data-warmup-count="0"' in page and "1 今日题数" in visible(page)
    env.clock.at = datetime(2026, 10, 17, 4, 0, tzinfo=TZ)
    page = env.client.get("/").text
    assert "还有 63 天" in visible(page) and 'data-warmup-count="1"' in page


def test_dashboard_picks_up_where_the_last_chapter_page_grade_left_off(env):
    grade(env, 4, "mastered")
    page = env.client.get("/").text
    assert '<a class="btn btn-primary" href="/bank/B?kp=1#q-5">继续上次</a>' in page
    assert "<b>1</b> 题没做" in page and "一元微分 / 导数概念 / 基本概念题" in page and "换个考点" in page
    # #2's 考点 is done now, so it moves on to the next one with work left
    grade(env, 2, "mastered")
    assert 'href="/bank/A?kp=3#q-3">继续上次</a>' in env.client.get("/").text
    # grading in warm-up the next day does not move it back to #4
    env.clock.at += timedelta(days=1)
    grade(env, 4, "mastered", mode="warmup")
    page = env.client.get("/").text
    assert 'href="/bank/A?kp=3#q-3">继续上次</a>' in page and "/practice/" not in page


def test_dashboard_says_so_when_the_whole_bank_is_done(env):
    for num in (1, 2, 3, 4, 5):
        grade(env, num, "mastered")
    page = env.client.get("/").text
    assert "整本题库都做过一遍了" in page and '<a class="btn btn-primary" href="/bank">去题库</a>' in page


def test_weak_spots_lead_to_their_kp_on_the_chapter_page(env):
    grade(env, 3, "unknown")
    assert '<a class="btn btn-small" href="/bank/A?kp=3">去巩固</a>' in env.client.get("/").text


def test_next_day_offers_warmup_and_due_review_as_card_pages(env):
    grade(env, 1, "shaky")
    env.clock.at += timedelta(days=1)
    page = env.client.get("/").text
    assert 'data-warmup-count="1"' in page and 'data-due-count="1"' in page and "今天不用热身" not in page
    # warm-up comes first tonight, so it alone gets the primary button
    assert '<a class="btn btn-primary" href="/review/warmup">开始热身</a>' in page
    assert '<a class="btn" href="/review/due">开始复习</a>' in page
    for mode in ("warmup", "due"):
        cards = env.client.get(f"/review/{mode}").text
        assert 'id="q-1"' in cards and 'action="/q/1/grade"' in cards and 'id="q-2"' not in cards
        assert (f'<input type="hidden" name="back" value="/review/{mode}#q-1">'
                f'<input type="hidden" name="mode" value="{mode}">') in cards
        assert "今天已评 0 / 1 题" in visible(cards)


def test_review_page_keeps_a_graded_card_and_records_the_mode(env):
    grade(env, 1, "shaky")
    grade(env, 2, "mastered")
    env.clock.at += timedelta(days=1)
    r = env.client.post("/q/1/grade", data={"owner": "local", "grade": "mastered", "mode": "warmup", "back": "/review/warmup#q-1"},
                        follow_redirects=False)
    assert r.headers["location"] == "/review/warmup#q-1"
    cards = env.client.get("/review/warmup").text
    assert re.search(r'id="q-1"[\s\S]*qc-grade-mastered is-picked[\s\S]*id="q-2"', cards) and "今天已评 1 / 2 题" in visible(cards)
    assert '<span class="js-graded">1</span>' in cards and '<a class="btn js-all-graded" data-total="2" href="/">' in cards
    assert 'data-warmup-count="1"' in env.client.get("/").text
    # #1 was due as well; graded today, it has left due review
    assert "今天没有到期的题。" in env.client.get("/review/due").text
    assert review_modes(env) == [(1, "browse"), (2, "browse"), (1, "warmup")]
    # changing the grade, even from the chapter page, keeps it a warm-up review on the warm-up page
    grade(env, 1, "unknown", back="/bank/A?kp=1#q-1")
    assert re.search(r'id="q-1"[\s\S]*qc-grade-unknown is-picked[\s\S]*id="q-2"', env.client.get("/review/warmup").text)
    assert review_modes(env) == [(1, "browse"), (2, "browse"), (1, "warmup")]


def test_any_other_grade_mode_is_recorded_as_a_chapter_page_grade(env):
    grade(env, 1, "mastered", mode="group")
    assert review_modes(env) == [(1, "browse")]


def test_review_pages_on_a_quiet_day_and_unknown_ones(env):
    assert "今天不用热身。" in env.client.get("/review/warmup").text
    assert env.client.get("/review/random").status_code == 404


def test_question_page_answer_switch_works_without_javascript(env):
    page = env.client.get("/q/1").text
    assert ('<button type="button" class="reveal-toggle js-reveal" aria-expanded="false" aria-controls="answer">'
            in page)
    assert '<section id="answer" class="reveal-panel"' in page
    assert "这道题还没有逐题标注" in page and 'href="/knowledge/01?tab=text"' in page


@pytest.fixture
def tagged(tmp_path):
    return _make_env(tmp_path, links={"1": ["01/1"], "3": ["01/1"]})


def test_tagged_question_links_to_its_knowledge_section(tagged):
    page = tagged.client.get("/bank/A", params={"kp": "1"}).text
    assert 'href="/knowledge/01?tab=text#1-函数基础"' in page and 'data-anchor="1-函数基础"' in page
    assert 'href="/knowledge/01#p1"' in page and "原版第 1 页" in page
    assert "这道题还没有逐题标注" not in page
    detail = visible(tagged.client.get("/q/1").text)
    assert "相关知识点" in detail and "1 函数基础" in detail


def test_knowledge_text_lists_the_questions_of_each_section(tagged):
    grade(tagged, 1, "shaky")
    block = tagged.client.get("/knowledge/01?tab=text").text.split('id="1-函数基础"', 1)[1]
    assert 'class="section-qs"' in block
    assert '<a class="chip chip-shaky" href="/q/1">001</a>' in block and 'href="/q/3"' in block
    assert "练这" not in block


def test_original_pages_list_the_questions_on_them(tagged):
    page = tagged.client.get("/knowledge/01").text
    assert '<figure class="kn-figure" id="p1">' in page
    assert "这一页的题目" in page and 'href="/q/3"' in page


BANK = [
    {"num": 1, "type": "choice", "stem": "函数 $f(x)=\\dfrac{1}{x}$ 在 $(0,1)$ 内（　　）.",
     "options": {"A": "有界", "B": "无界", "C": "$x>\\dfrac12$ 时有界", "D": "4."}, "figure": False,
     "answer": "C", "erratum": "速查原印 B"},
    {"num": 2, "type": "fill", "stem": "求 $x$ 的值 $\\underline{\\qquad}$.\n\n(2) 再求拐点", "options": None,
     "figure": False, "answer": "$\\dfrac12$"},
    {"num": 3, "type": "choice", "stem": "如图所示（　　）", "options": None, "figure": True, "answer": "A"},
]


@pytest.fixture
def texted(tmp_path):
    return _make_env(tmp_path, texts=BANK)


def test_question_shows_as_text_with_a_switch_to_the_image(texted):
    page = texted.client.get("/bank/A", params={"kp": "1"}).text
    assert '<div class="qview" data-view="text">' in page
    assert '<span class="math inline">f(x)=\\dfrac{1}{x}</span>' in page
    assert '<li><b>D.</b> 4.</li>' in page  # inline: not turned into a numbered list
    assert re.search(r'class="qview-toggle js-qview"[^>]*hidden>原图</button>', page)
    assert 'katex.min.css' in page and 'katex.min.js' in page
    assert re.search(r'class="qimg"[^>]*loading="lazy"', page)  # the image waits until it is shown


def test_answer_shows_the_option_and_the_erratum(texted):
    page = texted.client.get("/bank/A", params={"kp": "1"}).text
    assert '<p><b>C.</b> <span class="math inline">x&gt;\\dfrac12</span> 时有界</p>' in page
    assert '<p class="erratum"><b>勘误</b>速查原印 B</p>' in page
    assert '<details class="raw-img"><summary>答案原图</summary>' in page and "a/001.webp" in page


def test_a_question_with_a_figure_opens_on_its_image(texted):
    page = texted.client.get("/q/3").text
    assert '<div class="qview" data-view="image" data-figure>' in page
    assert re.search(r'class="qimg"[^>]*fetchpriority="high"', page)


def test_search_finds_text_in_the_stem(texted):
    page = texted.client.get("/bank/search", params={"q": "再求拐点"}).text
    assert "#002" in page and "#001" not in page
    assert '<p class="snippet">求 x 的值 . (2) 再求拐点</p>' in page


def test_without_the_text_version_the_images_show(env):
    page = env.client.get("/q/1").text
    assert '<div class="qview" data-view="image">' in page
    assert "js-qview" not in page and "katex.min.css" not in page


def test_top_bar_has_a_theme_switch_shown_by_javascript(env):
    page = env.client.get("/").text
    assert re.search(r'class="theme-toggle js-theme"[^>]*hidden', page)
    assert 'classList.add("js")' in page and 'localStorage.getItem("dgy-theme")' in page


def test_top_bar_has_a_question_size_switch_shown_by_javascript(env):
    page = env.client.get("/bank/A").text
    assert re.search(r'class="qsize-toggle js-qsize"[^>]*hidden>Aa</button>', page)
    assert 'localStorage.getItem("dgy-qsize")' in page


def test_excluding_a_kp_skips_it(env):
    r = env.client.post("/bank/exclude", data={"owner": "local", "chapter": "A", "section": "函数性质", "kp": "有界",
                                               "excluded": "1", "back": "/bank/A"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/A"
    assert 'id="q-2"' in env.client.get("/bank/A").text
    assert 'href="/bank/A?kp=2#q-2">开始做题</a>' in env.client.get("/").text
    assert "不做" in env.client.get("/q/1").text


def test_question_6_is_excluded_by_default_and_can_be_restored(env):
    assert "仅数一" in env.client.get("/q/6").text
    assert "恢复，要做" in env.client.get("/q/6").text
    assert "恢复，要做" in env.client.get("/bank/B?kp=2").text
    assert 'action="/q/6/grade"' not in env.client.get("/bank/B", params={"kp": "2"}).text
    env.client.post("/bank/exclude", data={"owner": "local", "nums": "6", "excluded": "0", "back": "/q/6"})
    assert 'action="/q/6/grade"' in env.client.get("/bank/B", params={"kp": "2"}).text


def test_question_page_and_search(env):
    page = env.client.get("/q/1").text
    assert "有界" in page and "2004数三" in page and "a/001.webp" in page
    assert "不做了" not in page and 'action="/bank/exclude"' not in page
    r = env.client.get("/bank/search", params={"q": "3"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/q/3"
    assert "#001" in env.client.get("/bank/search", params={"q": "2004"}).text
    assert env.client.get("/q/999").status_code == 404


def test_one_by_one_practice_is_gone(env):
    assert env.client.post("/practice/start", data={"mode": "due"}).status_code in (404, 405)
    assert env.client.get("/practice/1").status_code == 404
    chapter = env.client.get("/bank/A", params={"kp": "1"}).text
    assert 'action="/practice/' not in chapter and "整个考点不做了" not in chapter
    question = env.client.get("/q/4").text
    assert 'action="/practice/' not in question
    # the question page leads back to the card on the chapter page (#4 is in 考点 1 of chapter B)
    assert 'href="/bank/B?kp=1#q-4"' in question
    assert 'href="/bank/B?kp=2#q-6"' in env.client.get("/q/6").text


def test_bank_pages(env):
    assert "函数极限连续" in env.client.get("/bank").text
    chapter = env.client.get("/bank/B").text
    assert "导数概念" in chapter and "基本概念题" in chapter
    assert env.client.get("/bank/Z").status_code == 404


def test_chapter_page_lays_out_one_kp_with_its_questions(env):
    page = env.client.get("/bank/B").text
    assert "不做了" not in page and 'action="/bank/exclude"' not in page
    assert 'id="q-4"' in page and 'id="q-5"' in page and 'id="q-6"' not in page
    assert 'action="/q/4/grade"' in page and 'name="grade" value="mastered"' in page
    # the answer and solution wait in folds that open without JavaScript being needed to see them
    assert 'id="qa-4"' in page and 'id="qs-4"' in page and "s/004-1.webp" in page
    assert re.search(r'class="qimg"[^>]*loading="lazy"', page)
    assert "data-shortcuts" not in page
    # the tree lists every 考点 of the chapter with how many are done
    assert re.search(r'href="/bank/B\?kp=2"[^>]*>\s*<span class="kt-name">隐函数求导</span>\s*<span class="kt-count">0 / 0</span>', page)


def test_chapter_page_opens_on_the_first_kp_with_work_left(env):
    assert "?kp=1" in env.client.get("/bank/A").text and 'id="q-1"' in env.client.get("/bank/A").text
    env.client.post("/q/1/grade", data={"owner": "local", "grade": "mastered"})
    page = env.client.get("/bank/A").text
    assert 'id="q-2"' in page and 'id="q-1"' not in page
    assert 'id="q-3"' in env.client.get("/bank/A", params={"kp": "3"}).text
    assert 'id="q-2"' in env.client.get("/bank/A", params={"kp": "99"}).text  # out of range: the default one
    assert 'id="q-2"' in env.client.get("/bank/A", params={"kp": "abc"}).text


def test_chapter_page_steps_between_kps_and_chapters(env):
    first = env.client.get("/bank/A", params={"kp": "1"}).text
    assert 'href="/bank/A?kp=2"' in first and "下一节" in first and "上一章" not in first and "上一节" not in first
    last = env.client.get("/bank/A", params={"kp": "3"}).text
    assert 'href="/bank/B?kp=1"' in last and "下一章" in last
    assert 'href="/bank/A?kp=3"' in env.client.get("/bank/B", params={"kp": "1"}).text
    assert "上一章" in env.client.get("/bank/B", params={"kp": "1"}).text


def test_chapter_page_puts_the_tree_position_back_right_after_the_tree(env):
    page = env.client.get("/bank/A", params={"kp": "1"}).text
    after_tree = page[page.index("</nav>", page.index('id="kp-tree"')):]
    assert re.match(r"</nav>\s*<script>[^<]*dgy-tree-scroll", after_tree)


def test_chapter_page_keeps_its_controls_in_the_top_bar(env):
    page = env.client.get("/bank/A", params={"kp": "1"}).text
    bar = page[page.index('<header class="topbar">'):page.index("</header>")]
    for part in ("js-tree-toggle", "js-top-pin", "js-done-bar", "下一节"):
        assert part in bar
    assert "js-tree-pin" not in page
    head = page[page.index('<header class="drill-head">'):]
    assert head.index('class="card-filters"') < head.index("</header>")  # the filters share the title row


def test_only_chapter_pages_have_the_tree_button_and_no_page_shows_a_brand(env):
    for path in ("/", "/bank", "/knowledge", "/history", "/settings", "/bank/A"):
        page = env.client.get(path).text
        assert 'class="brand' not in page
        assert "大观园" not in visible(page[page.index("<body"):])
        assert ("js-tree-toggle" in page) == (path == "/bank/A")


def test_grading_from_the_chapter_page_can_be_changed_all_day(env):
    r = env.client.post("/q/4/grade", data={"owner": "local", "grade": "mastered", "back": "/bank/B?kp=1#q-4"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/B?kp=1#q-4"
    page = env.client.get("/bank/B").text
    assert 'class="qc-grade qc-grade-mastered is-picked">掌握</button>' in page
    assert not re.search(r"qc-grade[^>]*disabled", page) and "今天已评" not in page
    assert "chip-mastered" in env.client.get("/q/4").text
    # a misclick is put right: the grade changes and it is still one review today
    grade(env, 4, "unknown")
    changed = env.client.get("/q/4").text
    assert len(re.findall(r"chip-unknown", changed)) == 2  # status chip and the one history row
    assert "chip-mastered" not in changed
    assert 'class="qc-grade qc-grade-unknown is-picked">不会</button>' in env.client.get("/bank/B").text
    # the picked grade again changes nothing
    grade(env, 4, "unknown")
    assert len(re.findall(r"chip-unknown", env.client.get("/q/4").text)) == 2
    # the next study day it is a new review
    env.clock.at += timedelta(days=1)
    grade(env, 4, "shaky")
    detail = visible(env.client.get("/q/4").text)
    assert "不熟练/错误" in detail and "完全不会" in detail


def test_chapter_grade_ignores_bad_input(env):
    r = env.client.post("/q/4/grade", data={"owner": "local", "grade": "perfect"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/B#q-4"
    assert "is-picked" not in env.client.get("/bank/B").text
    assert env.client.post("/q/999/grade", data={"owner": "local", "grade": "mastered"}).status_code == 404
    r = env.client.post("/q/4/grade", data={"owner": "local", "grade": "shaky", "back": "//evil.example"}, follow_redirects=False)
    assert r.headers["location"] == "/bank/B#q-4"


def test_the_page_script_grades_without_a_reload(env):
    ask = {"Accept": "application/json"}
    r = env.client.post("/q/4/grade", data={"owner": "local", "grade": "mastered"}, headers=ask, follow_redirects=False)
    assert r.status_code == 200
    panel = r.json()["history"]
    assert "下次复习" in panel and "已做 1 次" in panel and panel.count("chip-mastered") == 1
    assert panel in env.client.get("/bank/B").text  # the card's 做题记录 as the page has it
    # changing the grade: the panel follows, still one review
    panel = env.client.post("/q/4/grade", data={"owner": "local", "grade": "unknown", "mode": "warmup"}, headers=ask).json()["history"]
    assert "chip-unknown" in panel and "chip-mastered" not in panel and "已做 1 次" in panel
    assert review_modes(env) == [(4, "browse")]
    # bad input records nothing
    assert env.client.post("/q/4/grade", data={"owner": "local", "grade": "perfect"}, headers=ask).json()["history"] == panel
    untouched = env.client.post("/q/5/grade", data={"owner": "local", "grade": "perfect"}, headers=ask).json()["history"]
    assert "还没做过这道题" in untouched and "下次复习" not in untouched
    assert env.client.post("/q/999/grade", data={"owner": "local", "grade": "mastered"}, headers=ask).status_code == 404


def test_cards_and_counts_carry_what_the_page_script_updates(env):
    grade(env, 4, "mastered")
    page = env.client.get("/bank/B", params={"kp": "1"}).text
    # a question never graded is marked, so its first grade adds one to 做过
    assert "data-new" not in re.search(r'<article [^>]*id="q-4"[^>]*>', page).group(0)
    assert "data-new" in re.search(r'<article [^>]*id="q-5"[^>]*>', page).group(0)
    assert page.count('<span class="js-done">1</span>') == 2  # the heading and the current 考点 in the tree
    assert page.count('js-done-bar" data-total="2"') == 2
    assert "做过 1 / 2 题" in visible(page)


def test_chapter_cards_fold_away_knowledge_and_history_instead_of_a_details_link(tagged):
    page = tagged.client.get("/bank/A", params={"kp": "1"}).text
    assert ">详情</a>" not in page
    assert 'aria-controls="qk-1"' in page and 'aria-controls="qh-1"' in page
    assert 'id="qk-1"' in page and 'data-anchor="1-函数基础"' in page  # opens in the knowledge drawer
    assert "还没做过这道题" in page
    untagged = tagged.client.get("/bank/A", params={"kp": "2"}).text
    assert "这道题还没有逐题标注" in untagged and 'href="/knowledge/01?tab=text"' in untagged
    tagged.client.post("/q/1/grade", data={"owner": "local", "grade": "shaky"})
    graded = tagged.client.get("/bank/A", params={"kp": "1"}).text
    assert re.search(r'id="qh-1"[\s\S]*?chip chip-shaky">不熟练/错误', graded) and "下次复习" in graded


def test_excluded_questions_stay_on_the_chapter_page_as_a_header_only(env):
    page = env.client.get("/bank/B", params={"kp": "2"}).text
    assert 'id="q-6"' in page and 'class="qcard is-excluded"' in page
    assert 'action="/q/6/grade"' not in page and "恢复，要做" in page


def test_chapter_page_shows_the_correct_option_and_questions_as_text(texted):
    page = texted.client.get("/bank/A", params={"kp": "1"}).text
    assert '<li data-correct><b>C.</b>' in page and '<li><b>A.</b>' in page
    assert 'class="qtext"' in page and 'katex.min.js' in page
    assert re.search(r'class="qcard"[^>]*data-choice', page)
    assert "勘误" in page


def test_knowledge_pages(env):
    index = env.client.get("/knowledge").text
    assert "函数、极限与连续" in index and "线性代数" in index and "核对说明" in index
    assert "k/gaoshu-010.webp" in env.client.get("/knowledge/01").text
    text = env.client.get("/knowledge/01", params={"tab": "text"}).text
    assert 'class="math inline"' in text and 'id="1-函数基础"' in text
    assert "k/xiandai-001.webp" in env.client.get("/knowledge/xiandai", params={"tab": "text"}).text
    assert env.client.get("/knowledge/zz").status_code == 404


def test_history_lists_reviews(env):
    grade(env, 1, "mastered")
    page = env.client.get("/history").text
    assert "10月16日" in page and "#001" in page


def test_settings_change_exam_date(env):
    r = env.client.post("/settings", data={"owner": "local", "exam_date": "2026-12-20", "warmup_days": "2"}, follow_redirects=False)
    assert r.status_code == 303
    assert "还有 65 天" in visible(env.client.get("/").text)


def test_content_images_are_served(env):
    assert env.client.get("/content/q/001.webp").content == b"img"


def test_webp_images_get_an_image_content_type(env):
    # Windows' registry often lacks .webp, which made browsers refuse to show the images.
    assert env.client.get("/content/q/001.webp").headers["content-type"] == "image/webp"


def test_daily_backup_is_made_on_first_visit(env):
    env.client.get("/")
    assert (env.settings.data_dir / "backups" / "app-20261016.db").exists()


def test_password_protects_pages_and_images(tmp_path):
    env = _make_env(tmp_path, password="pw")
    r = env.client.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/login")
    assert env.client.get("/content/q/001.webp", follow_redirects=False).status_code == 303
    assert "密码不对" in env.client.post("/login", data={"password": "nope", "next": "/"}).text
    r = env.client.post("/login", data={"password": "pw", "next": "/bank"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank"
    assert env.client.get("/").status_code == 200


def test_grade_owner_and_accessible_status(env):
    page = env.client.get("/bank/A").text
    assert 'data-grade-owner="local"' in page
    assert 'name="owner" value="local"' in page
    assert 'role="status" aria-live="polite" aria-atomic="true"' in page
    assert 'value="mastered" aria-pressed="false"' in page
    for owner in ("", "someone-else"):
        result = env.client.post("/q/1/grade", data={"owner": owner, "grade": "unknown"})
        assert result.status_code == 409
    assert review_modes(env) == []
    grade(env, 1, "mastered")
    assert 'value="mastered" aria-pressed="true"' in env.client.get("/bank/A?kp=1").text


def test_login_page_does_not_replay_pending_grades(tmp_path):
    protected = _make_env(tmp_path, password="test-password")
    assert 'data-grade-owner=""' in protected.client.get("/login").text


def test_login_page_is_titled_login(tmp_path):
    page = _make_env(tmp_path, password="test-password").client.get("/login").text
    assert "<h1>登录</h1>" in page and "大观园" not in visible(page[page.index("<body"):])


def test_long_break_warmup_matches_home(env):
    grade(env, 1, "unknown")
    env.clock.at += timedelta(days=500)
    assert 'data-warmup-count="1"' in env.client.get("/").text
    assert 'id="q-1"' in env.client.get("/review/warmup").text


def test_other_mutations_require_page_owner(env):
    for owner in ("", "wrong"):
        for path, form in [("/bank/exclude", {"nums": "1", "excluded": "1"}),
                           ("/settings", {"exam_date": "2027-01-01"}), ("/logout", {})]:
            assert env.client.post(path, data={"owner": owner, **form}, follow_redirects=False).status_code == 409
    assert 'name="owner" value="local"' in env.client.get("/settings").text
    assert "不做了" not in env.client.get("/bank/A?kp=1").text


def test_grade_rejects_expired_study_day(env):
    r = env.client.post("/q/1/grade", data={"owner": "local", "day": "2026-10-15", "grade": "mastered"})
    assert r.status_code == 422 and r.json()["code"] == "day_changed"
    assert review_modes(env) == []
    env.client.post("/q/1/grade", data={"owner": "local", "day": "2026-10-16", "grade": "mastered"})
    env.clock.at += timedelta(days=1)
    env.client.post("/q/1/grade", data={"owner": "local", "day": "2026-10-17", "grade": "mastered"})
    assert len(review_modes(env)) == 2


def test_card_filter_keeps_original_number_and_overall_progress(env):
    grade(env, 4, "unknown")
    page = env.client.get("/bank/B?kp=1&status=new").text
    assert 'id="q-4"' not in page and 'id="q-5"' in page
    assert 'title="#005">2</strong>' in page
    assert "做过 1 / 2 题" in visible(page)
    assert "没有符合筛选的题目" in env.client.get("/bank/B?kp=1&status=shaky").text


def test_search_tokens_subject_and_status(tmp_path):
    from .factories import two_books
    env = _make_env(tmp_path, bank=two_books())
    grade(env, 1, "unknown")
    page = env.client.get("/bank/search", params={"q": "2004   有界", "subject": "gaoshu", "status": "unknown"}).text
    assert "找到 1 题" in visible(page) and 'href="/q/1"' in page
    page = env.client.get("/bank/search", params={"subject": "xiandai", "status": "new"}).text
    assert "找到 3 题" in visible(page) and 'href="/q/1"' not in page
    r = env.client.get("/bank/search", params={"q": "线 １"}, follow_redirects=False)
    assert r.headers["location"] == "/q/1001"
    assert "没有找到" in env.client.get("/bank/search?q=1&subject=xiandai").text


def test_solution_image_zoom_link_and_day_metadata(env):
    page = env.client.get("/bank/A").text
    assert 'class="solution-zoom" href="/content/s/001-1.webp?v=' in page
    assert 'aria-label="放大解析图片"' in page
    assert 'title="点按放大"' not in page
    assert 'data-study-day="2026-10-16"' in page
    assert 'name="day" value="2026-10-16"' in page


def test_expired_login_json_is_actionable(tmp_path):
    env = _make_env(tmp_path, password="pw")
    r = env.client.post("/q/1/grade", data={"owner": "local", "grade": "unknown"}, headers={"Accept": "application/json"})
    assert r.status_code == 401 and r.json()["code"] == "login_required"


JSON_ACCEPT = {"Accept": "application/json"}


def test_a_note_is_saved_without_a_redirect_and_shown_where_the_question_is(env):
    r = env.client.post("/q/1/note", data={"owner": "local", "note": "令 x-1=t\r\n然后分段"}, headers=JSON_ACCEPT)
    assert (r.status_code, r.json()) == (200, {"saved": True})
    page = env.client.get("/bank/A", params={"kp": "1"}).text
    assert "令 x-1=t\n然后分段</textarea>" in page
    assert 'js-qc-toggle has-note" aria-expanded="false" aria-controls="qn-1"' in page
    assert 'js-qc-toggle" aria-expanded="false" aria-controls="qn-2"' in env.client.get("/bank/A", params={"kp": "2"}).text
    assert "令 x-1=t\n然后分段</textarea>" in env.client.get("/q/1").text
    env.client.post("/q/1/grade", data={"owner": "local", "grade": "mastered", "mode": "warmup"})
    assert "令 x-1=t\n然后分段</textarea>" in env.client.get("/review/warmup").text


def test_a_note_can_come_as_multipart_as_the_page_script_sends_it(env):
    r = env.client.post("/q/1/note", files={"owner": (None, "local"), "note": (None, "思路")}, headers=JSON_ACCEPT)
    assert r.status_code == 200
    assert "思路</textarea>" in env.client.get("/q/1").text


def test_a_note_form_without_the_script_goes_back_to_the_card(env):
    r = env.client.post("/q/4/note", data={"owner": "local", "note": "思路", "back": "/bank/B?kp=1#q-4"}, follow_redirects=False)
    assert (r.status_code, r.headers["location"]) == (303, "/bank/B?kp=1#q-4")
    r = env.client.post("/q/4/note", data={"owner": "local", "note": "思路", "back": "https://example.com"}, follow_redirects=False)
    assert r.headers["location"] == "/bank/B#q-4"


def test_a_blank_note_removes_it_and_its_mark(env):
    env.client.post("/q/1/note", data={"owner": "local", "note": "思路"})
    env.client.post("/q/1/note", data={"owner": "local", "note": "  \n"})
    page = env.client.get("/bank/A", params={"kp": "1"}).text
    assert "has-note" not in page
    assert "思路</textarea>" not in page


def test_a_note_is_refused_for_a_stale_page_an_unknown_question_or_too_much_text(env):
    assert env.client.post("/q/1/note", data={"owner": "other", "note": "思路"}).status_code == 409
    assert env.client.post("/q/1/note", data={"note": "思路"}).status_code == 409
    assert env.client.post("/q/999/note", data={"owner": "local", "note": "思路"}).status_code == 404
    r = env.client.post("/q/1/note", data={"owner": "local", "note": "字" * 10001}, headers=JSON_ACCEPT)
    assert (r.status_code, r.json()["code"]) == (422, "note_too_long")
    assert "has-note" not in env.client.get("/bank/A", params={"kp": "1"}).text
    assert env.client.post("/q/1/note", data={"owner": "local", "note": "字" * 10000}, headers=JSON_ACCEPT).status_code == 200


def test_a_note_cannot_break_out_of_its_box(env):
    env.client.post("/q/1/note", data={"owner": "local", "note": "</textarea><script>alert(1)</script>"})
    for page in (env.client.get("/bank/A", params={"kp": "1"}).text, env.client.get("/q/1").text):
        assert "<script>alert(1)" not in page
        assert "&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;</textarea>" in page
