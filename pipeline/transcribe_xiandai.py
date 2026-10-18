"""Inputs and checks for transcribing 线代臻选题 into Markdown + LaTeX, the same way as the 高数 book
(pipeline.transcribe_questions, whose checks this reuses).

Two things differ. The question book is re-typeset and has typos (#002 lost its minus signs, #013 prints x3 for x2), so
every stem is checked against the original statement at the top of the answer book's solution. And there is no
答案速查: the answer is read off the solution, and `answer_basis` says whether the solution labels it 答案 or it was
taken from the working. The task description for the vision model is docs/deepseek/线代题目转写.md. Questions go by
their book number #001–#355 here; the site adds XIANDAI_OFFSET.

    .venv/bin/python -m pipeline.transcribe_xiandai prepare        # images and hints in content/xiandai/transcribe/
    .venv/bin/python -m pipeline.transcribe_xiandai check --probe  # the three test questions in out/probe.json
    .venv/bin/python -m pipeline.transcribe_xiandai check          # all results in out/*.json
    .venv/bin/python -m pipeline.transcribe_xiandai check --write  # ... and, with no errors, write bank-md/xiandai.json
    .venv/bin/python -m pipeline.transcribe_xiandai review         # side-by-side page: images | rendered transcription
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

from . import transcribe_questions as tq
from .chapters import XIANDAI_CHAPTERS, XIANDAI_OFFSET
from .imaging import trim_whitespace
from .link_questions import Report
from .xiandai import OUT_DIR, TEXTS_FILE

WORK_DIR = OUT_DIR / "transcribe"
REL_IMG_DIR = "content/xiandai/transcribe/img"
BANK_FILE = "xiandai.json"
ANSWER_BASIS = ("label", "derived")
REVIEW_PREFIX = "../../../"  # content/xiandai/transcribe/ -> repository root

_PRIVATE_USE = re.compile("[-]")  # the question book's big brackets and bars come out as these
_FULL_MARKS = re.compile(r"本题满分")

# Each needs the image: the PDF text has no matrix layout, and the first two are only right as the original prints them.
PROBE = {
    2: {"type": "fill", "pieces": [r"-1&2", r"\vdots"], "answer": [r"2^{n+1}-2"], "answer_basis": "label"},
    13: {"type": "fill", "pieces": [r"ax_2+x_3", r"\begin{cases}"], "answer": ["8"], "answer_basis": "derived"},
    147: {"type": "choice", "pieces": [r"\alpha^{\mathrm{T}}&0", "r(A)"], "answer": ["D"], "answer_basis": "label"},
}


# ---------- prepare ----------

def pdf_hint(text: str) -> str:
    return re.sub(r"\s+", " ", _PRIVATE_USE.sub(" ", text)).strip()


def _solution_pngs(srcs: list[Path], img_dir: Path, name: str) -> list[str]:
    """All of a question's solution images cut into bands, numbered on through the images: s002-1.png, s002-2.png …"""
    paths = []
    for src in srcs:
        for band in tq.split_bands(trim_whitespace(Image.open(src).convert("RGB"))):
            filename = f"{name}-{len(paths) + 1}.png"
            band.save(img_dir / filename)
            paths.append(f"{REL_IMG_DIR}/{filename}")
    return paths


def prepare(work_dir: Path = WORK_DIR, out_dir: Path = OUT_DIR) -> None:
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    texts = json.loads((out_dir / TEXTS_FILE).read_text(encoding="utf-8"))
    content_dir = out_dir.parent
    chapter_names = {c.code: c.name for c in XIANDAI_CHAPTERS}
    img_dir = work_dir / "img"
    shutil.rmtree(img_dir, ignore_errors=True)
    img_dir.mkdir(parents=True)
    (work_dir / "out").mkdir(exist_ok=True)
    split = solution_bands = 0
    with (work_dir / "questions.jsonl").open("w", encoding="utf-8") as out:
        for q in manifest["questions"]:
            book_num = q["num"] - XIANDAI_OFFSET
            n = f"{book_num:03d}"
            question_imgs = tq._save_png(content_dir / q["img"]["src"], img_dir, f"q{n}", REL_IMG_DIR)
            solution_imgs = _solution_pngs([content_dir / s["src"] for s in q["solution"]], img_dir, f"s{n}")
            split += len(question_imgs) > 1
            solution_bands += len(solution_imgs)
            text = pdf_hint(texts[str(book_num)]["question"])
            out.write(json.dumps({
                "num": book_num,
                "chapter": q["chapter"],
                "chapter_name": chapter_names[q["chapter"]],
                "path": q["path"],
                "kp": q["kp"],
                "source": q["source"],
                "type_hint": tq.type_hint(text),
                "pdf_text": text,
                "solution_text": pdf_hint(texts[str(book_num)]["solution"]),
                "question_images": question_imgs,
                "solution_images": solution_imgs,
            }, ensure_ascii=False) + "\n")
    print(f"线代 {len(manifest['questions'])} 题，切成多段的题图 {split} 张，解析图 {solution_bands} 段，已写入 {work_dir}")


# ---------- check ----------

def check_entry(where: str, entry: dict, report: Report) -> None:
    """What a 线代 result needs on top of the 高数 checks."""
    if entry.get("answer_basis") not in ANSWER_BASIS:
        report.errors.append(f"{where}：answer_basis 只能是 label（解析里标了「答案」）或 derived（从解析过程里得出）")
    if "mismatch" in entry and not (isinstance(entry["mismatch"], str) and entry["mismatch"].strip()):
        report.errors.append(f"{where}：mismatch 有就必须写明题目本和原书哪里不同")
    if _FULL_MARKS.search(entry.get("stem") or ""):
        report.warnings.append(f"{where}：题干里残留「本题满分」，和书上的题号、出处一样去掉")


def check(work_dir: Path = WORK_DIR, probe: bool = False, probe_file: str = tq.PROBE_FILE) -> tuple[Report, dict[int, dict]]:
    report, entries = tq.check(work_dir, probe, probe_file, spec=PROBE, extra=check_entry)
    if not probe and entries:
        derived = sorted(n for n, e in entries.items() if e.get("answer_basis") == "derived")
        mismatched = sorted(n for n, e in entries.items() if e.get("mismatch"))
        report.info.append(f"答案从解析推出 {len(derived)} 题：" + "、".join(f"#{n:03d}" for n in derived))
        report.info.append(f"题目本与原书不同 {len(mismatched)} 题：" + "、".join(f"#{n:03d}" for n in mismatched))
    return report, entries


def review(work_dir: Path = WORK_DIR, nums: list[int] | None = None) -> Path:
    """By default also every answer taken from the working and every stem that differs from the original."""
    return tq.review(work_dir, nums, check_fn=check, prefix=REVIEW_PREFIX,
                     also=lambda e: e.get("answer_basis") == "derived" or bool(e.get("mismatch")))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.transcribe_xiandai")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare", help="生成转写用的图片和参考信息")
    check_cmd = sub.add_parser("check", help="校验转写结果")
    check_cmd.add_argument("--probe", action="store_true", help="只校验看图测验 out/probe.json")
    check_cmd.add_argument("--probe-file", default=tq.PROBE_FILE, help="测验文件名，换模型接手时用另一个，例如 probe-harness.json")
    check_cmd.add_argument("--write", action="store_true", help="没有错误时写入 bank-md/xiandai.json")
    review_cmd = sub.add_parser("review", help="生成原图与转写的对照页")
    review_cmd.add_argument("--nums", help="只看这些题（书上题号），逗号分隔，例如 1,13,147")
    args = parser.parse_args(argv)
    if args.command == "prepare":
        prepare()
        return 0
    if args.command == "review":
        nums = [int(x) for x in args.nums.split(",")] if args.nums else None
        print(f"已写入 {review(nums=nums)}")
        return 0
    report, entries = check(probe=args.probe, probe_file=args.probe_file)
    print(report.render())
    if args.write and not args.probe and report.ok:
        print(f"已写入 {tq.write_bank(entries, tq.BANK_DIR, BANK_FILE)}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
