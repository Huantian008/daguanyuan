"""Numbered sections of the knowledge Markdown, and which questions are linked to them.

A section is a numbered h2/h3 such as `## 7. 洛必达、等价无穷小与泰勒` or `### 7.3 泰勒公式`. Its key, "01/7.3",
is what knowledge-md/question_links.json refers to. Unnumbered headings (考试大纲 and a few h3) are not sections.
"""
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .markdown import heading_ids

LINKS_FILE = "question_links.json"
# The page tables of the two sets of notes: 高数 (also the knowledge index page) and the 线代 mind map.
INDEX_FILE = "00_总目录.md"
XIANDAI_INDEX_FILE = "线代总目录.md"
MAX_LINKS = 3

# 00_总目录.md lists which PDF pages each Markdown chapter came from:  | 10–22 | [01 …](./01_函数极限连续.md) | …
_INDEX_ROW = re.compile(r"^\|\s*(\d+)\s*[–-]\s*(\d+)\s*\|\s*\[[^\]]*\]\(\./([^)]+\.md)\)", re.M)
_HEADING = re.compile(r"^(#{2,3}) (\d+(?:\.\d+)?)\.?\s+(.+?)\s*$")
_ANY_HEADING = re.compile(r"^#{1,6} ")
_PAGE = re.compile(r"<!--\s*p\.(\d+)\s*-->")


@dataclass(frozen=True)
class Section:
    key: str  # "01/7.3"
    slug: str  # "01", the Markdown file prefix and the /knowledge/<slug> page
    number: str  # "7.3"
    level: int  # 2 or 3
    title: str  # "泰勒公式", as written (may contain $math$)
    anchor: str  # id of the heading on the 文字版 page
    pdf_page: int | None  # page of the original knowledge PDF
    page_index: int | None  # 1-based position among the chapter's 原版 page images, i.e. the #p<N> anchor
    parent: str | None  # key of the enclosing h2, for an h3

    @property
    def label(self) -> str:
        return f"{self.number} {self.title.replace('$', '')}"


def parse_markdown_index(text: str) -> list[tuple[str, int, int]]:
    return [(m.group(3), int(m.group(1)), int(m.group(2))) for m in _INDEX_ROW.finditer(text)]


def parse_sections(slug: str, source: str, first_page: int | None = None) -> list[Section]:
    lines = source.splitlines()
    ids = heading_ids(source)
    heads = [(i, m) for i, line in enumerate(lines) if (m := _HEADING.match(line))]
    marks = [(i, int(p.group(1))) for i, line in enumerate(lines) if (p := _PAGE.search(line))]
    sections = []
    parent = None
    for n, (i, m) in enumerate(heads):
        level = len(m.group(1))
        # A section runs to the next heading of the same or a higher level. Its page is the first page mark inside it,
        # or else the last one before it.
        end = next((j for j, other in heads[n + 1:] if len(other.group(1)) <= level), len(lines))
        inside = [p for j, p in marks if i <= j < end]
        before = [p for j, p in marks if j < i]
        page = inside[0] if inside else (before[-1] if before else None)
        key = f"{slug}/{m.group(2)}"
        if level == 2:
            parent = key
        sections.append(Section(
            key=key,
            slug=slug,
            number=m.group(2),
            level=level,
            title=m.group(3),
            anchor=ids.get(i, ""),
            pdf_page=page,
            page_index=page - first_page + 1 if page and first_page else None,
            parent=parent if level == 3 else None,
        ))
    return sections


def section_bodies(source: str) -> dict[str, str]:
    """Each section's own text (up to the next heading of any level), by section number."""
    lines = source.splitlines()
    bodies = {}
    for i, line in enumerate(lines):
        if m := _HEADING.match(line):
            end = next((j for j in range(i + 1, len(lines)) if _ANY_HEADING.match(lines[j])), len(lines))
            bodies[m.group(2)] = "\n".join(lines[i + 1:end])
    return bodies


def load_sections(knowledge_md_dir: Path) -> dict[str, Section]:
    first_pages = {}
    for index_md in (knowledge_md_dir / INDEX_FILE, knowledge_md_dir / XIANDAI_INDEX_FILE):
        if index_md.exists():
            first_pages |= {name: first for name, first, _last in parse_markdown_index(index_md.read_text(encoding="utf-8"))}
    sections = {}
    for path in sorted(knowledge_md_dir.glob("[0-9][0-9]_*.md")):
        slug = path.name[:2]
        if slug == "00":
            continue
        for s in parse_sections(slug, path.read_text(encoding="utf-8"), first_pages.get(path.name)):
            sections[s.key] = s
    return sections


def load_links(knowledge_md_dir: Path, sections: dict[str, Section]) -> dict[int, tuple[str, ...]]:
    """Question number -> its section keys, main one first. Keys that no longer exist are dropped."""
    path = knowledge_md_dir / LINKS_FILE
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    links = {}
    for num, keys in data.get("links", {}).items():
        kept = tuple(k for k in keys if k in sections)[:MAX_LINKS]
        if kept:
            links[int(num)] = kept
    return links
