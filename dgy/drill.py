"""The chapter page as a drill: one 考点 at a time with its questions laid out, and a tree of the chapter's 考点."""
from dataclasses import dataclass

from .content import Content, Question


@dataclass(frozen=True)
class DrillKp:
    index: int  # 1-based over the whole chapter, the value of ?kp=
    section: str
    kp: str
    questions: list[Question]
    done: int  # questions that are not excluded and have been graded at least once
    total: int  # questions that are not excluded


def drill_kps(content: Content, code: str, status) -> list[DrillKp]:
    """Every 考点 of a chapter in book order; `status(num)` is the question's status (excluded / new / …)."""
    kps = []
    for section, items in content.outline(code):
        for kp, qs in items:
            open_qs = [q for q in qs if status(q.num) != "excluded"]
            done = sum(1 for q in open_qs if status(q.num) != "new")
            kps.append(DrillKp(len(kps) + 1, section, kp, qs, done, len(open_qs)))
    return kps


def default_kp(kps: list[DrillKp]) -> int:
    """The first 考点 that still has a question not done yet, else the first one."""
    return next((k.index for k in kps if k.done < k.total), 1)


def kp_index_of(content: Content, code: str, section: str, kp: str, status) -> int:
    """The ?kp= of the 考点 a question is in."""
    return next((k.index for k in drill_kps(content, code, status) if k.section == section and k.kp == kp), 1)


def onward_kp(content: Content, status, last: Question | None = None) -> tuple[str, DrillKp] | None:
    """Where 继续往下做 goes: the first 考点 with a question not done yet, from the one `last` is in onwards through the
    book, round again from the start; from the very first 考点 when there is no `last`. None when everything is done."""
    codes = [c.code for c in content.chapters]
    start = codes.index(last.chapter) if last else 0
    at = next(i for i, k in enumerate(drill_kps(content, last.chapter, status)) if last in k.questions) if last else 0
    for step in range(len(codes) + 1):
        code = codes[(start + step) % len(codes)]
        kps = drill_kps(content, code, status)
        # the starting chapter is looked at twice: from `last`'s 考点 on, and at the end the 考点 before it
        span = kps[at:] if step == 0 else kps[:at] if step == len(codes) else kps
        found = next((k for k in span if k.done < k.total), None)
        if found:
            return code, found
    return None


def kp_tree(kps: list[DrillKp]) -> list[tuple[str, list[DrillKp]]]:
    tree: list[tuple[str, list[DrillKp]]] = []
    for k in kps:
        if not tree or tree[-1][0] != k.section:
            tree.append((k.section, []))
        tree[-1][1].append(k)
    return tree
