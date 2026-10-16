"""Small text helpers shared by the parsers."""
import re

# Exam years such as 1987–2049; no look-behind so "11996数二" (garbled prefix) still yields 1996.
_YEAR = re.compile(r"(19[5-9]\d|20[0-4]\d)(?!\d)")
_ENUMERATION = re.compile(r"^(?:\([0-9A-Za-z]+\)|[0-9A-Za-z]+[.)])\s+")


def years(text: str) -> set[str]:
    return set(_YEAR.findall(text))


def clean_outline_title(title: str) -> str:
    """'(1) 2004数三 >>' -> '2004数三'; '1. 积分计算 >>' -> '积分计算'."""
    title = title.strip()
    if title.endswith(">>"):
        title = title[:-2].rstrip()
    return _ENUMERATION.sub("", title, count=1)
