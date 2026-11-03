from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse

from .. import db, stats
from ..content import parse_label
from ..drill import default_kp, drill_kps, kp_tree
from ..search import STATUSES, SUBJECTS, matches, normalize
from ..srs import GRADES
from ..studyday import study_day
from ..web import bank, fragment, get_conn, now, redirect, render, require_owner, safe_back, today, user_state, wants_json
from .review import REVIEW_PAGES

router = APIRouter()

NOTE_LIMIT = 10000  # the note box's maxlength in _macros.html


@router.get("/bank")
def chapters(request: Request, conn=Depends(get_conn)):
    content = bank(request)
    state = user_state(conn, content)
    groups: list[tuple[str, list]] = []
    for p in stats.chapter_progress(content, state.cards, state.excluded):
        nums = [q.num for q in content.in_chapter(p.code) if q.num in state.active]
        if not groups or groups[-1][0] != p.group:
            groups.append((p.group, []))
        groups[-1][1].append((p, stats.mastery_distribution(nums, state.cards)))
    return render(request, "bank.html", nav="bank", groups=groups)


@router.get("/bank/search")
def search(request: Request, q: str = "", subject: str = "all", status: str = "all", conn=Depends(get_conn)):
    content = bank(request)
    state = user_state(conn, content)
    subject = subject if subject in SUBJECTS else "all"
    status = status if status in STATUSES else "all"
    term = normalize(q).strip().lstrip("#")
    num = parse_label("".join(term.split()))

    def accepted(question):
        return matches(question, content.texts.get(question.num), "" if question.num == num else term,
                       subject, status, state.status(question.num))

    if num in content.questions and accepted(content.questions[num]):
        return redirect(f"/q/{num}")
    found = [question for _, question in sorted(content.questions.items())
             if (term or subject != "all" or status != "all") and accepted(question)
             and (num not in content.questions or question.num == num)]
    return render(request, "search.html", nav="bank", q=q, found=found, state=state,
                  texts=content.texts, subject=subject, status=status)


@router.get("/bank/{code}")
def chapter(request: Request, code: str, kp: str = "", status: str = "all", conn=Depends(get_conn)):
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
    status = status if status in ("all", "new", "unknown", "shaky") else "all"
    visible_questions = [(i, q) for i, q in enumerate(current.questions, 1) if status == "all" or state.status(q.num) == status]
    if status != "all":
        prev = (prev[0], prev[1] + "&status=" + status) if prev else None
        following = (following[0], following[1] + "&status=" + status) if following else None
    nums = [q.num for _, q in visible_questions]
    return render(request, "bank_chapter.html", nav="bank", chapter=content.chapter(code), chapters=content.chapters,
                  tree=kp_tree(kps), current=current, prev=prev, following=following, state=state,
                  status_filter=status, visible_questions=visible_questions,
                  texts=content.texts, graded_today=db.graded_on(conn, today(request)),
                  sections={num: content.sections_for(num) for num in nums}, titles=content.knowledge_titles(),
                  knowledge=[content.knowledge_entry(s) for s in content.chapter_links.get(code, [])],
                  histories=db.histories_for(conn, nums), notes=db.notes_for(conn, nums))


@router.post("/bank/exclude", dependencies=[Depends(require_owner)])
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
def grade(request: Request, num: int, grade: str = Form(""), back: str = Form(""), mode: str = Form(""),
          owner: str = Form(""), day: str = Form(""), conn=Depends(get_conn)):
    """Grade a question from the chapter page or a review page.
    Grading it again the same study day changes that day's grade. The page script gets the card's 做题记录 back instead
    of a redirect, so the page stays where it is."""
    content = bank(request)
    q = content.questions.get(num)
    if q is None:
        raise HTTPException(404, "没有这道题")
    if owner != "local":
        raise HTTPException(409, "评价所属账号不一致，请刷新页面后重试。")
    at = now(request)
    if day and day != study_day(at).isoformat():
        return JSONResponse({"code": "day_changed", "error": "这条评价已跨学习日，请核对后重新评价。"}, status_code=422)
    if grade in GRADES:
        db.record_review(conn, num, grade, at, mode if mode in REVIEW_PAGES else "browse")
    if wants_json(request):
        return {"history": fragment("history_panel", db.histories_for(conn, [num])[num], db.get_card(conn, num))}
    return redirect(safe_back(back, f"/bank/{q.chapter}#q-{num}"))


@router.post("/q/{num}/note", dependencies=[Depends(require_owner)])
def save_note(request: Request, num: int, note: str = Form(""), back: str = Form(""), conn=Depends(get_conn)):
    """Save a question's note, or remove it when blank. The page script gets JSON instead of a redirect, so the page
    stays where it is."""
    q = bank(request).questions.get(num)
    if q is None:
        raise HTTPException(404, "没有这道题")
    body = note.replace("\r\n", "\n")
    if len(body) > NOTE_LIMIT:
        return JSONResponse({"code": "note_too_long", "error": f"笔记最多 {NOTE_LIMIT} 字。"}, status_code=422)
    db.set_note(conn, num, body, now(request))
    if wants_json(request):
        return {"saved": True}
    return redirect(safe_back(back, f"/bank/{q.chapter}#q-{num}"))


@router.get("/q/{num}")
def question(request: Request, num: int, conn=Depends(get_conn)):
    content = bank(request)
    q = content.questions.get(num)
    if q is None:
        raise HTTPException(404, "没有这道题")
    state = user_state(conn, content)
    kp_index = next(k.index for k in drill_kps(content, q.chapter, state.status) if q in k.questions)
    prev, following = content.neighbors(num)
    return render(
        request, "question.html",
        nav="bank",
        q=q,
        kp_index=kp_index,
        chapter=content.chapter(q.chapter),
        card=state.cards.get(num),
        status=state.status(num),
        history=db.history_for(conn, num),
        note=db.notes_for(conn, [num]).get(num, ""),
        knowledge=[content.knowledge_entry(s) for s in content.chapter_links.get(q.chapter, [])],
        sections=content.sections_for(num),
        titles=content.knowledge_titles(),
        text=content.text(num),
        prev=prev,
        next=following,
    )
