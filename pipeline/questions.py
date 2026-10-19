"""Parse the chapter-order 做题本.

Each question is an info bar ("#001 / 考点 / 原稿第1页 · 2004数三 · 难度 0.57 ★★☆☆☆ · 建议 4 分钟")
followed by the original book's layout embedded as a Form XObject named fzFrm*. That form is PyMuPDF's
show_pdf_page wrapper: its BBox clips one region out of a whole source page, the form named fullpage.
"""
import re
from contextlib import contextmanager
from dataclasses import dataclass, replace

import fitz
from PIL import Image

from .imaging import render_clip

INFO_BAR = re.compile(r"^#(\d{3})\n(.+?)\n(.+)$", re.S)
META = re.compile(r"^原稿第(\d+)页 · (.+?) · 难度 ([\d.]+) ([★☆]+) · 建议 (\d+) 分钟$")

# The source page behind these questions lost part of the stem, so no clip can show it. Their question
# image is the original statement instead, the first screenshot of the solution book (see build.py).
#   #329: the first line shares a line with the book's source note and is hidden under the 来源 badge;
#   #042, #056, #307, #439: the answer blank ______ at the end of the stem was dropped.
STATEMENT_FROM_SOLUTION = frozenset({42, 56, 307, 329, 439})

_SLACK = 0.5  # glyph boxes may overhang a clip by this much without being cut
_PAD = 2.0    # white margin added on a side that had to grow, like the 做题本's own clips leave


@dataclass(frozen=True)
class QuestionMeta:
    num: int
    kp: str
    orig_page: int
    source: str
    difficulty: float
    stars: int
    minutes: int
    page_index: int
    rect: tuple[float, float, float, float]
    form: int = 0
    # Set when the form's own BBox cuts through the question: the BBox (form space) that shows all of it.
    widened_bbox: tuple[float, float, float, float] | None = None


def _numbers(pdf_array: str) -> list[float]:
    return [float(v) for v in pdf_array.strip("[]").split()]


def _content_blocks(page: fitz.Page) -> list[tuple[int, fitz.Rect]]:
    to_page = page.transformation_matrix
    return [(xref, fitz.Rect(bbox) * to_page) for xref, name, _invoker, bbox in page.get_xobjects() if name.startswith("fzFrm")]


def form_below(page: fitz.Page, blocks: list[tuple[int, fitz.Rect]], bar_bottom: float, label: str) -> tuple[int, fitz.Rect]:
    """The first content form under an info bar: the question it introduces."""
    below = [b for b in blocks if b[1].y0 >= bar_bottom - 2]
    if not below:
        raise ValueError(f"page {page.number + 1}: no content block under #{label}")
    return min(below, key=lambda b: b[1].y0)


def _source_page(doc: fitz.Document, fullpage: int) -> fitz.Page:
    """A scratch page that draws a whole source page with no clip. Added in memory only; the PDF is never saved."""
    x0, y0, x1, y1 = _numbers(doc.xref_get_key(fullpage, "BBox")[1])
    if (x0, y0) != (0, 0):
        raise ValueError(f"source page form {fullpage} does not start at the origin")
    page = doc.new_page(width=x1, height=y1)
    contents = doc.get_new_xref()
    doc.update_object(contents, "<<>>")
    doc.update_stream(contents, b"/fullpage Do")
    doc.xref_set_key(page.xref, "Resources", f"<</XObject<</fullpage {fullpage} 0 R>>>>")
    doc.xref_set_key(page.xref, "Contents", f"{contents} 0 R")
    return doc[page.number]


def _ink(page: fitz.Page) -> list[fitz.Rect]:
    """Boxes of the glyphs, images and visible drawings on a page."""
    boxes = []
    for block in page.get_text("rawdict")["blocks"]:
        if block["type"] == 1:
            boxes.append(fitz.Rect(block["bbox"]))
            continue
        boxes += [fitz.Rect(ch["bbox"]) for line in block["lines"] for span in line["spans"]
                  for ch in span["chars"] if not ch["c"].isspace()]
    for d in page.get_drawings():
        if d.get("color") is None and d.get("fill") == (1.0, 1.0, 1.0):
            continue  # white backgrounds and covers leave no ink
        half = (d.get("width") or 0) / 2
        boxes.append(fitz.Rect(d["rect"]) + (-half, -half, half, half))
    return boxes


def _cut(clip: fitz.Rect, box: fitz.Rect) -> bool:
    inside = clip & box
    if inside.is_empty or min(inside.width, inside.height) <= _SLACK:
        return False
    return box.x0 < clip.x0 - _SLACK or box.y0 < clip.y0 - _SLACK or box.x1 > clip.x1 + _SLACK or box.y1 > clip.y1 + _SLACK


def widen(clip: fitz.Rect, ink: list[fitz.Rect]) -> fitz.Rect:
    """Grow a clip until it cuts through no ink box; unchanged when nothing is cut."""
    out = fitz.Rect(clip)
    while cut := [box for box in ink if _cut(out, box)]:
        for box in cut:
            out |= box
    if out == clip:
        return out
    return fitz.Rect(out.x0 - _PAD if out.x0 < clip.x0 else out.x0, out.y0 - _PAD if out.y0 < clip.y0 else out.y0,
                     out.x1 + _PAD if out.x1 > clip.x1 else out.x1, out.y1 + _PAD if out.y1 > clip.y1 else out.y1)


def _show_whole(doc: fitz.Document, questions: list[QuestionMeta]) -> list[QuestionMeta]:
    """Widen the clip of every question whose form BBox cuts through ink on its source page."""
    ink_by_source: dict[int, tuple[float, list[fitz.Rect]]] = {}
    out = []
    for q in questions:
        fullpage = int(doc.xref_get_key(q.form, "Resources/XObject/fullpage")[1].split()[0])
        if fullpage not in ink_by_source:
            source = _source_page(doc, fullpage)
            ink_by_source[fullpage] = source.rect.height, _ink(source)
        height, ink = ink_by_source[fullpage]
        bbox = fitz.Rect(_numbers(doc.xref_get_key(q.form, "BBox")[1]))
        clip = fitz.Rect(bbox.x0, height - bbox.y1, bbox.x1, height - bbox.y0)  # form space -> source page space
        wide = widen(clip, ink)
        if wide == clip:
            out.append(q)
            continue
        wide_bbox = (wide.x0, height - wide.y1, wide.x1, height - wide.y0)
        matrix = fitz.Matrix(*_numbers(doc.xref_get_key(q.form, "Matrix")[1]))
        rect = fitz.Rect(wide_bbox) * matrix * doc[q.page_index].transformation_matrix
        out.append(replace(q, rect=tuple(rect), widened_bbox=wide_bbox))
    return out


@contextmanager
def form_shown_whole(doc: fitz.Document, q: QuestionMeta):
    """While inside, the question's form shows its widened BBox. The change stays in memory and is undone after."""
    if q.widened_bbox is None:
        yield
        return
    old = doc.xref_get_key(q.form, "BBox")[1]
    doc.xref_set_key(q.form, "BBox", "[" + " ".join(f"{v:g}" for v in q.widened_bbox) + "]")
    try:
        yield
    finally:
        doc.xref_set_key(q.form, "BBox", old)


def render_question(doc: fitz.Document, q: QuestionMeta, zoom: float) -> Image.Image:
    with form_shown_whole(doc, q):
        return render_clip(doc[q.page_index], q.rect, zoom)


def parse_questions(pdf_path) -> list[QuestionMeta]:
    found = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            blocks = _content_blocks(page)
            for _x0, _y0, _x1, bar_bottom, text, *_ in page.get_text("blocks"):
                bar = INFO_BAR.match(text.strip())
                if not bar:
                    continue
                meta = META.match(bar.group(3).replace("\n", " ").strip())
                if not meta:
                    raise ValueError(f"page {page.number + 1}: unexpected info bar {text!r}")
                form, rect = form_below(page, blocks, bar_bottom, bar.group(1))
                found.append(QuestionMeta(
                    num=int(bar.group(1)),
                    kp=bar.group(2).strip(),
                    orig_page=int(meta.group(1)),
                    source=meta.group(2),
                    difficulty=float(meta.group(3)),
                    stars=meta.group(4).count("★"),
                    minutes=int(meta.group(5)),
                    page_index=page.number,
                    rect=tuple(rect),
                    form=form,
                ))
        found = _show_whole(doc, found)
    return sorted(found, key=lambda q: q.num)
