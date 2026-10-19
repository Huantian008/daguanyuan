"""The read-only question bank, loaded from content/manifest.json (built by `python -m pipeline.build`)."""
import json
from dataclasses import dataclass
from pathlib import Path

from .bank import XIANDAI_OFFSET, QuestionText, load_bank
from .sections import Section, load_links, load_sections


@dataclass(frozen=True)
class Image:
    src: str
    w: int
    h: int


@dataclass(frozen=True)
class Question:
    num: int
    chapter: str
    kp: str
    section: str
    path: tuple[str, ...]
    source: str
    source_full: str
    # Only the 高数 做题本 has these; the 线代 book has no difficulty, minutes or 答案速查 (answer image).
    orig_page: int | None
    difficulty: float | None
    stars: int | None
    minutes: int | None
    quick_id: str | None
    flags: tuple[str, ...]
    img: Image
    answer: Image | None
    solution: tuple[Image, ...]

    @property
    def label(self) -> str:
        return qlabel(self.num)


@dataclass(frozen=True)
class ChapterInfo:
    code: str
    name: str
    first: int
    last: int
    group: str = "高等数学"


def qlabel(num: int) -> str:
    """How a question is named on the site: #001 for 高数, 线001 for 线代."""
    return f"线{num - XIANDAI_OFFSET:03d}" if num > XIANDAI_OFFSET else f"#{num:03d}"


def qshort(num: int) -> str:
    """The short form on number chips: 001, 线001."""
    return qlabel(num).lstrip("#")


def parse_label(term: str) -> int | None:
    """The question number a search term names: 123 or #123 for 高数, 线12 or 线012 for 线代."""
    term = term.strip().lstrip("#")
    if term.startswith("线") and term[1:].isdigit():
        return int(term[1:]) + XIANDAI_OFFSET
    return int(term) if term.isdigit() else None


def _question(d: dict) -> Question:
    return Question(
        num=d["num"],
        chapter=d["chapter"],
        kp=d["kp"],
        section=d["section"],
        path=tuple(d["path"]),
        source=d["source"],
        source_full=d["source_full"],
        orig_page=d["orig_page"],
        difficulty=d["difficulty"],
        stars=d["stars"],
        minutes=d["minutes"],
        quick_id=d["quick_id"],
        flags=tuple(d["flags"]),
        img=Image(**d["img"]),
        answer=Image(**d["answer"]) if d["answer"] else None,
        solution=tuple(Image(**s) for s in d["solution"]),
    )


class Content:
    def __init__(self, manifest: dict, sections: dict[str, Section] | None = None,
                 links: dict[int, tuple[str, ...]] | None = None, texts: dict[int, QuestionText] | None = None):
        self.chapters = [ChapterInfo(**c) for c in manifest["chapters"]]
        self.questions = {q["num"]: _question(q) for q in manifest["questions"]}
        self.knowledge = list(manifest.get("knowledge", []))
        self.chapter_links = dict(manifest.get("chapter_links", {}))
        self.built_at = manifest.get("built_at", "")
        self.sections = dict(sections or {})
        self.links = {num: keys for num, keys in (links or {}).items() if num in self.questions}
        self.texts = {num: t for num, t in (texts or {}).items() if num in self.questions}
        self._linked: dict[str, list[int]] = {}
        for num in sorted(self.links):
            for key in self.links[num]:
                self._linked.setdefault(key, []).append(num)

    def chapter(self, code: str) -> ChapterInfo:
        return next(c for c in self.chapters if c.code == code)

    def groups(self) -> list[tuple[str, list[ChapterInfo]]]:
        """The chapters under their subject (高等数学, 线性代数), in book order."""
        out: list[tuple[str, list[ChapterInfo]]] = []
        for c in self.chapters:
            if not out or out[-1][0] != c.group:
                out.append((c.group, []))
            out[-1][1].append(c)
        return out

    def neighbors(self, num: int) -> tuple[int | None, int | None]:
        """The previous and next question in the same book."""
        book = [n for n in sorted(self.questions) if (n > XIANDAI_OFFSET) == (num > XIANDAI_OFFSET)]
        at = book.index(num)
        return (book[at - 1] if at > 0 else None, book[at + 1] if at + 1 < len(book) else None)

    def in_chapter(self, code: str) -> list[Question]:
        return [q for _num, q in sorted(self.questions.items()) if q.chapter == code]

    def default_excluded(self) -> set[int]:
        return {num for num, q in self.questions.items() if "仅数一" in q.flags}

    def outline(self, code: str) -> list[tuple[str, list[tuple[str, list[Question]]]]]:
        """Sections of a chapter, each with its 考点 and their questions, in book order."""
        sections: dict[str, dict[str, list[Question]]] = {}
        for q in self.in_chapter(code):
            sections.setdefault(q.section, {}).setdefault(q.kp, []).append(q)
        return [(section, list(kps.items())) for section, kps in sections.items()]

    def knowledge_entry(self, slug: str) -> dict | None:
        return next((k for k in self.knowledge if k["slug"] == slug), None)

    def text(self, num: int) -> QuestionText | None:
        """The question's text version, or None to show only its images."""
        return self.texts.get(num)

    def knowledge_titles(self) -> dict[str, str]:
        return {k["slug"]: k["title"] for k in self.knowledge}

    def sections_for(self, num: int) -> list[Section]:
        """The knowledge sections a question is tagged with, main one first."""
        return [self.sections[key] for key in self.links.get(num, ())]

    def questions_for(self, key: str) -> list[int]:
        """Questions tagged with a section, in number order."""
        return self._linked.get(key, [])

    def questions_on_page(self, slug: str, page_index: int) -> list[int]:
        """Questions tagged with any section that starts on this 原版 page of a chapter."""
        nums = {n for s in self.sections.values() if s.slug == slug and s.page_index == page_index
                for n in self.questions_for(s.key)}
        return sorted(nums)


def load_content(content_dir: Path, knowledge_md_dir: Path | None = None, bank_dir: Path | None = None) -> Content:
    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    texts = load_bank(bank_dir)
    if knowledge_md_dir is None or not knowledge_md_dir.exists():
        return Content(manifest, texts=texts)
    sections = load_sections(knowledge_md_dir)
    return Content(manifest, sections, load_links(knowledge_md_dir, sections), texts)
