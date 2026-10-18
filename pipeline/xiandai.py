"""Extract 线代臻选题 into content/xiandai/: the 355 questions of the 数二 question book and their solutions.

    .venv/bin/python -m pipeline.xiandai build

The question book (ReportLab) puts a grey info bar over each question, "#001\\n行列式 → 具体行列式计算\\n2014数一二三",
and draws the original layout under it; a question never runs over a page, so a question is the band between its bar and
the next one. The book's outline gives each question's full path. The answer book (a Word export) is outlined
线代臻选题 > A..G 章 > ... > one leaf per question; chapters A–F hold the question book's chapters in the same order and
with the same counts (G, 数学一专项, is not in the 数二 book). A solution is the answer book between a leaf's heading and
the next bookmark, rendered page by page as it is, so text lines such as 「答案（D）」 stay with the screenshots.

Questions are numbered 1001–1355 on the site (book number + XIANDAI_OFFSET). The output lives in its own folder, because
pipeline.build clears content/q, a and s when it rebuilds the 高数 book.
"""
import json
import re
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import fitz

from . import sources
from .chapters import XIANDAI_CHAPTERS, XIANDAI_OFFSET, chapter_of
from .imaging import render_clip, save_webp, trim_whitespace
from .questions import INFO_BAR
from .solutions import OutlineEntry, _shared_text, parse_outline
from .text import years
from .validate import Report

OUT_DIR = sources.CONTENT_DIR / "xiandai"
QUESTION_ZOOM = 3
SOLUTION_ZOOM = 3
TEXTS_FILE = "texts.json"

_BOOKMARK = re.compile(r"^#(\d{3}) · (.+)$")
_SIDE = 40  # pt kept clear of the page edge on both sides of a question band
_FOOTER = 800  # the question book's page footer ("第 7 页 ， 共 98 页") starts below this
_BAR_FILL = (0.945, 0.961, 0.976)  # the info bar's light grey
# The answer book's running header ("线代臻选题-答案") ends at y≈53 and its page number starts at y≈772.
_SOLUTION_TOP, _SOLUTION_BOTTOM = 60, 765
_SOLUTION_SIDES = (80, 520)
_ANSWER_BOOK_CHAPTERS = "ABCDEF"


@dataclass(frozen=True)
class XQuestion:
    book_num: int  # #001–#355 as printed
    num: int  # on the site
    chapter: str
    path: tuple[str, ...]  # below the chapter, e.g. ("(代数)余子式相关问题", "代数余子式求和", "部分代数余子式求和")
    source: str
    page_index: int
    rect: tuple[float, float, float, float]

    @property
    def section(self) -> str:
        return self.path[0]

    @property
    def kp(self) -> str:
        return self.path[-1]


def _paths(doc: fitz.Document) -> dict[int, tuple[str, ...]]:
    """Book number -> the outline path above it, without the chapter ("一、行列式")."""
    paths, stack = {}, []
    for level, title, _page in doc.get_toc():
        stack = stack[: level - 1] + [title.strip()]
        if m := _BOOKMARK.match(title.strip()):
            paths[int(m.group(1))] = tuple(stack[1:-1])
    return paths


def _bar_boxes(page: fitz.Page) -> list[fitz.Rect]:
    """The grey background of each info bar: a wide light fill a little taller than its text."""
    return [fitz.Rect(d["rect"]) for d in page.get_drawings()
            if d.get("fill") and all(abs(a - b) < 0.01 for a, b in zip(d["fill"], _BAR_FILL))
            and d["rect"].width > page.rect.width / 2 and d["rect"].height < 40]


def parse_questions(pdf_path: Path = sources.XIANDAI_QUESTIONS_PDF) -> list[XQuestion]:
    found = []
    with fitz.open(pdf_path) as doc:
        paths = _paths(doc)
        for page in doc:
            boxes = _bar_boxes(page)
            bars = []
            for _x0, y0, _x1, y1, text, *_ in page.get_text("blocks"):
                if bar := INFO_BAR.match(text.strip()):
                    box = next((b for b in boxes if b.y0 <= (y0 + y1) / 2 <= b.y1), None)
                    if box is None:
                        raise ValueError(f"page {page.number + 1}: no grey bar behind #{bar.group(1)}")
                    bars.append((box, bar))
            bars.sort(key=lambda b: b[0].y0)
            for i, (box, bar) in enumerate(bars):
                book_num = int(bar.group(1))
                end = bars[i + 1][0].y0 if i + 1 < len(bars) else _FOOTER
                path = paths.get(book_num)
                if not path:
                    raise ValueError(f"线代 #{book_num:03d} has no bookmark")
                num = book_num + XIANDAI_OFFSET
                found.append(XQuestion(
                    book_num=book_num,
                    num=num,
                    chapter=chapter_of(num),
                    path=path,
                    source=bar.group(3).replace("\n", " ").strip(),
                    page_index=page.number,
                    rect=(_SIDE, box.y1 + 1, page.rect.width - _SIDE, end - 1),
                ))
    return sorted(found, key=lambda q: q.num)


@dataclass
class Pairing:
    matched: dict[int, OutlineEntry]  # site number -> leaf
    weak: list[int]  # questions whose source shares neither a year nor text with their leaf
    skipped: list[OutlineEntry]  # leaves of the answer book that are not in the 数二 book


def pair_solutions(outline: list[OutlineEntry], questions: list[XQuestion]) -> Pairing:
    """Chapter by chapter, the n-th question goes with the n-th leaf: the two books list them in the same order."""
    matched, weak = {}, []
    for code, chapter in zip(_ANSWER_BOOK_CHAPTERS, XIANDAI_CHAPTERS):
        leaves = [e for e in outline if e.is_leaf and e.chapter == code]
        chapter_questions = [q for q in questions if q.chapter == chapter.code]
        if len(leaves) != len(chapter_questions):
            raise ValueError(f"答案本 {code} 章有 {len(leaves)} 题，题目本「{chapter.name}」有 {len(chapter_questions)} 题")
        for q, leaf in zip(chapter_questions, leaves):
            matched[q.num] = leaf
            if not years(q.source) & years(leaf.title) and _shared_text(q.source, leaf.title) < min(4, len(q.source)):
                weak.append(q.num)
    skipped = [e for e in outline if e.is_leaf and e.chapter not in _ANSWER_BOOK_CHAPTERS]
    return Pairing(matched, weak, skipped)


def _heading_bottom(page: fitz.Page, y: float) -> float:
    """Bottom of the outline heading ("(1) 2001 数三 >>") a bookmark at y points to; y when there is none."""
    heads = [y1 for _x0, y0, _x1, y1, text, *_ in page.get_text("blocks") if ">>" in text and y - 2 <= y0 <= y + 30]
    return max(heads, default=y)


def solution_regions(doc: fitz.Document, outline: list[OutlineEntry], entry: OutlineEntry) -> list[tuple[int, fitz.Rect]]:
    """The page bands from just under this leaf's heading to the next bookmark."""
    nxt = outline[entry.index + 1] if entry.index + 1 < len(outline) else None
    last_page = nxt.page_index if nxt else doc.page_count - 1
    left, right = _SOLUTION_SIDES
    regions = []
    for p in range(entry.page_index, last_page + 1):
        top = max(_SOLUTION_TOP, _heading_bottom(doc[p], entry.y)) if p == entry.page_index else _SOLUTION_TOP
        bottom = min(_SOLUTION_BOTTOM, nxt.y) if nxt and p == last_page else _SOLUTION_BOTTOM
        if bottom - top > 4:
            regions.append((p, fitz.Rect(left, top, right, bottom)))
    return regions


def _has_ink(img) -> bool:
    return img.convert("L").point(lambda v: 255 if v < 245 else 0).getbbox() is not None


def _text(page: fitz.Page, rect) -> str:
    return re.sub(r"\s+", " ", page.get_text("text", clip=fitz.Rect(rect))).strip()


def _image(rel: str, size: tuple[int, int]) -> dict:
    return {"src": rel, "w": size[0], "h": size[1]}


def validate(manifest: dict, out_dir: Path) -> Report:
    report = Report()
    questions = manifest["questions"]
    expected = [n for ch in XIANDAI_CHAPTERS for n in range(ch.first, ch.last + 1)]
    if [q["num"] for q in questions] != expected:
        report.errors.append(f"题号应为 1001–1355，实际 {len(questions)} 题")
    content_dir = out_dir.parent
    present = lambda rel: (content_dir / rel).exists() and (content_dir / rel).stat().st_size > 0  # noqa: E731
    images = solved = solution_images = 0
    for q in questions:
        tag = f"线{q['book_num']:03d}"
        images += present(q["img"]["src"])
        if not present(q["img"]["src"]):
            report.errors.append(f"{tag} 缺少题面：{q['img']['src']}")
        missing = [s["src"] for s in q["solution"] if not present(s["src"])]
        report.errors += [f"{tag} 缺少解析：{m}" for m in missing]
        if not q["solution"]:
            report.errors.append(f"{tag} 没有解析图")
        elif not missing:
            solved += 1
            solution_images += len(q["solution"])
    for num in manifest["alignment"]["weak"]:
        report.notes.append(f"线{num - XIANDAI_OFFSET:03d} 的出处和答案本书签的年份、文字都对不上，按顺序对齐，请人工核对")
    for title in manifest["alignment"]["skipped"]:
        report.notes.append(f"答案本里未导入（数二题目本没有）：{title}")
    report.summary = f"线代题面 {images}/{len(expected)}，解析 {solved}/{len(expected)}（共 {solution_images} 张图）"
    return report


def build(out_dir: Path = OUT_DIR) -> dict:
    questions = parse_questions(sources.XIANDAI_QUESTIONS_PDF)
    outline = parse_outline(sources.XIANDAI_SOLUTIONS_PDF)
    pairing = pair_solutions(outline, questions)
    for sub in ("q", "s"):
        shutil.rmtree(out_dir / sub, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = out_dir.name

    records, texts = [], {}
    with fitz.open(sources.XIANDAI_QUESTIONS_PDF) as qdoc, fitz.open(sources.XIANDAI_SOLUTIONS_PDF) as sdoc:
        for i, q in enumerate(questions, start=1):
            qpage = qdoc[q.page_index]
            img_rel = f"{prefix}/q/{q.num}.webp"
            question_size = save_webp(trim_whitespace(render_clip(qpage, q.rect, QUESTION_ZOOM)), out_dir / "q" / f"{q.num}.webp")
            leaf = pairing.matched[q.num]
            solution, solution_text = [], []
            for page_index, rect in solution_regions(sdoc, outline, leaf):
                img = render_clip(sdoc[page_index], rect, SOLUTION_ZOOM)
                if not _has_ink(img):
                    continue
                rel = f"{prefix}/s/{q.num}-{len(solution) + 1}.webp"
                size = save_webp(trim_whitespace(img), out_dir / "s" / f"{q.num}-{len(solution) + 1}.webp", lossless=False, quality=88)
                solution.append(_image(rel, size))
                if text := _text(sdoc[page_index], rect):
                    solution_text.append(text)
            records.append({
                "num": q.num,
                "book_num": q.book_num,
                "chapter": q.chapter,
                "kp": q.kp,
                "section": q.section,
                "path": list(q.path),
                "source": q.source,
                "source_full": leaf.title,
                "orig_page": None,
                "difficulty": None,
                "stars": None,
                "minutes": None,
                "quick_id": None,
                "flags": [],
                "img": _image(img_rel, question_size),
                "answer": None,
                "solution": solution,
            })
            texts[str(q.book_num)] = {"question": _text(qpage, q.rect), "solution": " ".join(solution_text)}
            if i % 50 == 0:
                print(f"  线代 {i}/{len(questions)}", flush=True)

    manifest = {
        "version": 1,
        "built_at": datetime.now().isoformat(timespec="seconds"),
        "chapters": [{"code": c.code, "name": c.name, "first": c.first, "last": c.last} for c in XIANDAI_CHAPTERS],
        "questions": records,
        "alignment": {
            "weak": pairing.weak,
            "skipped": [f"{e.chapter} 章 · {' / '.join(e.path)} · {e.title}" for e in pairing.skipped],
        },
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / TEXTS_FILE).write_text(json.dumps(texts, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] not in (["build"], ["validate"]):
        print("用法：python -m pipeline.xiandai build | validate")
        return 2
    started = time.time()
    if argv[0] == "build":
        print(f"[大观园] 从 {sources.KNOWLEDGE_DIR} 提取线代臻选题到 {OUT_DIR}", flush=True)
        manifest = build()
    else:
        manifest = json.loads((OUT_DIR / "manifest.json").read_text(encoding="utf-8"))
    report = validate(manifest, OUT_DIR)
    print(report.render())
    print(f"用时 {time.time() - started:.0f} 秒")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
