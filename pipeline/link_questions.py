"""Inputs and checks for tagging every question with knowledge sections (the tagging itself is done by DeepSeek).

    .venv/bin/python -m pipeline.link_questions prepare        # write the inputs to content/linking/
    .venv/bin/python -m pipeline.link_questions check          # check content/linking/ results, print a report
    .venv/bin/python -m pipeline.link_questions check --write  # ... and, with no errors, write knowledge-md/question_links.json

All 613 questions are tagged; the task description for DeepSeek (docs/deepseek/) was removed once the work
was merged and is still in git history.
"""
import argparse
import json
import random
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from dgy.sections import LINKS_FILE, MAX_LINKS, Section, load_sections, section_bodies

from . import sources
from .knowledge import QUESTION_CHAPTER_LINKS

WORK_DIR = sources.CONTENT_DIR / "linking"
MARKDOWN_DIR = sources.PROJECT_ROOT / "knowledge-md"
EXCERPT_CHARS = 120
SAMPLE_SIZE = 40
CONFIDENCE = ("high", "low")

_COMMENT = re.compile(r"<!--.*?-->", re.S)
_TAG = re.compile(r"</?[a-zA-Z][^<>]*>")  # HTML tags only, not the < and > of math
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_TABLE_RULE = re.compile(r"^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$", re.M)
# Bold, blockquote and list markers, and table cell bars (a bar at a line end or with spaces around it, unlike |x|).
_MARKUP = re.compile(r"(\*\*|__|^>+|^\s*[-*+] |^\s*\d+\. |^\s*\||\|\s*$|\s\|\s)", re.M)


def excerpt(body: str, limit: int = EXCERPT_CHARS) -> str:
    text = _COMMENT.sub(" ", body)
    text = _TABLE_RULE.sub(" ", text)
    text = _IMAGE.sub(" ", text)
    text = _LINK.sub(r"\1", text)
    text = _TAG.sub(" ", text)
    text = _MARKUP.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def catalog_markdown(sections: dict[str, Section], chapter_titles: dict[str, str], bodies: dict[str, dict[str, str]]) -> str:
    """The section list DeepSeek chooses from: one line per section with a short excerpt of its text."""
    lines = ["# 知识点小节目录", "", "只能使用下面出现的 key。h3 比 h2 具体，优先选 h3。", ""]
    by_slug: dict[str, list[Section]] = {}
    for s in sections.values():
        by_slug.setdefault(s.slug, []).append(s)
    for slug, items in by_slug.items():
        lines += [f"## {slug} {chapter_titles.get(slug, '')}", ""]
        for s in items:
            children = [c for c in items if c.parent == s.key]
            text = excerpt(bodies.get(slug, {}).get(s.number, ""))
            if children:
                text = (text + " " if text else "") + "下设：" + "；".join(c.label for c in children)
            indent = "  " if s.level == 3 else ""
            lines.append(f"{indent}- `{s.key}` {s.label} — {text}" if text else f"{indent}- `{s.key}` {s.label}")
        lines.append("")
    return "\n".join(lines)


def question_text(page, rect) -> str:
    return re.sub(r"\s+", " ", page.get_text("text", clip=rect)).strip()


def prepare(work_dir: Path = WORK_DIR, markdown_dir: Path = MARKDOWN_DIR, content_dir: Path = sources.CONTENT_DIR) -> None:
    import fitz

    from .questions import parse_questions

    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    chapter_names = {c["code"]: c["name"] for c in manifest["chapters"]}
    chapter_titles = {k["slug"]: k["title"] for k in manifest["knowledge"]}
    sections = load_sections(markdown_dir)
    bodies = {p.name[:2]: section_bodies(p.read_text(encoding="utf-8")) for p in markdown_dir.glob("0[1-9]_*.md")}

    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / "out").mkdir(exist_ok=True)
    (work_dir / "catalog.md").write_text(catalog_markdown(sections, chapter_titles, bodies), encoding="utf-8")

    metas = {q.num: q for q in parse_questions(sources.QUESTIONS_PDF)}
    groups: dict[tuple[str, str, str], list[int]] = {}
    with fitz.open(sources.QUESTIONS_PDF) as doc, (work_dir / "questions.jsonl").open("w", encoding="utf-8") as out:
        for q in manifest["questions"]:
            meta = metas[q["num"]]
            groups.setdefault((q["chapter"], q["section"], q["kp"]), []).append(q["num"])
            out.write(json.dumps({
                "num": q["num"],
                "chapter": q["chapter"],
                "chapter_name": chapter_names[q["chapter"]],
                "path": q["path"],
                "kp": q["kp"],
                "source": q["source"],
                "text": question_text(doc[meta.page_index], meta.rect),
                "images": {
                    "question": f"content/{q['img']['src']}",
                    "answer": f"content/{q['answer']['src']}",
                    "solution": [f"content/{s['src']}" for s in q["solution"]],
                },
            }, ensure_ascii=False) + "\n")

    kp_groups = [
        {"id": f"G{i:03d}", "chapter": chapter, "chapter_name": chapter_names[chapter], "section": section, "kp": kp, "nums": nums}
        for i, ((chapter, section, kp), nums) in enumerate(groups.items(), start=1)
    ]
    (work_dir / "kp_groups.json").write_text(json.dumps(kp_groups, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"小节 {len(sections)} 个，题目 {len(manifest['questions'])} 道，考点组 {len(kp_groups)} 个，已写入 {work_dir}")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)
    links: dict[int, list[str]] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        out = []
        for title, items in (("错误", self.errors), ("警告", self.warnings), ("说明", self.info)):
            if items:
                out.append(f"== {title}（{len(items)}）==")
                out += [f"  {line}" for line in items]
        out.append("校验通过" if self.ok else "校验未通过：先修正上面的错误")
        return "\n".join(out)


def _check_keys(where: str, keys, sections: dict[str, Section], report: Report) -> list[str]:
    if not isinstance(keys, list) or not keys:
        report.errors.append(f"{where}：sections 必须是非空列表")
        return []
    if len(keys) > MAX_LINKS:
        report.errors.append(f"{where}：最多 {MAX_LINKS} 个小节，现在有 {len(keys)} 个")
    if len(set(keys)) != len(keys):
        report.errors.append(f"{where}：小节重复 {keys}")
    unknown = [k for k in keys if k not in sections]
    if unknown:
        report.errors.append(f"{where}：目录里没有这些 key {unknown}")
    return [k for k in keys if k in sections]


def check_defaults(defaults: dict, kp_groups: list[dict], sections: dict[str, Section], report: Report) -> dict[str, list[str]]:
    valid = {}
    for g in kp_groups:
        if g["id"] not in defaults:
            report.errors.append(f"kp_defaults.json：缺少 {g['id']}（{g['chapter_name']} / {g['section']} / {g['kp']}）")
            continue
        valid[g["id"]] = _check_keys(f"kp_defaults.json {g['id']}", defaults[g["id"]], sections, report)
    extra = sorted(set(defaults) - {g["id"] for g in kp_groups})
    if extra:
        report.errors.append(f"kp_defaults.json：没有这些考点组 {extra}")
    return valid


def check_results(entries: list[tuple[str, dict]], questions: list[dict], sections: dict[str, Section],
                  defaults: dict[str, list[str]], kp_groups: list[dict], report: Report) -> None:
    by_num = {q["num"]: q for q in questions}
    group_of = {num: g["id"] for g in kp_groups for num in g["nums"]}
    seen: dict[int, str] = {}
    low = []
    for filename, entry in entries:
        num = entry.get("num")
        where = f"{filename} #{num}"
        if num not in by_num:
            report.errors.append(f"{filename}：题号 {num!r} 不在 1–{len(by_num)}")
            continue
        if num in seen:
            report.errors.append(f"#{num:03d} 重复出现在 {seen[num]} 和 {filename}")
            continue
        seen[num] = filename
        keys = _check_keys(where, entry.get("sections"), sections, report)
        if entry.get("confidence") not in CONFIDENCE:
            report.errors.append(f"{where}：confidence 只能是 high 或 low")
        if entry.get("confidence") == "low":
            low.append(num)
        if not keys:
            continue
        report.links[num] = keys
        q = by_num[num]
        if sections[keys[0]].slug not in QUESTION_CHAPTER_LINKS.get(q["chapter"], []):
            report.warnings.append(f"#{num:03d}（{q['chapter_name']} / {q['kp']}）主小节 {keys[0]} 不在本章对应的知识点章节里")
        default = defaults.get(group_of.get(num, ""), [])
        if default and not set(keys) & set(default):
            report.warnings.append(f"#{num:03d}（{q['kp']}）和考点默认值 {default} 完全不同：{keys}")
    missing = sorted(set(by_num) - set(seen))
    if missing:
        report.errors.append(f"还有 {len(missing)} 题没有结果：" + "、".join(f"#{n:03d}" for n in missing[:40]) + (" …" if len(missing) > 40 else ""))
    if low:
        report.info.append(f"低把握 {len(low)} 题：" + "、".join(f"#{n:03d}" for n in low))
    counts = Counter(k for keys in report.links.values() for k in keys)
    unused = [k for k in sections if k not in counts]
    report.info.append("题目最多的小节：" + "；".join(f"{k} {sections[k].label} {n} 题" for k, n in counts.most_common(10)))
    report.info.append(f"没有题目的小节 {len(unused)} 个")
    if report.links:
        rng = random.Random(20261017)
        for num in sorted(rng.sample(sorted(report.links), min(SAMPLE_SIZE, len(report.links)))):
            q = by_num[num]
            report.info.append(f"抽查 #{num:03d} {q['kp']} → " + "；".join(f"{k} {sections[k].label}" for k in report.links[num]))


def _load_json(path: Path, report: Report):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        report.errors.append(f"{path.name}：读不出 JSON（{e}）")
        return None


def check(work_dir: Path = WORK_DIR, markdown_dir: Path = MARKDOWN_DIR) -> Report:
    report = Report()
    sections = load_sections(markdown_dir)
    questions = [json.loads(line) for line in (work_dir / "questions.jsonl").read_text(encoding="utf-8").splitlines() if line]
    kp_groups = json.loads((work_dir / "kp_groups.json").read_text(encoding="utf-8"))

    defaults: dict[str, list[str]] = {}
    defaults_path = work_dir / "kp_defaults.json"
    if defaults_path.exists():
        data = _load_json(defaults_path, report)
        if isinstance(data, dict):
            defaults = check_defaults(data, kp_groups, sections, report)
    else:
        report.errors.append("还没有 kp_defaults.json（第一阶段）")

    entries = []
    for path in sorted((work_dir / "out").glob("*.json")):
        data = _load_json(path, report)
        if data is None:
            continue
        items = data.get("questions") if isinstance(data, dict) else None
        if not isinstance(items, list):
            report.errors.append(f"{path.name}：顶层应为 {{\"questions\": [...]}}")
            continue
        entries += [(path.name, item) for item in items if isinstance(item, dict)]
    if entries:
        check_results(entries, questions, sections, defaults, kp_groups, report)
    else:
        report.errors.append("out/ 里还没有逐题结果（第二阶段）")
    return report


def write_links(links: dict[int, list[str]], markdown_dir: Path = MARKDOWN_DIR) -> Path:
    path = markdown_dir / LINKS_FILE
    # One question per line, so a change to one question's tags is a one-line diff.
    rows = ",\n".join(f'  "{num}": {json.dumps(links[num], ensure_ascii=False)}' for num in sorted(links))
    path.write_text(f'{{\n "version": 1,\n "links": {{\n{rows}\n }}\n}}\n', encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.link_questions")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare", help="从 PDF 和知识点 Markdown 生成标注所需的输入")
    check_cmd = sub.add_parser("check", help="校验标注结果")
    check_cmd.add_argument("--write", action="store_true", help="没有错误时写入 knowledge-md/question_links.json")
    args = parser.parse_args(argv)
    if args.command == "prepare":
        prepare()
        return 0
    report = check()
    print(report.render())
    if args.write and report.ok:
        print(f"已写入 {write_links(report.links)}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
