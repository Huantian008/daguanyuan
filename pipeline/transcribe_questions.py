"""Inputs and checks for transcribing the question and answer images into Markdown + LaTeX.

The transcription itself was done by a vision model (DeepSeek in opencode); all 613 questions are in, and the task
description (docs/deepseek/) was removed once the work was merged and is still in git history.

    .venv/bin/python -m pipeline.transcribe_questions prepare        # images and hints in content/transcribe/
    .venv/bin/python -m pipeline.transcribe_questions check --probe  # the three test questions in out/probe.json
    .venv/bin/python -m pipeline.transcribe_questions check          # all results in out/*.json
    .venv/bin/python -m pipeline.transcribe_questions check --write  # ... and, with no errors, write bank-md/questions.json
    .venv/bin/python -m pipeline.transcribe_questions review         # side-by-side page: image | rendered transcription
"""
import argparse
import html
import json
import random
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

from . import sources
from .link_questions import Report, _load_json, question_text

WORK_DIR = sources.CONTENT_DIR / "transcribe"
BANK_DIR = sources.PROJECT_ROOT / "bank-md"
BANK_FILE = "questions.json"
KATEX_CHECK = Path(__file__).with_name("katex_check.mjs")

TYPES = ("choice", "fill", "solve")
OPTION_KEYS = ("A", "B", "C", "D")
CONFIDENCE = ("high", "low")
FIELDS = ("num", "type", "stem", "options", "figure", "answer")
# Added in review when the book or its 答案速查 is wrong: the answer holds the correct value, this says what was printed.
OPTIONAL_FIELDS = ("erratum",)
MAX_PIXELS = 640_000  # what the vision model sees without shrinking (about 800 x 800)
COVERAGE_MIN = 0.8
SAMPLE_SIZE = 40
PROBE_FILE = "probe.json"
FULL_WIDTH_IN_MATH = re.compile(r"[，；。：、]")
# A row break that swallowed the backslash of the command after it: \\dfrac is a row break and then the letters
# "dfrac", which KaTeX prints without complaint (it happened in matrices of fractions).
SWALLOWED_BACKSLASH = re.compile(r"(?<!\\)\\\\(d?frac|tfrac|sqrt|alpha|beta|gamma|delta|lambda|mu|xi|eta|theta|varepsilon"
                                 r"|cdots|vdots|ddots|ldots|left|right|quad|qquad|text|cdot|times|mathrm|boldsymbol)(?![a-zA-Z])")

# Book numbering left at the start of a stem: (5)  （5）  【11】  【例 6.12】  4.  4、
BOOK_LABEL = re.compile(r"^\s*(\(\s*\d+\s*\)|（\s*\d+\s*）|【[^】]{0,12}】|\d+\s*[.．、])")
# The exam a question comes from, which the site already shows: (2018, 数二)  （2009，数二、数三）
SOURCE_LABEL = re.compile(r"^\s*[（(]\s*(?:19|20)\d\d\s*[,，][^)）]{0,20}[)）]")
_DISPLAY = re.compile(r"\$\$(.+?)\$\$", re.S)
_INLINE = re.compile(r"\$(.+?)\$")
_TEXT_COMMANDS = re.compile(r"\\(arcsin|arccos|arctan|sinh|cosh|sin|cos|tan|cot|sec|csc|ln|log|lim|max|min|exp)(?![a-zA-Z])")
_COMMAND = re.compile(r"\\[a-zA-Z]+")
_ALNUM = re.compile(r"[0-9A-Za-z]")

# Test questions whose PDF text has lost the structure, so only reading the image gets these pieces right.
PROBE = {
    12: {"type": "solve", "pieces": [r"\sqrt{1+2\sin x}", r"x\ln(1+x)", r"\lim_{x\to0}"]},
    205: {"type": "choice", "figure": True, "pieces": ["y=f(x)", "y=f'(x)"]},
    300: {"type": "fill", "pieces": [r"\int_{-2}^{2}", r"x+|x|", r"\mathrm{e}^{-|x|}"]},
}


# ---------- prepare ----------

def _blank_gaps(img: Image.Image, threshold: int = 250) -> list[int]:
    """The middle row of each run of blank rows: cutting there keeps clear of the faint edges of glyphs."""
    gray = img.convert("L")
    w = gray.width
    data = gray.tobytes()
    blank = [min(data[y * w:(y + 1) * w]) >= threshold for y in range(gray.height)]
    gaps, start = [], None
    for y, is_blank in enumerate(blank + [False]):
        if is_blank and start is None:
            start = y
        elif not is_blank and start is not None:
            gaps.append((start + y - 1) // 2)
            start = None
    return gaps


def split_bands(img: Image.Image, max_pixels: int = MAX_PIXELS) -> list[Image.Image]:
    """Cut a tall image into bands of at most max_pixels, each cut in a blank gap between lines where there is one."""
    if img.width * img.height <= max_pixels:
        return [img]
    limit = max(1, max_pixels // img.width)
    gaps = _blank_gaps(img)
    bands, top = [], 0
    while img.height - top > limit:
        candidates = [y for y in gaps if top < y <= top + limit]
        cut = candidates[-1] if candidates else top + limit
        bands.append(img.crop((0, top, img.width, cut)))
        top = cut
    bands.append(img.crop((0, top, img.width, img.height)))
    return bands


def type_hint(text: str) -> str:
    if re.search(r"A\s*[.．]", text) and re.search(r"B\s*[.．]", text):
        return "choice"
    if "__" in text:
        return "fill"
    return "solve"


def _save_png(src: Path, out_dir: Path, name: str, rel_dir: str = "content/transcribe/img") -> list[str]:
    from .imaging import trim_whitespace

    img = trim_whitespace(Image.open(src).convert("RGB"))
    bands = split_bands(img)
    paths = []
    for i, band in enumerate(bands, start=1):
        filename = f"{name}.png" if len(bands) == 1 else f"{name}-{i}.png"
        band.save(out_dir / filename)
        paths.append(f"{rel_dir}/{filename}")
    return paths


def prepare(work_dir: Path = WORK_DIR, content_dir: Path = sources.CONTENT_DIR) -> None:
    import fitz

    from .questions import parse_questions

    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    chapter_names = {c["code"]: c["name"] for c in manifest["chapters"]}
    img_dir = work_dir / "img"
    shutil.rmtree(img_dir, ignore_errors=True)
    img_dir.mkdir(parents=True)
    (work_dir / "out").mkdir(exist_ok=True)
    metas = {q.num: q for q in parse_questions(sources.QUESTIONS_PDF)}
    split = 0
    with fitz.open(sources.QUESTIONS_PDF) as doc, (work_dir / "questions.jsonl").open("w", encoding="utf-8") as out:
        for q in manifest["questions"]:
            n = f"{q['num']:03d}"
            meta = metas[q["num"]]
            text = question_text(doc[meta.page_index], meta.rect)
            question_imgs = _save_png(content_dir / q["img"]["src"], img_dir, f"q{n}")
            answer_imgs = _save_png(content_dir / q["answer"]["src"], img_dir, f"a{n}")
            split += len(question_imgs) > 1
            out.write(json.dumps({
                "num": q["num"],
                "chapter": q["chapter"],
                "chapter_name": chapter_names[q["chapter"]],
                "path": q["path"],
                "kp": q["kp"],
                "source": q["source"],
                "type_hint": type_hint(text),
                "pdf_text": text,
                "question_images": question_imgs,
                "answer_images": answer_imgs,
            }, ensure_ascii=False) + "\n")
    print(f"题目 {len(manifest['questions'])} 道，切成多段的题图 {split} 张，已写入 {work_dir}")


# ---------- check ----------

def math_segments(text: str) -> list[tuple[bool, str]]:
    """(display?, TeX) for each $$…$$ and $…$ in a Markdown string, like the site's dollarmath renderer."""
    text = text.replace(r"\$", "")
    found = [(True, m.group(1)) for m in _DISPLAY.finditer(text)]
    found += [(False, m.group(1)) for m in _INLINE.finditer(_DISPLAY.sub(" ", text))]
    return found


def unbalanced_dollars(text: str) -> bool:
    return _DISPLAY.sub(" ", text.replace(r"\$", "")).count("$") % 2 == 1


def plain_chars(markdown: str) -> Counter:
    """Digits and Latin letters a reader would see: \\sin counts as "sin", other commands count as nothing."""
    text = _TEXT_COMMANDS.sub(lambda m: f" {m.group(1)} ", markdown)  # spaced, so it cannot merge with a preceding command
    text = text.replace(r"\mathrm{e}", "e").replace(r"\mathrm{d}", "d")
    return Counter(_ALNUM.findall(_COMMAND.sub(" ", text)))


def strip_labels(text: str) -> str:
    """The text without the book's numbering and exam source at its start, in either order."""
    while (m := BOOK_LABEL.match(text) or SOURCE_LABEL.match(text)):
        text = text[m.end():]
    return text


def coverage(pdf_text: str, entry: dict) -> float:
    """Share of the PDF text's digits and letters found again in the transcription (1.0 when the PDF has none)."""
    expected = plain_chars(strip_labels(pdf_text))
    if not expected:
        return 1.0
    written = plain_chars(entry.get("stem") or "")
    for key, value in (entry.get("options") or {}).items():
        written += plain_chars(f"{key} {value}")
    return sum(min(n, written[c]) for c, n in expected.items()) / sum(expected.values())


def _texts(entry: dict) -> list[tuple[str, str]]:
    parts = [("stem", entry.get("stem") or ""), ("answer", entry.get("answer") or ""), ("erratum", entry.get("erratum") or "")]
    parts += [(f"options.{k}", v) for k, v in (entry.get("options") or {}).items() if isinstance(v, str)]
    return parts


def check_entry(where: str, entry: dict, report: Report) -> None:
    for name in FIELDS + ("confidence",):
        if name not in entry:
            report.errors.append(f"{where}：缺少字段 {name}")
    kind = entry.get("type")
    if kind not in TYPES:
        report.errors.append(f"{where}：type 只能是 {'、'.join(TYPES)}")
    stem, answer, options = entry.get("stem"), entry.get("answer"), entry.get("options")
    if not isinstance(stem, str) or not stem.strip():
        report.errors.append(f"{where}：stem 不能为空")
        stem = ""
    if not isinstance(answer, str) or not answer.strip():
        report.errors.append(f"{where}：answer 不能为空")
    if entry.get("confidence") not in CONFIDENCE:
        report.errors.append(f"{where}：confidence 只能是 high 或 low")
    elif entry["confidence"] == "low" and not entry.get("note"):
        report.errors.append(f"{where}：低把握必须写 note")
    if not isinstance(entry.get("figure"), bool):
        report.errors.append(f"{where}：figure 只能是 true 或 false")
    if "erratum" in entry and not (isinstance(entry["erratum"], str) and entry["erratum"].strip()):
        report.errors.append(f"{where}：erratum 有就必须是非空文字")
    if kind == "choice":
        if options is None and not entry.get("figure"):
            report.errors.append(f"{where}：选择题要有 A–D 选项（选项是图形时才可以为 null，并设 figure: true）")
        elif options is not None and (not isinstance(options, dict) or sorted(options) != list(OPTION_KEYS)
                                      or not all(isinstance(v, str) and v.strip() for v in options.values())):
            report.errors.append(f"{where}：options 必须正好是非空的 A、B、C、D")
    elif options is not None:
        report.errors.append(f"{where}：只有选择题才有 options，其他题型写 null")
    if kind == "fill" and r"\underline" not in stem:
        report.errors.append(f"{where}：填空题的空位写成 $\\underline{{\\qquad\\qquad}}$")
    for part, text in _texts(entry):
        if unbalanced_dollars(text):
            report.errors.append(f"{where} {part}：$ 没有成对")
    if label := BOOK_LABEL.match(stem) or SOURCE_LABEL.match(stem):
        report.warnings.append(f"{where}：开头疑似残留书上的题号或出处「{label.group(0).strip()}」")


def katex_errors(formulas: list[dict]) -> list[dict] | None:
    """Compile every formula with the site's own KaTeX; None when Node is not available."""
    node = shutil.which("node")
    if node is None or not formulas:
        return None if node is None else []
    result = subprocess.run([node, str(KATEX_CHECK)], input=json.dumps(formulas, ensure_ascii=False),
                            capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(result.stdout)


def math_slips(tex: str) -> list[str]:
    """Mistakes in a formula that KaTeX still renders, so its compile check cannot catch them."""
    slips = []
    # A stray ， only ever gets into math by a bulk find-and-replace.
    if found := FULL_WIDTH_IN_MATH.search(tex):
        slips.append(f"公式里有全角标点「{found.group(0)}」，公式内一律用半角")
    if found := SWALLOWED_BACKSLASH.search(tex):
        name = found.group(1)
        slips.append(f"换行符后面的 \\{name} 少了反斜杠（写成了 \\\\{name}，应为 \\\\\\{name}）")
    return slips


def check_formulas(entries: list[tuple[str, dict]], report: Report) -> None:
    formulas = []
    for where, entry in entries:
        for part, text in _texts(entry):
            for i, (display, tex) in enumerate(math_segments(text)):
                formulas.append({"id": f"{where} {part} 第{i + 1}个公式", "tex": tex, "display": display})
    for f in formulas:
        report.errors += [f"{f['id']}：{slip}" for slip in math_slips(f["tex"])]
    errors = katex_errors(formulas)
    if errors is None:
        report.warnings.append("没有找到 node，跳过公式编译检查")
        return
    report.errors += [f"{e['id']}：KaTeX 渲染不了（{e['error']}）" for e in errors]
    report.info.append(f"公式 {len(formulas)} 段，KaTeX 编译失败 {len(errors)} 段")


def normalize_tex(text: str) -> str:
    text = re.sub(r"\\(left|right|displaystyle|limits|mathrm|,|;|!|quad|qquad)(?![a-zA-Z])", "", text)
    text = re.sub(r"\\(lvert|rvert|vert)(?![a-zA-Z])", "|", text)
    text = re.sub(r"\\rightarrow(?![a-zA-Z])", r"\\to", text)
    text = re.sub(r"\^\{?\\prime\}?", "'", text)
    return re.sub(r"[\s{}]", "", text)


def check_probe(entries: dict[int, dict], report: Report, spec: dict[int, dict] = PROBE) -> None:
    """Each test question needs its type, and pieces of TeX in its text; optionally pieces of its answer and other fields."""
    for num, expect in spec.items():
        entry = entries.get(num)
        if entry is None:
            report.errors.append(f"测验 #{num:03d}：没有结果")
            continue
        written = normalize_tex(" ".join(text for _part, text in _texts(entry)))
        missing = [p for p in expect["pieces"] if normalize_tex(p) not in written]
        answer = normalize_tex(entry.get("answer") or "")
        wrong_answer = [p for p in expect.get("answer", []) if normalize_tex(p) not in answer]
        before = len(report.errors)
        if entry.get("type") != expect["type"]:
            report.errors.append(f"测验 #{num:03d}：题型应为 {expect['type']}")
        if "figure" in expect and entry.get("figure") is not expect["figure"]:
            report.errors.append(f"测验 #{num:03d}：这题带图，figure 应为 true")
        for field in ("answer_basis",):
            if field in expect and entry.get(field) != expect[field]:
                report.errors.append(f"测验 #{num:03d}：{field} 应为 {expect[field]}")
        if missing:
            report.errors.append(f"测验 #{num:03d}：没转出这些内容 {missing}，模型可能没看到或没看清图片")
        if wrong_answer:
            report.errors.append(f"测验 #{num:03d}：答案里没有 {wrong_answer}，模型可能没看到或没看清解析图")
        if len(report.errors) == before:
            report.info.append(f"测验 #{num:03d}：关键内容都对上了")


def load_questions(work_dir: Path) -> dict[int, dict]:
    lines = (work_dir / "questions.jsonl").read_text(encoding="utf-8").splitlines()
    return {q["num"]: q for q in (json.loads(line) for line in lines if line)}


def load_results(work_dir: Path, report: Report, probe: bool = False, probe_file: str = PROBE_FILE) -> list[tuple[str, dict]]:
    # Probe files (probe.json, probe-harness.json, ...) are never part of the full results.
    paths = [work_dir / "out" / probe_file] if probe else \
        [p for p in sorted((work_dir / "out").glob("*.json")) if not p.name.startswith("probe")]
    entries = []
    for path in paths:
        if not path.exists():
            report.errors.append(f"还没有 out/{path.name}")
            continue
        data = _load_json(path, report)
        items = data.get("questions") if isinstance(data, dict) else None
        if not isinstance(items, list):
            if data is not None:
                report.errors.append(f"{path.name}：顶层应为 {{\"questions\": [...]}}")
            continue
        entries += [(f"{path.name} #{item.get('num')}", item) for item in items if isinstance(item, dict)]
    return entries


def check(work_dir: Path = WORK_DIR, probe: bool = False, probe_file: str = PROBE_FILE, spec: dict[int, dict] = PROBE,
          extra=None) -> tuple[Report, dict[int, dict]]:
    """`extra(where, entry, report)` adds the checks of another book (pipeline.transcribe_xiandai)."""
    report = Report()
    questions = load_questions(work_dir)
    entries = load_results(work_dir, report, probe, probe_file)
    by_num: dict[int, dict] = {}
    for where, entry in entries:
        num = entry.get("num")
        if num not in questions:
            report.errors.append(f"{where}：题号不在 1–{len(questions)}")
            continue
        if num in by_num:
            report.errors.append(f"#{num:03d} 重复出现")
            continue
        by_num[num] = entry
        check_entry(where, entry, report)
        if extra:
            extra(where, entry, report)
        ratio = coverage(questions[num]["pdf_text"], entry)
        if ratio < COVERAGE_MIN:
            report.warnings.append(f"{where}：PDF 文字里的数字和字母只找回 {ratio:.0%}，可能漏了内容")
    check_formulas(entries, report)
    if probe:
        check_probe(by_num, report, spec)
        return report, by_num
    missing = sorted(set(questions) - set(by_num))
    if missing:
        report.errors.append(f"还有 {len(missing)} 题没有结果：" + "、".join(f"#{n:03d}" for n in missing[:40])
                             + (" …" if len(missing) > 40 else ""))
    low = sorted(n for n, e in by_num.items() if e.get("confidence") == "low")
    if low:
        report.info.append(f"低把握 {len(low)} 题：" + "、".join(f"#{n:03d}" for n in low))
    kinds = Counter(e.get("type") for e in by_num.values())
    report.info.append("题型：" + "，".join(f"{k} {kinds[k]}" for k in TYPES) + f"；带图 {sum(1 for e in by_num.values() if e.get('figure'))} 题")
    if by_num:
        rng = random.Random(20261017)
        sample = sorted(rng.sample(sorted(by_num), min(SAMPLE_SIZE, len(by_num))))
        report.info.append("抽查：" + "、".join(f"#{n:03d}" for n in sample))
    return report, by_num


def write_bank(entries: dict[int, dict], bank_dir: Path = BANK_DIR, bank_file: str = BANK_FILE) -> Path:
    bank_dir.mkdir(parents=True, exist_ok=True)
    path = bank_dir / bank_file
    # One question per line, so correcting one question is a one-line diff.
    keep = lambda e: {k: e[k] for k in FIELDS + OPTIONAL_FIELDS if k in e}  # noqa: E731
    rows = ",\n".join("  " + json.dumps(keep(entries[n]), ensure_ascii=False) for n in sorted(entries))
    path.write_text(f'{{\n "version": 1,\n "questions": [\n{rows}\n ]\n}}\n', encoding="utf-8")
    return path


# ---------- review ----------

BASIS_LABELS = {"label": " · 答案照原书", "derived": " · 答案从解析推出"}

REVIEW_STYLE = """
body { font: 15px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 24px; color: #12151c; background: #f5f6f8; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; background: #fff; border: 1px solid #e6e8ed;
  border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
.row h2 { grid-column: 1 / -1; margin: 0; font-size: 15px; }
.row h2 small { color: #7d8595; font-weight: 400; margin-left: 8px; }
.row img { max-width: 100%; height: auto; display: block; margin-bottom: 8px; }
.row img.answer-img { max-height: 96px; width: auto; border-top: 1px dashed #d3d8e0; padding-top: 8px; }
.row img.solution-img { border-top: 1px dashed #d3d8e0; padding-top: 8px; }
@media (max-width: 900px) { .row { grid-template-columns: minmax(0, 1fr); } }
.opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; }
.ans { margin-top: 10px; padding: 8px 12px; background: #eef1fe; border-radius: 8px; }
.note { color: #94570a; font-size: 13px; }
.math.block { overflow-x: auto; }
"""


def review_page(nums: list[int], entries: dict[int, dict], questions: dict[int, dict], prefix: str = "../../") -> str:
    """`prefix` leads from the page to the repository root, which the image paths are relative to."""
    from dgy.markdown import render_markdown

    md = lambda text: render_markdown(text or "")[0]  # noqa: E731
    rows = []
    for n in nums:
        e, q = entries[n], questions[n]
        imgs = "".join(f'<img src="{prefix}{html.escape(p)}" alt="题图">' for p in q["question_images"])
        imgs += "".join(f'<img class="answer-img" src="{prefix}{html.escape(p)}" alt="答案图">' for p in q.get("answer_images", []))
        imgs += "".join(f'<img class="solution-img" src="{prefix}{html.escape(p)}" alt="解析图">' for p in q.get("solution_images", []))
        opts = "".join(f"<div>{k}. {md(v)}</div>" for k, v in (e.get("options") or {}).items())
        rows.append(f"""<section class="row" id="q{n}">
  <h2>#{n:03d}<small>{html.escape(q['chapter_name'])} / {html.escape(' / '.join(q['path']))} · {e.get('type')} · {e.get('confidence')}{' · 带图' if e.get('figure') else ''}{BASIS_LABELS.get(e.get('answer_basis'), '')}</small></h2>
  <div>{imgs}</div>
  <div>{md(e.get('stem'))}{f'<div class="opts">{opts}</div>' if opts else ''}<div class="ans">答案：{md(e.get('answer'))}{f'<p class="note">勘误：{md(e["erratum"])}</p>' if e.get('erratum') else ''}</div>
  {f'<p class="note">题目本与原书不同：{html.escape(e["mismatch"])}</p>' if e.get('mismatch') else ''}
  {f'<p class="note">{html.escape(e["note"])}</p>' if e.get('note') else ''}</div>
</section>""")
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>转写对照</title>
<link rel="stylesheet" href="{prefix}dgy/static/vendor/katex/katex.min.css"><style>{REVIEW_STYLE}</style></head>
<body><h1>转写对照（{len(nums)} 题）</h1>
{''.join(rows)}
<script src="{prefix}dgy/static/vendor/katex/katex.min.js"></script>
<script>document.querySelectorAll(".math.inline, .math.block").forEach((el) => katex.render(el.textContent, el,
  {{ displayMode: el.classList.contains("block"), throwOnError: false, strict: "ignore" }}));</script>
</body></html>
"""


def review(work_dir: Path = WORK_DIR, nums: list[int] | None = None, check_fn=None, prefix: str = "../../",
           also=lambda entry: False) -> Path:
    """By default the flagged, low-confidence and sampled questions, and those `also(entry)` picks."""
    report, entries = (check_fn or check)(work_dir)
    questions = load_questions(work_dir)
    if nums is None:
        flagged = {int(m) for line in report.warnings + report.errors for m in re.findall(r"#(\d{3})", line)}
        flagged |= {n for n, e in entries.items() if e.get("confidence") == "low" or also(e)}
        sample = {int(m) for line in report.info if line.startswith("抽查") for m in re.findall(r"#(\d{3})", line)}
        nums = sorted((flagged | sample) & set(entries))
    path = work_dir / "review.html"
    path.write_text(review_page([n for n in nums if n in entries], entries, questions, prefix), encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.transcribe_questions")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare", help="生成转写用的图片和参考信息")
    check_cmd = sub.add_parser("check", help="校验转写结果")
    check_cmd.add_argument("--probe", action="store_true", help="只校验看图测验 out/probe.json")
    check_cmd.add_argument("--probe-file", default=PROBE_FILE, help="测验文件名，换模型接手时用另一个，例如 probe-harness.json")
    check_cmd.add_argument("--write", action="store_true", help="没有错误时写入 bank-md/questions.json")
    review_cmd = sub.add_parser("review", help="生成原图与转写的对照页")
    review_cmd.add_argument("--nums", help="只看这些题，逗号分隔，例如 1,12,300")
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
        print(f"已写入 {write_bank(entries)}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
