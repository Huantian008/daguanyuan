"""Decide which questions a practice session contains."""
import random
from dataclasses import dataclass
from datetime import date

from . import stats
from .content import Content
from .db import Review
from .srs import CardState

WEAK_GRADES = ("shaky", "unknown")
SINGLE_TITLE_MAX = 5  # a hand-picked list longer than this is titled by its first question and the count


@dataclass(frozen=True)
class QueueSpec:
    mode: str  # warmup | due | group | single | random
    chapter: str | None = None
    section: str | None = None
    kp: str | None = None
    only: str = "all"  # all | new | weak
    nums: tuple[int, ...] = ()
    count: int = 10


def _group_title(content: Content, spec: QueueSpec) -> str:
    parts = [content.chapter(spec.chapter).name] if spec.chapter else ["全部章节"]
    parts += [p for p in (spec.section, spec.kp) if p]
    title = " / ".join(parts)
    if spec.only == "new":
        title += "（没做过的）"
    elif spec.only == "weak":
        title = "巩固 · " + title
    return title


def _keep(num: int, only: str, cards: dict[int, CardState]) -> bool:
    card = cards.get(num)
    if only == "new":
        return card is None or card.reps == 0
    if only == "weak":
        return card is not None and card.last_grade in WEAK_GRADES
    return True


def build_queue(spec: QueueSpec, content: Content, cards: dict[int, CardState], reviews: list[Review],
                excluded: set[int], today: date, warmup_days: int, rng: random.Random | None = None) -> tuple[str, list[int]]:
    active = set(content.questions) - excluded
    if spec.mode == "warmup":
        return "热身 · 重做前几天的题", stats.warmup_queue(reviews, active, today, warmup_days)
    if spec.mode == "due":
        return "到期复习", stats.due_queue(cards, active, today)
    if spec.mode == "single":
        nums = [n for n in spec.nums if n in content.questions]
        if len(nums) > SINGLE_TITLE_MAX:
            return f"#{nums[0]:03d} 等 {len(nums)} 题", nums
        return ("#" + "、#".join(f"{n:03d}" for n in nums)), nums
    if spec.mode == "random":
        pool = sorted(n for n in active if _keep(n, spec.only, cards))
        picked = (rng or random.Random()).sample(pool, min(spec.count, len(pool)))
        return f"随机 {len(picked)} 题", picked
    if spec.mode == "group":
        nums = [
            q.num for q in sorted(content.questions.values(), key=lambda q: q.num)
            if q.num in active
            and (spec.chapter is None or q.chapter == spec.chapter)
            and (spec.section is None or q.section == spec.section)
            and (spec.kp is None or q.kp == spec.kp)
            and _keep(q.num, spec.only, cards)
        ]
        return _group_title(content, spec), nums
    raise ValueError(f"unknown practice mode {spec.mode!r}")
