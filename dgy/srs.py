"""Spaced repetition: five levels with review intervals of 1, 3, 7, 14 and 30 days.

Grades: mastered = 完全掌握, shaky = 不熟练/错误, unknown = 完全不会.
"""
from dataclasses import dataclass
from datetime import date, timedelta

INTERVALS = (1, 3, 7, 14, 30)
GRADES = ("mastered", "shaky", "unknown")
GRADE_LABELS = {"mastered": "完全掌握", "shaky": "不熟练/错误", "unknown": "完全不会"}


@dataclass(frozen=True)
class CardState:
    level: int = 0  # 0 = never reviewed
    due: date | None = None
    last_grade: str | None = None
    reps: int = 0
    lapses: int = 0


def schedule(state: CardState, grade: str, today: date) -> CardState:
    if grade not in GRADES:
        raise ValueError(f"unknown grade {grade!r}")
    if grade == "mastered":
        level = 3 if state.level == 0 else min(state.level + 1, len(INTERVALS))
    elif grade == "shaky":
        level = max(state.level - 1, 1)
    else:
        level = 1
    return CardState(
        level=level,
        due=today + timedelta(days=INTERVALS[level - 1]),
        last_grade=grade,
        reps=state.reps + 1,
        lapses=state.lapses + (grade == "unknown"),
    )
