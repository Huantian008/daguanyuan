"""Dashboard numbers: pure functions over the question bank, card states and the review log."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from .content import Content
from .db import Review
from .srs import CardState



@dataclass(frozen=True)
class ChapterProgress:
    code: str
    name: str
    done: int
    total: int

    @property
    def percent(self) -> int:
        return round(100 * self.done / self.total) if self.total else 0


@dataclass(frozen=True)
class WeakSpot:
    chapter: str
    section: str
    kp: str
    nums: list[int]
    score: int


@dataclass(frozen=True)
class DayTotal:
    day: date
    count: int


def excluded_set(content: Content, overrides: dict[int, bool]) -> set[int]:
    excluded = content.default_excluded()
    for num, is_excluded in overrides.items():
        if is_excluded:
            excluded.add(num)
        else:
            excluded.discard(num)
    return excluded


def mastery_distribution(nums, cards: dict[int, CardState]) -> dict[str, int]:
    dist = {"mastered": 0, "shaky": 0, "unknown": 0, "new": 0}
    for num in nums:
        grade = cards[num].last_grade if num in cards else None
        dist[grade or "new"] += 1
    return dist


def due_queue(cards: dict[int, CardState], active: set[int], today: date) -> list[int]:
    due = [(c.due, c.level, num) for num, c in cards.items() if num in active and c.due and c.due <= today]
    return [num for _due, _level, num in sorted(due)]


def warmup_queue(reviews: list[Review], active: set[int], today: date, days: int = 3) -> list[int]:
    """Questions done on the last `days` study days that had any activity, minus those already redone today."""
    window = set(sorted({r.study_day for r in reviews if r.study_day < today}, reverse=True)[:days])
    done_today = {r.num for r in reviews if r.study_day == today}
    queue, seen = [], set()
    for r in sorted(reviews, key=lambda r: r.reviewed_at):
        if r.study_day in window and r.num in active and r.num not in done_today and r.num not in seen:
            seen.add(r.num)
            queue.append(r.num)
    return queue


def review_list(reviews: list[Review], mode: str, today: date, queue: list[int]) -> list[int]:
    """The cards on the warm-up or due-review page: those graded there today in the order graded, then `queue`, what is left."""
    graded: list[int] = []
    for r in reviews:
        if r.study_day == today and r.mode == mode and r.num not in graded:
            graded.append(r.num)
    return graded + [n for n in queue if n not in graded]


def last_drilled(reviews: list[Review], known) -> int | None:
    """The last question graded outside warm-up and due review, which is where 继续往下做 picks up."""
    return next((r.num for r in reversed(reviews) if r.mode not in ("warmup", "due") and known(r.num)), None)


def chapter_progress(content: Content, cards: dict[int, CardState], excluded: set[int]) -> list[ChapterProgress]:
    progress = []
    for ch in content.chapters:
        nums = [q.num for q in content.in_chapter(ch.code) if q.num not in excluded]
        done = sum(1 for num in nums if num in cards and cards[num].reps > 0)
        progress.append(ChapterProgress(ch.code, ch.name, done, len(nums)))
    return progress


def weak_spots(content: Content, cards: dict[int, CardState], excluded: set[int], top: int = 3) -> list[WeakSpot]:
    groups: dict[tuple[str, str, str], list[int]] = {}
    for num, q in sorted(content.questions.items()):
        if num not in excluded:
            groups.setdefault((q.chapter, q.section, q.kp), []).append(num)
    spots = []
    for (chapter, section, kp), nums in groups.items():
        weak = [n for n in nums if n in cards and cards[n].last_grade in ("shaky", "unknown")]
        score = sum(2 if cards[n].last_grade == "unknown" else 1 for n in weak)
        if score:
            spots.append(WeakSpot(chapter, section, kp, weak, score))
    spots.sort(key=lambda s: (-s.score, -len(s.nums), s.nums[0]))
    return spots[:top]


def streak(days: set[date], today: date) -> int:
    """Consecutive study days ending today (or yesterday, if nothing has been done yet today)."""
    day = today if today in days else today - timedelta(days=1)
    count = 0
    while day - timedelta(days=count) in days:
        count += 1
    return count


def daily_totals(reviews: list[Review], today: date, days: int = 30) -> list[DayTotal]:
    nums: dict[date, set[int]] = defaultdict(set)
    for r in reviews:
        nums[r.study_day].add(r.num)
    span = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    return [DayTotal(day, len(nums[day])) for day in span]
