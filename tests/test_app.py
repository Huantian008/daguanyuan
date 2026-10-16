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


def _make_env(tmp_path, password=None):
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
    (md / "00_总目录.md").write_text("# 总目录\n\n核对说明\n", encoding="utf-8")
    (md / "01_函数极限连续.md").write_text("# 函数、极限与连续\n\n## 1. 函数基础\n\n若 $f'(x)$ 有界\n", encoding="utf-8")
    settings = Settings(content_dir=content, data_dir=tmp_path / "data", knowledge_md_dir=md,
                        password=password, secret_key="test-secret")
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


def grade(env, url, num, value, elapsed="90"):
    r = env.client.post(url + "/grade", data={"num": str(num), "grade": value, "elapsed": elapsed},
                        follow_redirects=False)
    assert r.status_code == 303


def test_dashboard_shows_exam_countdown_and_empty_queues(env):
    page = env.client.get("/").text
    assert "还有 64 天" in visible(page)
    assert 'data-due-count="0"' in page and 'data-warmup-count="0"' in page


def test_practice_by_chapter_grades_and_moves_to_next_question(env):
    url = start(env, mode="group", chapter="A")
    page = env.client.get(url).text
    assert "#001" in page
    for src in ("q/001.webp", "a/001.webp", "s/001-1.webp"):
        assert src in page
    grade(env, url, 1, "unknown")
    assert "#002" in env.client.get(url).text
    assert 'data-dist-unknown="1"' in env.client.get("/").text


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


def test_bank_pages(env):
    assert "函数极限连续" in env.client.get("/bank").text
    chapter = env.client.get("/bank/B").text
    assert "导数概念" in chapter and "基本概念题" in chapter


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
