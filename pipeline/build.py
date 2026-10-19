"""Build content/ from the source PDFs.

    .venv/bin/python -m pipeline.build             # everything; the 线代 questions come from content/xiandai/
    .venv/bin/python -m pipeline.build --xiandai   # only the 线代 questions and knowledge pages, 高数 left as it is

The 线代 questions are extracted by `python -m pipeline.xiandai build` into content/xiandai/ and merged in here.
"""
import json
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import fitz
from PIL import Image

from . import sources
from .answers import parse_answers
from .chapters import CHAPTERS, XIANDAI_CHAPTERS, XIANDAI_OFFSET, chapter_of
from .imaging import extract_image, is_jpeg, render_clip, save_webp, trim_whitespace
from .knowledge import QUESTION_CHAPTER_LINKS, XIANDAI_CHAPTER_LINKS, parse_markdown_index, title_of
from .questions import STATEMENT_FROM_SOLUTION, QuestionMeta, parse_questions, render_question
from .solutions import ImageRef, align, parse_outline, solution_images
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


def _embedded(doc: fitz.Document, xref: int, page_index: int, bbox) -> tuple[Image.Image, bool]:
    """An embedded image, or the region rendered when there is none, and whether to store it losslessly."""
    if xref:
        return extract_image(doc, xref), not is_jpeg(doc, xref)
    return render_clip(doc[page_index], bbox, QUESTION_ZOOM), True


def _save_embedded(doc: fitz.Document, xref: int, page_index: int, bbox, out: Path) -> tuple[int, int]:
    img, lossless = _embedded(doc, xref, page_index, bbox)
    return save_webp(img, out, lossless=lossless)


def _save_question(qdoc: fitz.Document, sdoc: fitz.Document, q: QuestionMeta, solution: list[ImageRef],
                   out: Path) -> tuple[int, int]:
    if q.num in STATEMENT_FROM_SOLUTION:
        first = solution[0]
        img, lossless = _embedded(sdoc, first.xref, first.page_index, first.bbox)
        return save_webp(trim_whitespace(img), out, lossless=lossless)
    return save_webp(trim_whitespace(render_question(qdoc, q, QUESTION_ZOOM)), out)


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
            entry = alignment.matched[q.num]
            refs = solution_images(sdoc, outline, entry)
            question_size = _save_question(qdoc, sdoc, q, refs, content_dir / f"q/{n}.webp")
            answer = answers[q.num]
            answer_size = _save_embedded(adoc, answer.xref, answer.page_index, answer.bbox, content_dir / f"a/{n}.webp")
            solution = []
            for k, ref in enumerate(refs, start=1):
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
    return entries + build_xiandai_knowledge(content_dir)


def build_xiandai_knowledge(content_dir: Path) -> list[dict]:
    """The 线代 mind map as six chapters, the files and page ranges of knowledge-md/线代总目录.md. A chapter whose
    Markdown is not written yet shows only its original pages."""
    from .xiandai_knowledge import knowledge_files

    return [{
        "slug": f.name[:2],
        "title": f.title,
        "group": "线性代数",
        "md": f.name,
        "pages": _render_pages(sources.XIANDAI_PDF, "xiandai", f.pages(), content_dir),
    } for f in knowledge_files(MARKDOWN_DIR)]


def merge_xiandai(manifest: dict, xiandai_dir: Path) -> dict:
    """Put the 线代 chapters and questions built by pipeline.xiandai into the manifest, replacing any already there."""
    codes = {c.code for c in XIANDAI_CHAPTERS}
    manifest["chapters"] = [dict(c, group=c.get("group", "高等数学")) for c in manifest["chapters"] if c["code"] not in codes]
    manifest["questions"] = [q for q in manifest["questions"] if q["num"] < XIANDAI_OFFSET]
    manifest["chapter_links"] = {k: v for k, v in manifest["chapter_links"].items() if k not in codes}
    manifest.pop("xiandai_alignment", None)
    path = xiandai_dir / "manifest.json"
    if not path.exists():
        return manifest
    xiandai = json.loads(path.read_text(encoding="utf-8"))
    manifest["chapters"] += [dict(c, group="线性代数") for c in xiandai["chapters"]]
    manifest["questions"] += xiandai["questions"]
    manifest["chapter_links"] |= XIANDAI_CHAPTER_LINKS
    manifest["xiandai_alignment"] = xiandai["alignment"]
    return manifest


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
        "chapters": [{"code": c.code, "name": c.name, "first": c.first, "last": c.last, "group": "高等数学"} for c in CHAPTERS],
        "chapter_links": dict(QUESTION_CHAPTER_LINKS),
        "questions": questions,
        "knowledge": knowledge,
        "alignment": alignment,
    }
    merge_xiandai(manifest, content_dir / "xiandai")
    _write_manifest(manifest, content_dir)
    return manifest


def rebuild_xiandai(content_dir: Path = sources.CONTENT_DIR) -> dict:
    """Refresh only the 线代 part of an existing content/: its questions (from content/xiandai/, built by
    `python -m pipeline.xiandai build`) and its knowledge pages. The 高数 part is left as it is."""
    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    manifest["knowledge"] = [k for k in manifest["knowledge"] if k["group"] != "线性代数"] + build_xiandai_knowledge(content_dir)
    manifest["built_at"] = datetime.now().isoformat(timespec="seconds")
    merge_xiandai(manifest, content_dir / "xiandai")
    _write_manifest(manifest, content_dir)
    return manifest


def _write_manifest(manifest: dict, content_dir: Path) -> None:
    (content_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    started = time.time()
    if argv == ["--xiandai"]:
        print(f"[大观园] 只更新 {sources.CONTENT_DIR} 里的线代部分", flush=True)
        manifest = rebuild_xiandai()
    else:
        print(f"[大观园] 从 {sources.SOURCE_DIR} 提取内容到 {sources.CONTENT_DIR}", flush=True)
        manifest = build()
    report = validate(manifest, sources.CONTENT_DIR)
    print(report.render())
    print(f"用时 {time.time() - started:.0f} 秒")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
