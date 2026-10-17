"""The read-only question bank, loaded from content/manifest.json (built by `python -m pipeline.build`)."""
import json
from dataclasses import dataclass
from pathlib import Path

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
    orig_page: int
    difficulty: float
    stars: int
    minutes: int
    quick_id: str
    flags: tuple[str, ...]
    img: Image
    answer: Image
    solution: tuple[Image, ...]


@dataclass(frozen=True)
class ChapterInfo:
    code: str
    name: str
    first: int
    last: int


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
        answer=Image(**d["answer"]),
        solution=tuple(Image(**s) for s in d["solution"]),
    )


class Content:
    def __init__(self, manifest: dict, sections: dict[str, Section] | None = None,
                 links: dict[int, tuple[str, ...]] | None = None):
        self.chapters = [ChapterInfo(**c) for c in manifest["chapters"]]
        self.questions = {q["num"]: _question(q) for q in manifest["questions"]}
        self.knowledge = list(manifest.get("knowledge", []))
        self.chapter_links = dict(manifest.get("chapter_links", {}))
        self.built_at = manifest.get("built_at", "")
        self.sections = dict(sections or {})
        self.links = {num: keys for num, keys in (links or {}).items() if num in self.questions}
        self._linked: dict[str, list[int]] = {}
        for num in sorted(self.links):
            for key in self.links[num]:
                self._linked.setdefault(key, []).append(num)

    def chapter(self, code: str) -> ChapterInfo:
        return next(c for c in self.chapters if c.code == code)

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


def load_content(content_dir: Path, knowledge_md_dir: Path | None = None) -> Content:
    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    if knowledge_md_dir is None or not knowledge_md_dir.exists():
        return Content(manifest)
    sections = load_sections(knowledge_md_dir)
    return Content(manifest, sections, load_links(knowledge_md_dir, sections))
