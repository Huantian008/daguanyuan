from fastapi import APIRouter, Depends, Form, HTTPException, Request

from .. import db, stats
from ..web import bank, get_conn, redirect, render, safe_back, user_state

router = APIRouter()


@router.get("/bank")
def chapters(request: Request, conn=Depends(get_conn)):
    content = bank(request)
    state = user_state(conn, content)
    rows = []
    for p in stats.chapter_progress(content, state.cards, state.excluded):
        nums = [q.num for q in content.in_chapter(p.code) if q.num in state.active]
        rows.append((p, stats.mastery_distribution(nums, state.cards)))
    return render(request, "bank.html", nav="bank", rows=rows)


@router.get("/bank/search")
def search(request: Request, q: str = "", conn=Depends(get_conn)):
    content = bank(request)
    term = q.strip().lstrip("#")
    if term.isdigit() and int(term) in content.questions:
        return redirect(f"/q/{int(term)}")
    found = [
        question for num, question in sorted(content.questions.items())
        if term and (term in question.source_full or term in question.source
                     or term in question.kp or term in question.section
                     or (num in content.texts and term in content.texts[num].search))
    ]
    return render(request, "search.html", nav="bank", q=q, found=found, state=user_state(conn, content),
                  texts=content.texts)


@router.get("/bank/{code}")
def chapter(request: Request, code: str, conn=Depends(get_conn)):
    content = bank(request)
    if code not in {c.code for c in content.chapters}:
        raise HTTPException(404, "没有这一章")
    return render(request, "bank_chapter.html", nav="bank", chapter=content.chapter(code),
                  outline=content.outline(code), state=user_state(conn, content))


@router.post("/bank/exclude")
def exclude(request: Request, excluded: str = Form(...), nums: str = Form(""), chapter: str = Form(""),
            section: str = Form(""), kp: str = Form(""), back: str = Form("/bank"), conn=Depends(get_conn)):
    content = bank(request)
    targets = [int(x) for x in nums.split(",") if x.strip().isdigit() and int(x) in content.questions]
    if kp:
        targets += [q.num for q in content.questions.values()
                    if q.kp == kp and (not chapter or q.chapter == chapter) and (not section or q.section == section)]
    db.set_excluded(conn, targets, excluded == "1")
    return redirect(safe_back(back, "/bank"))


@router.get("/q/{num}")
def question(request: Request, num: int, conn=Depends(get_conn)):
    content = bank(request)
    q = content.questions.get(num)
    if q is None:
        raise HTTPException(404, "没有这道题")
    state = user_state(conn, content)
    return render(
        request, "question.html",
        nav="bank",
        q=q,
        chapter=content.chapter(q.chapter),
        card=state.cards.get(num),
        status=state.status(num),
        history=db.history_for(conn, num),
        knowledge=[content.knowledge_entry(s) for s in content.chapter_links.get(q.chapter, [])],
        sections=content.sections_for(num),
        titles=content.knowledge_titles(),
        text=content.text(num),
    )
