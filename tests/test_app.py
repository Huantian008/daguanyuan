import json
import re
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


def _make_env(tmp_path, password=None, links=None, texts=None):
    content = tmp_path / "content"
    bank = small_bank()
    bank["knowledge"] = KNOWLEDGE
    content.mkdir()
    (content / "manifest.json").write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
    srcs = [q["img"]["src"] for q in bank["questions"]] + [q["answer"]["src"] for q in bank["questions"]]
    srcs += [s["src"] for q in bank["questions"] for s in q["solution"]] + [p["src"] for k in KNOWLEDGE for p in k["pages"]]
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
    if texts:
        bank_dir = tmp_path / "bank"
        bank_dir.mkdir()
        (bank_dir / "questions.json").write_text(json.dumps({"version": 1, "questions": texts}, ensure_ascii=False),
                                                 encoding="utf-8")
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


def start(env, **form):
    r = env.client.post("/practice/start", data=form, follow_redirects=False)
    assert r.status_code == 303
    return r.headers["location"]


def grade(env, url, num, value):
    r = env.client.post(url + "/grade", data={"num": str(num), "grade": value},
                        follow_redirects=False)
    assert r.status_code == 303


def test_dashboard_shows_exam_countdown_and_empty_queues(env):
    page = env.client.get("/").text
    assert "还有 64 天" in visible(page)
    assert 'data-due-count="0"' in page and 'data-warmup-count="0"' in page
    # nothing to warm up or review: a calm note instead of a disabled button
    assert "今天不用热身" in page and "今天没有到期的题" in page and "disabled" not in page
    # no open session: what is left over the whole bank (#6 is excluded), and the only primary button
    assert "<b>5</b> 题没做过" in page and '<a class="btn btn-primary" href="/bank">去题库选题</a>' in page


def test_practice_by_chapter_grades_and_moves_to_next_question(env):
    url = start(env, mode="group", chapter="A")
    page = env.client.get(url).text
    assert "#001" in page
    for src in ("q/001.webp", "a/001.webp", "s/001-1.webp"):
        assert src in page
    grade(env, url, 1, "unknown")
    assert "#002" in env.client.get(url).text
    assert 'data-dist-unknown="1"' in env.client.get("/").text


def test_practice_page_has_no_timer(env):
    page = env.client.get(start(env, mode="group", chapter="A")).text
    assert "timer" not in page and 'name="elapsed"' not in page


def test_practice_page_switches_work_without_javascript(env):
    page = env.client.get(start(env, mode="group", chapter="A")).text
    assert ('<button type="button" class="reveal-toggle js-reveal" aria-expanded="false" aria-controls="answer">'
            in page)
    assert 'aria-controls="knowledge"' in page
    # Both panels are in the page and not hidden: without JavaScript they simply show.
    assert '<section id="answer" class="reveal-panel"' in page
    assert '<section id="knowledge" class="reveal-panel"' in page
    assert "这道题还没有逐题标注" in page and 'href="/knowledge/01?tab=text"' in page


@pytest.fixture
def tagged(tmp_path):
    return _make_env(tmp_path, links={"1": ["01/1"], "3": ["01/1"]})


def test_tagged_question_links_to_its_knowledge_section(tagged):
    page = tagged.client.get(start(tagged, mode="group", chapter="A")).text
    assert 'href="/knowledge/01?tab=text#1-函数基础"' in page and 'data-anchor="1-函数基础"' in page
    assert 'href="/knowledge/01#p1"' in page and "原版第 1 页" in page
    assert "这道题还没有逐题标注" not in page
    detail = visible(tagged.client.get("/q/1").text)
    assert "相关知识点" in detail and "1 函数基础" in detail


def test_knowledge_text_lists_the_questions_of_each_section(tagged):
    grade(tagged, start(tagged, mode="group", chapter="A"), 1, "shaky")
    block = tagged.client.get("/knowledge/01?tab=text").text.split('id="1-函数基础"', 1)[1]
    assert 'class="section-qs"' in block
    assert '<a class="chip chip-shaky" href="/q/1">001</a>' in block and 'href="/q/3"' in block
    assert 'name="nums" value="1,3"' in block and "练这 2 题" in block


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


def test_practice_shows_the_question_as_text_with_a_switch_to_the_image(texted):
    page = texted.client.get(start(texted, mode="group", chapter="A")).text
    assert '<div class="qview" data-view="text">' in page
    assert '<span class="math inline">f(x)=\\dfrac{1}{x}</span>' in page
    assert '<li><b>D.</b> 4.</li>' in page  # inline: not turned into a numbered list
    assert re.search(r'class="qview-toggle js-qview"[^>]*hidden>原图</button>', page)
    assert 'katex.min.css' in page and 'katex.min.js' in page
    assert re.search(r'class="qimg"[^>]*loading="lazy"', page)  # the image waits until it is shown


def test_answer_shows_the_option_and_the_erratum(texted):
    page = texted.client.get(start(texted, mode="group", chapter="A")).text
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
    page = env.client.get(start(env, mode="group", chapter="A")).text
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


def test_grading_a_question_that_is_not_current_is_ignored(env):
    url = start(env, mode="group", chapter="A")
    grade(env, url, 3, "mastered")
    assert "#001" in env.client.get(url).text
    assert 'data-dist-mastered="0"' in env.client.get("/").text


def test_next_day_offers_warmup_and_due_review(env):
    url = start(env, mode="group", chapter="A")
    grade(env, url, 1, "shaky")
    env.clock.at += timedelta(days=1)
    page = env.client.get("/").text
    assert 'data-warmup-count="1"' in page and 'data-due-count="1"' in page
    assert "开始热身" in page and "开始复习" in page and "今天不用热身" not in page
    # warm-up comes first tonight, so it alone gets the primary button
    assert '<button class="btn btn-primary">开始热身</button>' in page
    assert '<button class="btn">开始复习</button>' in page
    assert re.search(r'<a class="btn" href="/practice/[^"]+">继续上次</a>', page) and "换个考点" in page
    assert "#001" in env.client.get(start(env, mode="due")).text


def test_finishing_a_session_shows_a_summary(env):
    url = start(env, mode="single", nums="2")
    grade(env, url, 2, "mastered")
    page = env.client.get(url).text
    assert "这组做完了" in page and "完全掌握 1" in page


def test_excluding_a_kp_removes_it_from_queues(env):
    r = env.client.post("/bank/exclude", data={"chapter": "A", "section": "函数性质", "kp": "有界",
                                               "excluded": "1", "back": "/bank/A"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/A"
    assert "#002" in env.client.get(start(env, mode="group", chapter="A")).text
    assert "不做" in env.client.get("/q/1").text


def test_question_6_is_excluded_by_default_and_can_be_restored(env):
    assert "仅数一" in env.client.get("/q/6").text
    assert "#006" not in env.client.get(start(env, mode="group", chapter="B", kp="隐函数求导")).text
    env.client.post("/bank/exclude", data={"nums": "6", "excluded": "0", "back": "/q/6"})
    assert "#006" in env.client.get(start(env, mode="group", chapter="B", kp="隐函数求导")).text


def test_question_page_and_search(env):
    page = env.client.get("/q/1").text
    assert "有界" in page and "2004数三" in page and "a/001.webp" in page
    r = env.client.get("/bank/search", params={"q": "3"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/q/3"
    assert "#001" in env.client.get("/bank/search", params={"q": "2004"}).text
    assert env.client.get("/q/999").status_code == 404


def test_random_practice_still_works_but_the_bank_page_no_longer_offers_it(env):
    assert 'name="mode" value="random"' not in env.client.get("/bank").text
    first = env.client.get(start(env, mode="random", only="new")).text
    assert "随机" in first and "#00" in first


def test_one_by_one_practice_is_not_offered_where_the_chapter_page_replaces_it(env):
    chapter = env.client.get("/bank/A", params={"kp": "1"}).text
    assert "练这个考点" not in chapter and 'action="/practice/start"' not in chapter
    assert "整个考点不做了" not in chapter
    question = env.client.get("/q/4").text
    assert "练这道题" not in question and 'action="/practice/start"' not in question
    # the question page leads back to the card on the chapter page (#4 is in 考点 1 of chapter B)
    assert 'href="/bank/B?kp=1#q-4"' in question
    assert 'href="/bank/B?kp=2#q-6"' in env.client.get("/q/6").text
    assert "按考点往下刷" in env.client.get("/").text


def test_bank_pages(env):
    assert "函数极限连续" in env.client.get("/bank").text
    chapter = env.client.get("/bank/B").text
    assert "导数概念" in chapter and "基本概念题" in chapter
    assert env.client.get("/bank/Z").status_code == 404


def test_chapter_page_lays_out_one_kp_with_its_questions(env):
    page = env.client.get("/bank/B").text
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
    env.client.post("/q/1/grade", data={"grade": "mastered"})
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


def test_grading_from_the_chapter_page_is_recorded_once_a_day(env):
    r = env.client.post("/q/4/grade", data={"grade": "mastered", "back": "/bank/B?kp=1#q-4"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/B?kp=1#q-4"
    page = env.client.get("/bank/B").text
    assert "今天已评" in page and re.search(r"is-picked[^>]*disabled", page)
    assert "chip-mastered" in env.client.get("/q/4").text
    # a second click the same study day changes nothing: the card would otherwise jump a level
    env.client.post("/q/4/grade", data={"grade": "mastered"})
    env.client.post("/q/4/grade", data={"grade": "unknown"})
    assert len(re.findall(r"chip-mastered", env.client.get("/q/4").text)) == 2  # status chip and the one history row
    assert "完全不会" not in visible(env.client.get("/q/4").text)
    # the next study day it can be graded again
    env.clock.at += timedelta(days=1)
    env.client.post("/q/4/grade", data={"grade": "shaky"})
    assert "不熟练/错误" in visible(env.client.get("/q/4").text)


def test_chapter_grade_ignores_bad_input(env):
    r = env.client.post("/q/4/grade", data={"grade": "perfect"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/bank/B#q-4"
    assert "今天已评" not in env.client.get("/bank/B").text
    assert env.client.post("/q/999/grade", data={"grade": "mastered"}).status_code == 404
    r = env.client.post("/q/4/grade", data={"grade": "shaky", "back": "//evil.example"}, follow_redirects=False)
    assert r.headers["location"] == "/bank/B#q-4"


def test_chapter_cards_fold_away_knowledge_and_history_instead_of_a_details_link(tagged):
    page = tagged.client.get("/bank/A", params={"kp": "1"}).text
    assert ">详情</a>" not in page
    assert 'aria-controls="qk-1"' in page and 'aria-controls="qh-1"' in page
    assert 'id="qk-1"' in page and 'data-anchor="1-函数基础"' in page  # opens in the knowledge drawer
    assert "还没做过这道题" in page
    untagged = tagged.client.get("/bank/A", params={"kp": "2"}).text
    assert "这道题还没有逐题标注" in untagged and 'href="/knowledge/01?tab=text"' in untagged
    tagged.client.post("/q/1/grade", data={"grade": "shaky"})
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
    url = start(env, mode="group", chapter="A")
    grade(env, url, 1, "mastered")
    page = env.client.get("/history").text
    assert "10月16日" in page and "#001" in page


def test_settings_change_exam_date(env):
    r = env.client.post("/settings", data={"exam_date": "2026-12-20", "warmup_days": "2"}, follow_redirects=False)
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
