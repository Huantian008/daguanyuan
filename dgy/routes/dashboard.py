from datetime import timedelta

from fastapi import APIRouter, Depends, Request

from .. import db, stats
from ..drill import kp_index_of, onward_kp
from ..studyday import calendar_day
from ..web import bank, exam_date, get_conn, now, render, today, user_state, warmup_days

router = APIRouter()


@router.get("/")
def dashboard(request: Request, conn=Depends(get_conn)):
    content = bank(request)
    day = today(request)
    state = user_state(conn, content)
    reviews = db.review_log(conn, since=day - timedelta(days=400))
    totals = stats.daily_totals(reviews, day, days=30)
    last = stats.last_drilled(reviews, lambda num: num in content.questions)
    onward = onward_kp(content, state.status, content.questions[last] if last is not None else None)
    # the date and countdown at the top turn at midnight; everything else goes by the study day
    date = calendar_day(now(request))
    return render(
        request, "dashboard.html",
        nav="home",
        date=date,
        days_left=(exam_date(conn) - date).days,
        warmup=stats.warmup_queue(db.warmup_log(conn, day, warmup_days(conn)), state.active, day, warmup_days(conn)),
        due=stats.due_queue(state.cards, state.active, day),
        onward=onward and (onward[0], content.chapter(onward[0]).name, onward[1]),
        resumed=last is not None,
        onward_num=next((q.num for q in onward[1].questions if state.status(q.num) == "new"), None) if onward else None,
        progress=stats.chapter_progress(content, state.cards, state.excluded),
        dist=stats.mastery_distribution(state.active, state.cards),
        active_total=len(state.active),
        weak=[(s, kp_index_of(content, s.chapter, s.section, s.kp, state.status))
              for s in stats.weak_spots(content, state.cards, state.excluded, top=3)],
        chapter_names={c.code: c.name for c in content.chapters},
        totals=totals,
        today_total=totals[-1],
        max_count=max([t.count for t in totals] + [1]),
        streak=stats.streak({r.study_day for r in reviews}, day),
    )
