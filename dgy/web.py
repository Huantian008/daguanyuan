"""Helpers shared by the route modules: templates, DB connection, clock, the user's current state."""
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from sqlite3 import Connection

from fastapi import Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from . import db, stats
from .config import DEFAULT_EXAM_DATE, DEFAULT_WARMUP_DAYS
from .content import Content
from .srs import GRADE_LABELS, CardState
from .studyday import study_day

TEMPLATES = Jinja2Templates(directory=Path(__file__).parent / "templates")
_WEEKDAYS = "一二三四五六日"


def cn_date(d: date) -> str:
    return f"{d.month}月{d.day}日周{_WEEKDAYS[d.weekday()]}"


def minutes(seconds: int | None) -> int:
    return ((seconds or 0) + 30) // 60  # round half up, unlike round()


def stars(n: int) -> str:
    return "★" * n + "☆" * (5 - n)


def duration(seconds: int | None) -> str:
    if not seconds:
        return ""
    return f"{seconds} 秒" if seconds < 60 else f"{minutes(seconds)} 分钟"


TEMPLATES.env.filters.update(
    cn_date=cn_date,
    minutes=minutes,
    duration=duration,
    stars=stars,
    grade_label=lambda g: GRADE_LABELS.get(g, "未做"),
)


def get_conn(request: Request):
    conn = db.connect(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


def bank(request: Request) -> Content:
    return request.app.state.content


def now(request: Request) -> datetime:
    return request.app.state.clock()


def today(request: Request) -> date:
    return study_day(now(request))


@dataclass(frozen=True)
class UserState:
    cards: dict[int, CardState]
    excluded: set[int]
    active: set[int]

    def status(self, num: int) -> str:
        """CSS-friendly status: excluded / new / mastered / shaky / unknown."""
        if num in self.excluded:
            return "excluded"
        card = self.cards.get(num)
        return card.last_grade if card and card.last_grade else "new"


def user_state(conn: Connection, content: Content) -> UserState:
    excluded = stats.excluded_set(content, db.exclusion_overrides(conn))
    return UserState(db.all_cards(conn), excluded, set(content.questions) - excluded)


def exam_date(conn: Connection) -> date:
    return date.fromisoformat(db.get_setting(conn, "exam_date", DEFAULT_EXAM_DATE))


def warmup_days(conn: Connection) -> int:
    return int(db.get_setting(conn, "warmup_days", str(DEFAULT_WARMUP_DAYS)))


def render(request: Request, name: str, **context):
    return TEMPLATES.TemplateResponse(request, name, context)


def redirect(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=303)


def safe_back(url: str | None, default: str = "/") -> str:
    """Only allow redirects to paths on this site."""
    return url if url and url.startswith("/") and not url.startswith("//") else default
