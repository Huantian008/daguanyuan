import re

from fastapi import APIRouter, Depends, HTTPException, Request

from ..content import Content
from ..markdown import render_markdown
from ..web import TEMPLATES, UserState, bank, get_conn, render, user_state

router = APIRouter()


def _read(request: Request, name: str) -> str | None:
    path = request.app.state.settings.knowledge_md_dir / name
    return path.read_text(encoding="utf-8") if path.exists() else None


def inject_section_questions(html: str, slug: str, content: Content, state: UserState) -> str:
    """Put the questions tagged with each section of this chapter right under the section's heading."""
    macros = TEMPLATES.env.get_template("_macros.html").module
    for s in content.sections.values():
        nums = content.questions_for(s.key) if s.slug == slug else []
        if not nums:
            continue
        heading = re.compile(rf'<h{s.level} id="{re.escape(s.anchor)}">.*?</h{s.level}>', re.S)
        block = str(macros.section_questions(nums, state))
        html = heading.sub(lambda m: m.group(0) + block, html, count=1)
    return html


@router.get("/knowledge")
def index(request: Request):
    content = bank(request)
    groups: dict[str, list[dict]] = {}
    for entry in content.knowledge:
        groups.setdefault(entry["group"], []).append(entry)
    overview = _read(request, "00_总目录.md")
    return render(request, "knowledge_index.html", nav="knowledge", groups=groups,
                  overview=render_markdown(overview)[0] if overview else None)


@router.get("/knowledge/{slug}")
def page(request: Request, slug: str, tab: str = "original", conn=Depends(get_conn)):
    content = bank(request)
    entry = content.knowledge_entry(slug)
    if entry is None:
        raise HTTPException(404, "没有这一章知识点")
    markdown = _read(request, entry["md"]) if entry.get("md") else None
    if tab != "text" or markdown is None:
        tab = "original"
    state = user_state(conn, content)
    html, toc = render_markdown(markdown) if tab == "text" else ("", [])
    if html:
        html = inject_section_questions(html, slug, content, state)
    page_questions = [content.questions_on_page(slug, i) for i in range(1, len(entry["pages"]) + 1)]
    chapters = [c for c in content.chapters if slug in content.chapter_links.get(c.code, [])]
    return render(request, "knowledge_page.html", nav="knowledge", entry=entry, tab=tab, has_text=markdown is not None,
                  html=html, toc=toc, chapters=chapters, page_questions=page_questions, state=state)
