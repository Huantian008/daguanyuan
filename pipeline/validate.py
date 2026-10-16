"""Check a built content folder: every question has its question image, answer and solution on disk."""
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .sources import CONTENT_DIR

_NOISE = re.compile(r"[\s;；,，、()（）]+")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    summary: str = ""

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        lines = [self.summary] if self.summary else []
        lines += [f"  错误：{e}" for e in self.errors]
        lines += [f"  提示：{n}" for n in self.notes]
        lines.append("校验通过" if self.ok else f"校验失败：{len(self.errors)} 个错误")
        return "\n".join(lines)


def validate(manifest: dict, content_dir: Path, expected: int = 613) -> Report:
    report = Report()
    questions = manifest["questions"]
    if [q["num"] for q in questions] != list(range(1, expected + 1)):
        report.errors.append(f"题号应为 1–{expected}，实际 {len(questions)} 题")

    def present(rel: str) -> bool:
        path = content_dir / rel
        return path.exists() and path.stat().st_size > 0

    images = answers = solved = solution_images = 0
    for q in questions:
        tag = f"#{q['num']:03d}"
        if present(q["img"]["src"]):
            images += 1
        else:
            report.errors.append(f"{tag} 缺少题面：{q['img']['src']}")
        if present(q["answer"]["src"]):
            answers += 1
        else:
            report.errors.append(f"{tag} 缺少答案：{q['answer']['src']}")
        if not q["solution"]:
            report.errors.append(f"{tag} 没有解析图")
        missing = [s["src"] for s in q["solution"] if not present(s["src"])]
        report.errors += [f"{tag} 缺少解析：{m}" for m in missing]
        if q["solution"] and not missing:
            solved += 1
            solution_images += len(q["solution"])
        if _NOISE.sub("", q["source"]) not in _NOISE.sub("", q["source_full"]):
            report.notes.append(f"{tag} 做题本出处“{q['source']}”与解析书签“{q['source_full']}”文字不一致，按顺序对齐，可抽查")

    for k in manifest["knowledge"]:
        lost = [p["src"] for p in k["pages"] if not present(p["src"])]
        report.errors += [f"知识点「{k['title']}」缺少页面：{m}" for m in lost]

    for num in manifest["alignment"]["weak"]:
        report.notes.append(f"#{num:03d} 与解析书签的年份、文字都对不上，只能靠位置对齐，请人工核对")
    for title in manifest["alignment"]["skipped"]:
        report.notes.append(f"解析中未导入（数二做题本没有）：{title}")

    report.summary = (f"题面 {images}/{expected}，答案 {answers}/{expected}，"
                      f"解析 {solved}/{expected}（共 {solution_images} 张图），"
                      f"知识点 {len(manifest['knowledge'])} 章")
    return report


def main() -> int:
    manifest = json.loads((CONTENT_DIR / "manifest.json").read_text(encoding="utf-8"))
    report = validate(manifest, CONTENT_DIR)
    print(report.render())
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
