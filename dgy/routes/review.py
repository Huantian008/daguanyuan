"""Warm-up and due review, laid out as cards like the chapter page."""
from fastapi import APIRouter, Depends, HTTPException, Request

from .. import db, stats
from ..web import bank, get_conn, render, today, user_state, warmup_days

router = APIRouter()

REVIEW_PAGES = {
    "warmup": {"title": "热身", "note": "把前几天做过的题再做一遍", "empty": "今天不用热身。"},
    "due": {"title": "到期复习", "note": "按复习间隔排到今天的题", "empty": "今天没有到期的题。"},
}


@router.get("/review/{mode}")
def review(request: Request, mode: str, conn=Depends(get_conn)):
    """Those graded here today stay on the page, above the ones left."""
    if mode not in REVIEW_PAGES:
        raise HTTPException(404, "没有这一页")
    content = bank(request)
    day = today(request)
    state = user_state(conn, content)
    reviews = db.warmup_log(conn, day, warmup_days(conn))
    if mode == "warmup":
        queue = stats.warmup_queue(reviews, state.active, day, warmup_days(conn))
    else:
        queue = stats.due_queue(state.cards, state.active, day)
    nums = stats.review_list(reviews, mode, day, queue)
    return render(request, "review.html", nav="home", mode=mode, page=REVIEW_PAGES[mode],
                  questions=[content.questions[n] for n in nums], state=state, texts=content.texts,
                  graded_today=db.graded_on(conn, day), sections={num: content.sections_for(num) for num in nums},
                  titles=content.knowledge_titles(),
                  knowledge={c.code: [content.knowledge_entry(s) for s in content.chapter_links.get(c.code, [])]
                             for c in content.chapters},
                  histories=db.histories_for(conn, nums))
