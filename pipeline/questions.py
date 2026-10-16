"""Parse the chapter-order 做题本.

Each question is an info bar ("#001 / 考点 / 原稿第1页 · 2004数三 · 难度 0.57 ★★☆☆☆ · 建议 4 分钟")
followed by the original book's layout embedded as a Form XObject named fzFrm*.
"""
import re
from dataclasses import dataclass

import fitz

INFO_BAR = re.compile(r"^#(\d{3})\n(.+?)\n(.+)$", re.S)
META = re.compile(r"^原稿第(\d+)页 · (.+?) · 难度 ([\d.]+) ([★☆]+) · 建议 (\d+) 分钟$")


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


def _content_rects(page: fitz.Page) -> list[fitz.Rect]:
    to_page = page.transformation_matrix
    return [fitz.Rect(bbox) * to_page for _xref, name, _invoker, bbox in page.get_xobjects() if name.startswith("fzFrm")]


def parse_questions(pdf_path) -> list[QuestionMeta]:
    found = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            rects = _content_rects(page)
            for _x0, _y0, _x1, bar_bottom, text, *_ in page.get_text("blocks"):
                bar = INFO_BAR.match(text.strip())
                if not bar:
                    continue
                meta = META.match(bar.group(3).replace("\n", " ").strip())
                if not meta:
                    raise ValueError(f"page {page.number + 1}: unexpected info bar {text!r}")
                below = [r for r in rects if r.y0 >= bar_bottom - 2]
                if not below:
                    raise ValueError(f"page {page.number + 1}: no content block under #{bar.group(1)}")
                rect = min(below, key=lambda r: r.y0)
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
                ))
    return sorted(found, key=lambda q: q.num)
