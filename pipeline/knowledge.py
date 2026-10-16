"""Knowledge pages: the original PDF pages plus the (corrected) Markdown text version."""
import re

# 00_总目录.md lists which PDF pages each Markdown chapter came from:  | 10–22 | [01 …](./01_函数极限连续.md) | …
_INDEX_ROW = re.compile(r"^\|\s*(\d+)\s*[–-]\s*(\d+)\s*\|\s*\[[^\]]*\]\(\./([^)]+\.md)\)", re.M)

# Which knowledge chapters a 做题本 chapter should link to (by Markdown file prefix).
QUESTION_CHAPTER_LINKS = {
    "A": ["01"],
    "B": ["02"],
    "C": ["03", "04", "05"],
    "D": ["07"],
    "E": ["08", "09"],
    "F": ["06"],
}


def parse_markdown_index(text: str) -> list[tuple[str, int, int]]:
    return [(m.group(3), int(m.group(1)), int(m.group(2))) for m in _INDEX_ROW.finditer(text)]


def title_of(markdown: str) -> str:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""
