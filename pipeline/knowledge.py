"""Knowledge pages: the original PDF pages plus the (corrected) Markdown text version."""
from dgy.sections import parse_markdown_index

__all__ = ["QUESTION_CHAPTER_LINKS", "XIANDAI_CHAPTER_LINKS", "parse_markdown_index", "title_of"]

# Which knowledge chapters a 做题本 chapter should link to (by Markdown file prefix).
QUESTION_CHAPTER_LINKS = {
    "A": ["01"],
    "B": ["02"],
    "C": ["03", "04", "05"],
    "D": ["07"],
    "E": ["08", "09"],
    "F": ["06"],
}

# 线代 chapters link to the mind map's chapter files (knowledge-md/线代总目录.md).
XIANDAI_CHAPTER_LINKS = {"L1": ["10"], "L2": ["11"], "L3": ["12"], "L4": ["13"], "L5": ["14"], "L6": ["15"]}


def title_of(markdown: str) -> str:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""
