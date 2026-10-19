"""Inputs and checks for tagging the 线代 questions with sections of the 线代 mind map (knowledge-md/10–15).

The tagging itself is done by a language model; its task description is docs/deepseek/线代知识点标注.md. The stages
and checks are the 高数 ones (pipeline.link_questions): a default for each 考点 group, then every question. Unlike the
高数 round the questions come with a clean text version (bank-md/xiandai.json), so no image is needed to read them.
Questions go by their book number #001–#355 here; --write stores them as 1001–1355 in
knowledge-md/question_links.json and keeps the 高数 links already there.

    .venv/bin/python -m pipeline.link_xiandai prepare        # write the inputs to content/xiandai/linking/
    .venv/bin/python -m pipeline.link_xiandai check          # check the results there, print a report
    .venv/bin/python -m pipeline.link_xiandai check --write  # ... and, with no errors, merge them into question_links.json
"""
import argparse
import json
import sys
from pathlib import Path

from dgy.sections import section_bodies

from . import link_questions as lq
from . import sources
from .chapters import XIANDAI_CHAPTERS, XIANDAI_OFFSET
from .knowledge import XIANDAI_CHAPTER_LINKS, title_of

WORK_DIR = sources.XIANDAI_CONTENT_DIR / "linking"
TRANSCRIBE_DIR = sources.XIANDAI_CONTENT_DIR / "transcribe"
BANK_FILE = sources.PROJECT_ROOT / "bank-md" / "xiandai.json"
SLUGS = frozenset(slug for slugs in XIANDAI_CHAPTER_LINKS.values() for slug in slugs)
SITE_NUMS = range(XIANDAI_CHAPTERS[0].first, XIANDAI_CHAPTERS[-1].last + 1)


def prepare(work_dir: Path = WORK_DIR, markdown_dir: Path = lq.MARKDOWN_DIR, content_dir: Path = sources.XIANDAI_CONTENT_DIR,
            bank_file: Path = BANK_FILE, transcribe_dir: Path = TRANSCRIBE_DIR) -> None:
    sections = lq.book_sections(markdown_dir, SLUGS)
    notes = {p.name[:2]: p.read_text(encoding="utf-8") for p in sorted(markdown_dir.glob("[0-9][0-9]_*.md")) if p.name[:2] in SLUGS}
    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / "out").mkdir(exist_ok=True)
    catalog = lq.catalog_markdown(sections, {slug: title_of(text) for slug, text in notes.items()},
                                  {slug: section_bodies(text) for slug, text in notes.items()})
    (work_dir / "catalog.md").write_text(catalog, encoding="utf-8")

    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    texts = {e["num"]: e for e in json.loads(bank_file.read_text(encoding="utf-8"))["questions"]}
    lines = (transcribe_dir / "questions.jsonl").read_text(encoding="utf-8").splitlines() if transcribe_dir.exists() else []
    images = {q["num"]: q for q in (json.loads(line) for line in lines if line)}
    names = {c.code: c.name for c in XIANDAI_CHAPTERS}
    groups: dict[tuple[str, str, str], list[int]] = {}
    with (work_dir / "questions.jsonl").open("w", encoding="utf-8") as out:
        for q in manifest["questions"]:
            num = q["num"] - XIANDAI_OFFSET
            text = texts[num]
            groups.setdefault((q["chapter"], q["section"], q["kp"]), []).append(num)
            out.write(json.dumps({
                "num": num,
                "chapter": q["chapter"],
                "chapter_name": names[q["chapter"]],
                "knowledge_chapter": XIANDAI_CHAPTER_LINKS[q["chapter"]][0],
                "path": q["path"],
                "kp": q["kp"],
                "source": q["source"],
                "type": text["type"],
                "stem": text["stem"],
                "options": text["options"],
                "answer": text["answer"],
                "images": {
                    "question": images.get(num, {}).get("question_images", []),
                    "solution": images.get(num, {}).get("solution_images", []),
                },
            }, ensure_ascii=False) + "\n")

    kp_groups = [
        {"id": f"G{i:03d}", "chapter": chapter, "chapter_name": names[chapter], "section": section, "kp": kp, "nums": nums}
        for i, ((chapter, section, kp), nums) in enumerate(groups.items(), start=1)
    ]
    (work_dir / "kp_groups.json").write_text(json.dumps(kp_groups, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"线代小节 {len(sections)} 个，题目 {len(manifest['questions'])} 道，考点组 {len(kp_groups)} 个，已写入 {work_dir}")


def check(work_dir: Path = WORK_DIR, markdown_dir: Path = lq.MARKDOWN_DIR) -> lq.Report:
    return lq.check(work_dir, markdown_dir, SLUGS, XIANDAI_CHAPTER_LINKS)


def write(report: lq.Report, markdown_dir: Path = lq.MARKDOWN_DIR) -> Path:
    """Merge the results into question_links.json under site numbers, leaving the 高数 links as they are."""
    return lq.write_links({num + XIANDAI_OFFSET: keys for num, keys in report.links.items()}, markdown_dir, SITE_NUMS)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.link_xiandai")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare", help="生成线代标注所需的输入")
    check_cmd = sub.add_parser("check", help="校验线代标注结果")
    check_cmd.add_argument("--write", action="store_true", help="没有错误时并入 knowledge-md/question_links.json")
    args = parser.parse_args(argv)
    if args.command == "prepare":
        prepare()
        return 0
    report = check()
    print(report.render())
    if args.write and report.ok:
        print(f"已写入 {write(report)}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
