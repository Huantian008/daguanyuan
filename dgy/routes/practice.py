from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request

from .. import db
from ..queues import QueueSpec, build_queue
from ..srs import GRADES
from ..web import bank, get_conn, now, redirect, render, today, user_state, warmup_days

router = APIRouter()


def _int_or_none(text: str) -> int | None:
    return int(text) if text.strip().isdigit() else None


@router.post("/practice/start")
def start(request: Request, mode: str = Form(...), chapter: str = Form(""), section: str = Form(""),
          kp: str = Form(""), only: str = Form("all"), nums: str = Form(""), count: str = Form("10"),
          conn=Depends(get_conn)):
    content = bank(request)
    day = today(request)
    state = user_state(conn, content)
    spec = QueueSpec(
        mode=mode,
        chapter=chapter or None,
        section=section or None,
        kp=kp or None,
        only=only if only in ("all", "new", "weak") else "all",
        nums=tuple(n for n in (_int_or_none(x) for x in nums.split(",")) if n),
        count=_int_or_none(count) or 10,
    )
    try:
        title, queue = build_queue(spec, content, state.cards, db.review_log(conn, since=day - timedelta(days=60)),
                                   state.excluded, day, warmup_days(conn))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    sid = db.create_session(conn, title, mode, queue, now(request))
    return redirect(f"/practice/{sid}")


@router.get("/practice/{sid}")
def show(request: Request, sid: int, conn=Depends(get_conn)):
    session = db.get_session(conn, sid)
    if session is None:
        raise HTTPException(404, "没有这组练习")
    content = bank(request)
    if session.current is None:
        return render(request, "practice_done.html", nav="practice", session=session,
                      grades=db.session_grades(conn, sid))
    q = content.questions[session.current]
    state = user_state(conn, content)
    return render(
        request, "practice.html",
        nav="practice",
        session=session,
        q=q,
        card=state.cards.get(q.num),
        status=state.status(q.num),
        history=db.history_for(conn, q.num)[-5:],
        knowledge=[content.knowledge_entry(s) for s in content.chapter_links.get(q.chapter, [])],
    )


@router.post("/practice/{sid}/grade")
def grade(request: Request, sid: int, num: int = Form(...), grade: str = Form(...), elapsed: str = Form(""),
          conn=Depends(get_conn)):
    session = db.get_session(conn, sid)
    if session is None:
        raise HTTPException(404, "没有这组练习")
    if session.current == num and grade in GRADES:
        db.record_review(conn, num, grade, now(request), _int_or_none(elapsed), session.mode, session_id=sid)
        db.advance_session(conn, sid, now(request))
    return redirect(f"/practice/{sid}")


@router.post("/practice/{sid}/skip")
def skip(request: Request, sid: int, num: int = Form(...), conn=Depends(get_conn)):
    session = db.get_session(conn, sid)
    if session is None:
        raise HTTPException(404, "没有这组练习")
    if session.current == num:
        db.advance_session(conn, sid, now(request))
    return redirect(f"/practice/{sid}")
