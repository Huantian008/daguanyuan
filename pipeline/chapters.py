"""The six 数二 chapters of the 做题本 and the question numbers each one covers."""
from dataclasses import dataclass


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


def chapter_of(num: int) -> str:
    for ch in CHAPTERS:
        if ch.first <= num <= ch.last:
            return ch.code
    raise ValueError(f"question #{num} is outside 1-613")
