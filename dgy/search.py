"""Shared search and filter semantics for chapter cards and the question bank."""
import unicodedata

STATUSES = ("all", "new", "unknown", "shaky", "mastered", "excluded")
SUBJECTS = ("all", "gaoshu", "xiandai")


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).lower()


def matches(question, text, query: str, subject: str, status: str, current: str) -> bool:
    if subject != "all" and ("xiandai" if question.chapter.startswith("L") else "gaoshu") != subject:
        return False
    if status != "all" and current != status:
        return False
    fields = (question.source_full, question.source, question.kp, question.section, text.search if text else "")
    haystack = " ".join("".join(normalize(field).split()) for field in fields)
    return all(token in haystack for token in normalize(query).split())
