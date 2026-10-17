"""The text version of the question bank (bank-md/questions.json): stems, options and answers in Markdown + LaTeX.

Rendered to HTML once, on load. Formulas stay as .math elements for KaTeX in the browser, as on the knowledge pages.
The Worker gets the same HTML through pipeline.export_edge.
"""
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from .markdown import render_inline, render_markdown

BANK_FILE = "questions.json"
WIDE_OPTION = 24  # characters: with a longer option the options go one per line

_FUNCTIONS = re.compile(r"\\(arcsin|arccos|arctan|sinh|cosh|sin|cos|tan|cot|sec|csc|ln|log|lim|max|min|exp)(?![a-zA-Z])")
_COMMAND = re.compile(r"\\[a-zA-Z]+")
_MARKUP = re.compile(r"[$^_{}\\&]")


@dataclass(frozen=True)
class QuestionText:
    type: str  # choice | fill | solve
    figure: bool  # the question has a figure, so the original image is shown first
    stem: str  # HTML
    options: tuple[tuple[str, str], ...]  # (letter, inline HTML)
    options_wide: bool
    answer: str  # HTML
    answer_key: str | None  # the letter, for a choice question answered with one
    erratum: str | None  # inline HTML: what the book or its 答案速查 printed, when the answer was corrected
    search: str  # plain text of the stem and options

    def option(self, letter: str) -> str | None:
        return next((html for key, html in self.options if key == letter), None)

    def to_json(self) -> dict:
        return asdict(self)


def plain_text(markdown: str) -> str:
    """Readable text for searching: \\sin stays "sin", other commands and math markup go."""
    text = _FUNCTIONS.sub(lambda m: f" {m.group(1)} ", markdown)
    text = _MARKUP.sub(" ", _COMMAND.sub(" ", text.replace(r"\mathrm{e}", "e").replace(r"\mathrm{d}", "d")))
    return re.sub(r"\s+", " ", text).strip()


def question_text(entry: dict) -> QuestionText:
    options = entry.get("options") or {}
    return QuestionText(
        type=entry["type"],
        figure=bool(entry.get("figure")),
        stem=render_markdown(entry["stem"])[0],
        options=tuple((key, render_inline(value)) for key, value in sorted(options.items())),
        options_wide=any(len(value) > WIDE_OPTION for value in options.values()),
        answer=render_markdown(entry["answer"])[0],
        answer_key=key if entry["type"] == "choice" and (key := entry["answer"].strip()) in options else None,
        erratum=render_inline(entry["erratum"]) if entry.get("erratum") else None,
        search=plain_text(" ".join([entry["stem"], *options.values()])),
    )


def load_bank(bank_dir: Path | None) -> dict[int, QuestionText]:
    path = bank_dir / BANK_FILE if bank_dir else None
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {entry["num"]: question_text(entry) for entry in data["questions"]}
