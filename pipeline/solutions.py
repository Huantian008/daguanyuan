"""Map the 613 做题本 questions onto the bookmarks of 大观严选题答案 and locate each solution's screenshots.

The answer book is a Word export whose outline is 大观严选题 > A..G 章 > 节 > ... > one leaf per question.
Its chapters A–F hold 619 leaves; the 数二 做题本 has 613 questions, so a few 数一/数三-only leaves
must be skipped. We align each chapter with dynamic programming (order preserved, only leaves may be
skipped) using the exam years and shared text of the sources as the similarity.
"""
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

import fitz

from .chapters import CHAPTERS, chapter_of
from .questions import QuestionMeta
from .text import clean_outline_title, years

OUT_OF_SCOPE = re.compile("仅数学一|（数学一）|（数学三）")
_NOISE = re.compile(r"[\s;；,，、()（）\[\]>]+")


@dataclass(frozen=True)
class OutlineEntry:
    index: int
    level: int
    title: str
    page_index: int
    y: float
    chapter: str | None
    path: tuple[str, ...]
    is_leaf: bool


@dataclass(frozen=True)
class ImageRef:
    page_index: int
    xref: int
    bbox: tuple[float, float, float, float]


@dataclass
class Alignment:
    matched: dict[int, OutlineEntry]
    skipped: list[OutlineEntry]
    weak: list[int]


def parse_outline(pdf_path) -> list[OutlineEntry]:
    with fitz.open(pdf_path) as doc:
        toc = doc.get_toc(simple=False)
    entries = []
    stack: list[str] = []
    for i, (level, raw_title, page_no, dest) in enumerate(toc):
        stack = stack[: level - 1] + [raw_title]
        chapter = None
        if len(stack) >= 2:
            letter = re.match(r"^([A-Z])\.", stack[1].strip())
            chapter = letter.group(1) if letter else None
        to = dest.get("to")
        entries.append(OutlineEntry(
            index=i,
            level=level,
            title=clean_outline_title(raw_title),
            page_index=page_no - 1,
            y=to.y if to is not None else 0.0,
            chapter=chapter,
            path=tuple(clean_outline_title(t) for t in stack[2:-1]),
            is_leaf=not (i + 1 < len(toc) and toc[i + 1][0] > level),
        ))
    return entries


def _shared_text(a: str, b: str) -> int:
    a, b = _NOISE.sub("", a), _NOISE.sub("", b)
    return SequenceMatcher(None, a, b, autojunk=False).find_longest_match(0, len(a), 0, len(b)).size


def similarity(source: str, entry: OutlineEntry) -> float:
    score = 3.0 * len(years(source) & years(entry.title)) + _shared_text(source, entry.title) / 4
    if OUT_OF_SCOPE.search(" / ".join(entry.path + (entry.title,))) and "仅数学一" not in source:
        score -= 2.0
    return score


def _align_chapter(questions: list[QuestionMeta], leaves: list[OutlineEntry]):
    n, m = len(questions), len(leaves)
    if m < n:
        raise ValueError(f"only {m} outline leaves for {n} questions")
    neg = float("-inf")
    best = [[0.0] * (m + 1)] + [[neg] * (m + 1) for _ in range(n)]
    took = [[False] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(i, m + 1):
            take = best[i - 1][j - 1] + similarity(questions[i - 1].source, leaves[j - 1])
            if take >= best[i][j - 1]:
                best[i][j], took[i][j] = take, True
            else:
                best[i][j] = best[i][j - 1]
    pairs, skipped = [], []
    i, j = n, m
    while j > 0:
        if i > 0 and took[i][j]:
            pairs.append((questions[i - 1], leaves[j - 1]))
            i, j = i - 1, j - 1
        else:
            skipped.append(leaves[j - 1])
            j -= 1
    return pairs[::-1], skipped[::-1]


def align(outline: list[OutlineEntry], questions: list[QuestionMeta]) -> Alignment:
    matched: dict[int, OutlineEntry] = {}
    skipped: list[OutlineEntry] = []
    weak: list[int] = []
    for ch in CHAPTERS:
        leaves = [e for e in outline if e.is_leaf and e.chapter == ch.code]
        chapter_questions = [q for q in questions if chapter_of(q.num) == ch.code]
        pairs, chapter_skipped = _align_chapter(chapter_questions, leaves)
        skipped += chapter_skipped
        for q, entry in pairs:
            matched[q.num] = entry
            if not years(q.source) & years(entry.title) and _shared_text(q.source, entry.title) < 4:
                weak.append(q.num)
    return Alignment(matched, skipped, weak)


def solution_images(doc: fitz.Document, outline: list[OutlineEntry], entry: OutlineEntry) -> list[ImageRef]:
    """Images placed between this entry's bookmark and the next bookmark (may span several pages)."""
    nxt = outline[entry.index + 1] if entry.index + 1 < len(outline) else None
    end_page = nxt.page_index if nxt else doc.page_count - 1
    end_y = nxt.y if nxt else float("inf")
    refs = []
    for p in range(entry.page_index, end_page + 1):
        for info in doc[p].get_image_info(xrefs=True):
            x0, y0, x1, y1 = info["bbox"]
            mid = (y0 + y1) / 2
            if (p > entry.page_index or mid > entry.y) and (p < end_page or mid < end_y):
                refs.append(ImageRef(p, info["xref"], (x0, y0, x1, y1)))
    return sorted(refs, key=lambda r: (r.page_index, r.bbox[1]))
