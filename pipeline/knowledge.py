"""Knowledge pages: the original PDF pages plus the (corrected) Markdown text version."""
from dgy.sections import parse_markdown_index

__all__ = ["QUESTION_CHAPTER_LINKS", "parse_markdown_index", "title_of"]

# Which knowledge chapters a 做题本 chapter should link to (by Markdown file prefix).
QUESTION_CHAPTER_LINKS = {
    "A": ["01"],
    "B": ["02"],
    "C": ["03", "04", "05"],
    "D": ["07"],
    "E": ["08", "09"],
    "F": ["06"],
}


def title_of(markdown: str) -> str:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""
