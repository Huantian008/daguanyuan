"""Build content/ from the source PDFs.

    .venv\\Scripts\\python -m pipeline.build
"""
import json
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import fitz

from . import sources
from .answers import parse_answers
from .chapters import CHAPTERS, chapter_of
from .imaging import extract_image, is_jpeg, render_clip, save_webp, trim_whitespace
from .knowledge import QUESTION_CHAPTER_LINKS, parse_markdown_index, title_of
from .questions import QuestionMeta, parse_questions
from .solutions import align, parse_outline, solution_images
from .validate import validate

QUESTION_ZOOM = 3
KNOWLEDGE_ZOOM = 2
MARKDOWN_DIR = sources.PROJECT_ROOT / "knowledge-md"


def _image(rel: str, size: tuple[int, int]) -> dict:
    return {"src": rel, "w": size[0], "h": size[1]}


def _flags(q: QuestionMeta) -> list[str]:
    flags = []
    if "仅数学一" in q.source:
        flags.append("仅数一")
    if "选做" in q.kp:
        flags.append("选做")
    return flags


def _save_embedded(doc: fitz.Document, xref: int, page_index: int, bbox, out: Path) -> tuple[int, int]:
    if xref:
        return save_webp(extract_image(doc, xref), out, lossless=not is_jpeg(doc, xref))
    return save_webp(render_clip(doc[page_index], bbox, QUESTION_ZOOM), out)


def build_questions(content_dir: Path, only: set[int] | None = None) -> tuple[list[dict], dict]:
    questions = parse_questions(sources.QUESTIONS_PDF)
    answers = parse_answers(sources.ANSWERS_PDF)
    outline = parse_outline(sources.SOLUTIONS_PDF)
    alignment = align(outline, questions)
    selected = [q for q in questions if only is None or q.num in only]

    records = []
    with fitz.open(sources.QUESTIONS_PDF) as qdoc, fitz.open(sources.ANSWERS_PDF) as adoc, \
            fitz.open(sources.SOLUTIONS_PDF) as sdoc:
        for i, q in enumerate(selected, start=1):
            n = f"{q.num:03d}"
            question_img = trim_whitespace(render_clip(qdoc[q.page_index], q.rect, QUESTION_ZOOM))
            question_size = save_webp(question_img, content_dir / f"q/{n}.webp")
            answer = answers[q.num]
            answer_size = _save_embedded(adoc, answer.xref, answer.page_index, answer.bbox, content_dir / f"a/{n}.webp")
            entry = alignment.matched[q.num]
            solution = []
            for k, ref in enumerate(solution_images(sdoc, outline, entry), start=1):
                rel = f"s/{n}-{k}.webp"
                solution.append(_image(rel, _save_embedded(sdoc, ref.xref, ref.page_index, ref.bbox, content_dir / rel)))
            records.append({
                "num": q.num,
                "chapter": chapter_of(q.num),
                "kp": q.kp,
                "section": entry.path[0] if entry.path else "",
                "path": list(entry.path),
                "source": q.source,
                "source_full": entry.title,
                "orig_page": q.orig_page,
                "difficulty": q.difficulty,
                "stars": q.stars,
                "minutes": q.minutes,
                "quick_id": answer.quick_id,
                "flags": _flags(q),
                "img": _image(f"q/{n}.webp", question_size),
                "answer": _image(f"a/{n}.webp", answer_size),
                "solution": solution,
            })
            if i % 50 == 0:
                print(f"  题目 {i}/{len(selected)}", flush=True)

    alignment_info = {
        "weak": [n for n in alignment.weak if only is None or n in only],
        "skipped": [f"{e.chapter} 章 · {' / '.join(e.path)} · {e.title}" for e in alignment.skipped],
    }
    return records, alignment_info


def _render_pages(pdf_path: Path, prefix: str, numbers, content_dir: Path) -> list[dict]:
    pages = []
    with fitz.open(pdf_path) as doc:
        for p in numbers:
            rel = f"k/{prefix}-{p:03d}.webp"
            page = doc[p - 1]
            size = save_webp(render_clip(page, page.rect, KNOWLEDGE_ZOOM), content_dir / rel, lossless=False, quality=85)
            pages.append(_image(rel, size))
    return pages


def build_knowledge(content_dir: Path) -> list[dict]:
    index = parse_markdown_index((MARKDOWN_DIR / "00_总目录.md").read_text(encoding="utf-8"))
    entries = []
    for md_name, first, last in index:
        markdown = (MARKDOWN_DIR / md_name).read_text(encoding="utf-8")
        entries.append({
            "slug": md_name[:2],
            "title": title_of(markdown),
            "group": "高等数学",
            "md": md_name,
            "pages": _render_pages(sources.GAOSHU_PDF, "gaoshu", range(first, last + 1), content_dir),
        })
    with fitz.open(sources.XIANDAI_PDF) as doc:
        count = doc.page_count
        toc = [{"title": title, "page": page} for _level, title, page in doc.get_toc()]
    entries.append({
        "slug": "xiandai",
        "title": "线性代数",
        "group": "线性代数",
        "md": None,
        "toc": toc,
        "pages": _render_pages(sources.XIANDAI_PDF, "xiandai", range(1, count + 1), content_dir),
    })
    return entries


def build(content_dir: Path = sources.CONTENT_DIR, only: set[int] | None = None, with_knowledge: bool = True) -> dict:
    content_dir.mkdir(parents=True, exist_ok=True)
    if only is None:
        for sub in ("q", "a", "s", "k"):
            shutil.rmtree(content_dir / sub, ignore_errors=True)
    questions, alignment = build_questions(content_dir, only)
    knowledge = build_knowledge(content_dir) if with_knowledge else []
    manifest = {
        "version": 1,
        "built_at": datetime.now().isoformat(timespec="seconds"),
        "chapters": [{"code": c.code, "name": c.name, "first": c.first, "last": c.last} for c in CHAPTERS],
        "chapter_links": QUESTION_CHAPTER_LINKS,
        "questions": questions,
        "knowledge": knowledge,
        "alignment": alignment,
    }
    (content_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


def main() -> int:
    started = time.time()
    print(f"[大观园] 从 {sources.SOURCE_DIR} 提取内容到 {sources.CONTENT_DIR}", flush=True)
    manifest = build()
    report = validate(manifest, sources.CONTENT_DIR)
    print(report.render())
    print(f"用时 {time.time() - started:.0f} 秒")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
