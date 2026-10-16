from fastapi import APIRouter, HTTPException, Request

from ..markdown import render_markdown
from ..web import bank, render

router = APIRouter()


def _read(request: Request, name: str) -> str | None:
    path = request.app.state.settings.knowledge_md_dir / name
    return path.read_text(encoding="utf-8") if path.exists() else None


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
def page(request: Request, slug: str, tab: str = "original"):
    content = bank(request)
    entry = content.knowledge_entry(slug)
    if entry is None:
        raise HTTPException(404, "没有这一章知识点")
    markdown = _read(request, entry["md"]) if entry.get("md") else None
    if tab != "text" or markdown is None:
        tab = "original"
    html, toc = render_markdown(markdown) if tab == "text" else ("", [])
    chapters = [c for c in content.chapters if slug in content.chapter_links.get(c.code, [])]
    return render(request, "knowledge_page.html", nav="knowledge", entry=entry, tab=tab,
                  has_text=markdown is not None, html=html, toc=toc, chapters=chapters)
