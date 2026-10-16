"""Tiny fake manifests so app tests run without the PDFs."""
from pipeline.chapters import CHAPTERS
from pipeline.knowledge import QUESTION_CHAPTER_LINKS


def question(num, chapter="A", section="函数性质", kp="有界", flags=(), source="2004数三"):
    return {
        "num": num,
        "chapter": chapter,
        "kp": kp,
        "section": section,
        "path": [section, kp],
        "source": source,
        "source_full": source,
        "orig_page": 1,
        "difficulty": 0.5,
        "stars": 2,
        "minutes": 5,
        "quick_id": f"01-{num:03d}",
        "flags": list(flags),
        "img": {"src": f"q/{num:03d}.webp", "w": 100, "h": 20},
        "answer": {"src": f"a/{num:03d}.webp", "w": 10, "h": 10},
        "solution": [{"src": f"s/{num:03d}-1.webp", "w": 100, "h": 50}],
    }


def manifest(questions, knowledge=()):
    return {
        "version": 1,
        "built_at": "2026-10-16T12:00:00",
        "chapters": [{"code": c.code, "name": c.name, "first": c.first, "last": c.last} for c in CHAPTERS],
        "chapter_links": QUESTION_CHAPTER_LINKS,
        "questions": list(questions),
        "knowledge": list(knowledge),
        "alignment": {"weak": [], "skipped": []},
    }


def small_bank():
    """Six questions in two chapters; #6 is 仅数一."""
    return manifest([
        question(1, "A", "函数性质", "有界"),
        question(2, "A", "函数性质", "奇偶"),
        question(3, "A", "极限", "0/0"),
        question(4, "B", "导数概念", "基本概念题"),
        question(5, "B", "导数概念", "基本概念题"),
        question(6, "B", "导数计算", "隐函数求导", flags=["仅数一"]),
    ])
