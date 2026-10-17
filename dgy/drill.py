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


def kp_tree(kps: list[DrillKp]) -> list[tuple[str, list[DrillKp]]]:
    tree: list[tuple[str, list[DrillKp]]] = []
    for k in kps:
        if not tree or tree[-1][0] != k.section:
            tree.append((k.section, []))
        tree[-1][1].append(k)
    return tree
