"""The chapters of the two question books and the question numbers each one covers.

高数: the six 数二 chapters of the 做题本, #001–#613. 线代: the six chapters of 线代臻选题, whose book numbers #001–#355
are stored as 1000 + the book number (1001–1355) so they never clash with 高数, and shown as 线001.
"""
from dataclasses import dataclass

from dgy.bank import XIANDAI_OFFSET


@dataclass(frozen=True)
class Chapter:
    code: str
    name: str
    first: int
    last: int


CHAPTERS = (
    Chapter("A", "函数极限连续", 1, 117),
    Chapter("B", "一元微分", 118, 244),
    Chapter("C", "一元积分", 245, 398),
    Chapter("D", "多元微分", 399, 464),
    Chapter("E", "二重积分", 465, 524),
    Chapter("F", "微分方程", 525, 613),
)

XIANDAI_CHAPTERS = (
    Chapter("L1", "行列式", 1001, 1040),
    Chapter("L2", "矩阵", 1041, 1115),
    Chapter("L3", "向量", 1116, 1146),
    Chapter("L4", "方程组", 1147, 1220),
    Chapter("L5", "特征值与特征向量", 1221, 1284),
    Chapter("L6", "二次型", 1285, 1355),
)


def chapter_of(num: int) -> str:
    for ch in CHAPTERS + XIANDAI_CHAPTERS:
        if ch.first <= num <= ch.last:
            return ch.code
    raise ValueError(f"question #{num} is outside 1-613 and 1001-1355")


def label(num: int) -> str:
    """How the site shows a question number: #001 for 高数, 线001 for 线代."""
    return f"线{num - XIANDAI_OFFSET:03d}" if num > XIANDAI_OFFSET else f"#{num:03d}"
