"""Parse 答案速查: one row per question, id "NN-MMM" = MMM-th question of chapter NN, one answer image per row."""
import re
from dataclasses import dataclass

import fitz

from .chapters import CHAPTERS

ROW_ID = re.compile(r"^(\d\d)-(\d{3})$")


@dataclass(frozen=True)
class AnswerRef:
    num: int
    quick_id: str
    page_index: int
    xref: int
    bbox: tuple[float, float, float, float]
    source_text: str


def parse_answers(pdf_path) -> dict[int, AnswerRef]:
    found: dict[int, AnswerRef] = {}
    with fitz.open(pdf_path) as doc:
        for page in doc:
            words = page.get_text("words")
            rows = sorted((w for w in words if ROW_ID.match(w[4])), key=lambda w: w[1])
            images = sorted(page.get_image_info(xrefs=True), key=lambda im: im["bbox"][1])
            if len(rows) != len(images):
                raise ValueError(f"page {page.number + 1}: {len(rows)} rows but {len(images)} answer images")
            for i, (row, image) in enumerate(zip(rows, images)):
                top = row[1] - 6
                bottom = rows[i + 1][1] - 6 if i + 1 < len(rows) else page.rect.height
                x0, y0, _x1, y1 = image["bbox"]
                if not top <= (y0 + y1) / 2 < bottom:
                    raise ValueError(f"page {page.number + 1}: answer image for {row[4]} lies outside its row")
                chapter_no, index = ROW_ID.match(row[4]).groups()
                num = CHAPTERS[int(chapter_no) - 1].first + int(index) - 1
                source_text = " ".join(w[4] for w in words if top <= w[1] < bottom and row[2] < w[0] < x0)
                found[num] = AnswerRef(num, row[4], page.number, image["xref"], tuple(image["bbox"]), source_text)
    return found
