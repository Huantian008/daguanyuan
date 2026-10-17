from fastapi import APIRouter, Depends, Form, HTTPException, Request

from .. import db, stats
from ..drill import default_kp, drill_kps, kp_tree
from ..srs import GRADES
from ..web import bank, get_conn, now, redirect, render, safe_back, today, user_state

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
def chapter(request: Request, code: str, kp: str = "", conn=Depends(get_conn)):
    content = bank(request)
    if code not in {c.code for c in content.chapters}:
        raise HTTPException(404, "没有这一章")
    state = user_state(conn, content)
    kps = drill_kps(content, code, state.status)
    asked = int(kp) if kp.isdigit() else 0
    current = kps[(asked if 1 <= asked <= len(kps) else default_kp(kps)) - 1]
    codes = [c.code for c in content.chapters]
    at = codes.index(code)
    if current.index > 1:
        prev = ("上一节", f"/bank/{code}?kp={current.index - 1}")
    elif at > 0:
        prev = ("上一章", f"/bank/{codes[at - 1]}?kp={len(drill_kps(content, codes[at - 1], state.status))}")
    else:
        prev = None
    if current.index < len(kps):
        following = ("下一节", f"/bank/{code}?kp={current.index + 1}")
    elif at + 1 < len(codes):
        following = ("下一章", f"/bank/{codes[at + 1]}?kp=1")
    else:
        following = None
    nums = [q.num for q in current.questions]
    return render(request, "bank_chapter.html", nav="bank", chapter=content.chapter(code), chapters=content.chapters,
                  tree=kp_tree(kps), current=current, prev=prev, following=following, state=state,
                  texts=content.texts, graded_today=db.graded_on(conn, today(request)),
                  sections={num: content.sections_for(num) for num in nums}, titles=content.knowledge_titles(),
                  knowledge=[content.knowledge_entry(s) for s in content.chapter_links.get(code, [])],
                  histories=db.histories_for(conn, nums))


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


@router.post("/q/{num}/grade")
def grade(request: Request, num: int, grade: str = Form(""), back: str = Form(""), conn=Depends(get_conn)):
    """Grade a question from the chapter page. A question graded today is left alone, so a double click is one review."""
    content = bank(request)
    q = content.questions.get(num)
    if q is None:
        raise HTTPException(404, "没有这道题")
    if grade in GRADES and num not in db.graded_on(conn, today(request)):
        db.record_review(conn, num, grade, now(request), "browse")
    return redirect(safe_back(back, f"/bank/{q.chapter}#q-{num}"))


@router.get("/q/{num}")
def question(request: Request, num: int, conn=Depends(get_conn)):
    content = bank(request)
    q = content.questions.get(num)
    if q is None:
        raise HTTPException(404, "没有这道题")
    state = user_state(conn, content)
    kp_index = next(k.index for k in drill_kps(content, q.chapter, state.status) if q in k.questions)
    return render(
        request, "question.html",
        nav="bank",
        q=q,
        kp_index=kp_index,
        chapter=content.chapter(q.chapter),
        card=state.cards.get(num),
        status=state.status(num),
        history=db.history_for(conn, num),
        knowledge=[content.knowledge_entry(s) for s in content.chapter_links.get(q.chapter, [])],
        sections=content.sections_for(num),
        titles=content.knowledge_titles(),
        text=content.text(num),
    )
