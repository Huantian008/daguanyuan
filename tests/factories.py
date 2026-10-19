"""Tiny fake manifests so app tests run without the PDFs."""
from pipeline.chapters import CHAPTERS, XIANDAI_CHAPTERS
from pipeline.knowledge import QUESTION_CHAPTER_LINKS, XIANDAI_CHAPTER_LINKS


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


def xiandai_question(book_num, chapter="L1", section="具体行列式计算", kp="具体行列式计算", source="2014数一二三"):
    """A 线代 question as pipeline.xiandai writes it: no difficulty, minutes, 答案速查 or answer image."""
    num = 1000 + book_num
    return {
        "num": num,
        "book_num": book_num,
        "chapter": chapter,
        "kp": kp,
        "section": section,
        "path": [section] if kp == section else [section, kp],
        "source": source,
        "source_full": source,
        "orig_page": None,
        "difficulty": None,
        "stars": None,
        "minutes": None,
        "quick_id": None,
        "flags": [],
        "img": {"src": f"xiandai/q/{num}.webp", "w": 100, "h": 20},
        "answer": None,
        "solution": [{"src": f"xiandai/s/{num}-1.webp", "w": 100, "h": 50}],
    }


def manifest(questions, knowledge=(), xiandai=False):
    """With `xiandai`, the six 线代 chapters follow the 高数 ones, as pipeline.build merges them."""
    chapters = [{"code": c.code, "name": c.name, "first": c.first, "last": c.last, "group": "高等数学"} for c in CHAPTERS]
    if xiandai:
        chapters += [{"code": c.code, "name": c.name, "first": c.first, "last": c.last, "group": "线性代数"} for c in XIANDAI_CHAPTERS]
    return {
        "version": 1,
        "built_at": "2026-10-16T12:00:00",
        "chapters": chapters,
        "chapter_links": QUESTION_CHAPTER_LINKS | (XIANDAI_CHAPTER_LINKS if xiandai else {}),
        "questions": list(questions),
        "knowledge": list(knowledge),
        "alignment": {"weak": [], "skipped": []},
    }


def two_books():
    """Three 高数 questions in chapter A and three 线代 questions, two in L1 and one in L2."""
    return manifest([
        question(1, "A", "函数性质", "有界"),
        question(2, "A", "函数性质", "奇偶"),
        question(3, "A", "极限", "0/0"),
        xiandai_question(1),
        xiandai_question(2, source="2015数一"),
        xiandai_question(41, "L2", "逆", "抽象逆", source="2001数一"),
    ], xiandai=True)


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
