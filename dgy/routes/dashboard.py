from datetime import timedelta

from fastapi import APIRouter, Depends, Request

from .. import db, stats
from ..web import bank, exam_date, get_conn, render, today, user_state, warmup_days

router = APIRouter()


@router.get("/")
def dashboard(request: Request, conn=Depends(get_conn)):
    content = bank(request)
    day = today(request)
    state = user_state(conn, content)
    reviews = db.review_log(conn, since=day - timedelta(days=400))
    totals = stats.daily_totals(reviews, day, days=30)
    return render(
        request, "dashboard.html",
        nav="home",
        today=day,
        days_left=(exam_date(conn) - day).days,
        warmup=stats.warmup_queue(reviews, state.active, day, warmup_days(conn)),
        due=stats.due_queue(state.cards, state.active, day),
        open_session=db.latest_open_session(conn),
        progress=stats.chapter_progress(content, state.cards, state.excluded),
        dist=stats.mastery_distribution(state.active, state.cards),
        active_total=len(state.active),
        weak=stats.weak_spots(content, state.cards, state.excluded, top=3),
        chapter_names={c.code: c.name for c in content.chapters},
        totals=totals,
        today_total=totals[-1],
        max_count=max([t.count for t in totals] + [1]),
        streak=stats.streak({r.study_day for r in reviews}, day),
    )
