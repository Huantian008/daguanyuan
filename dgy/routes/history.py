from datetime import timedelta
from itertools import groupby

from fastapi import APIRouter, Depends, Request

from .. import db
from ..stats import TIMER_CAP_SEC
from ..web import bank, get_conn, render, today

router = APIRouter()


@router.get("/history")
def history(request: Request, conn=Depends(get_conn)):
    reviews = sorted(db.review_log(conn, since=today(request) - timedelta(days=60)),
                     key=lambda r: r.reviewed_at, reverse=True)
    days = []
    for day, items in groupby(reviews, key=lambda r: r.study_day):
        items = list(items)
        seconds = sum(min(r.elapsed_sec or 0, TIMER_CAP_SEC) for r in items)
        days.append((day, items, len({r.num for r in items}), seconds))
    return render(request, "history.html", nav="history", days=days, questions=bank(request).questions)
