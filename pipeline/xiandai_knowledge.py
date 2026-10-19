"""Inputs and checks for turning the 31-page 线代 mind map (线代大观知识点.pdf) into Markdown + LaTeX, one file per
chapter, like the 高数 notes in knowledge-md/. The transcription is done by a vision model; the task description is
docs/deepseek/线代知识点转写.md. The six files and their page ranges are listed in knowledge-md/线代总目录.md.

    .venv/bin/python -m pipeline.xiandai_knowledge prepare        # page images and text hints in content/xiandai/knowledge/
    .venv/bin/python -m pipeline.xiandai_knowledge check --probe  # the test page (p.2) in out/probe.md
    .venv/bin/python -m pipeline.xiandai_knowledge check          # the six files in out/
    .venv/bin/python -m pipeline.xiandai_knowledge check --write  # ... and, with no errors, copy them into knowledge-md/
    .venv/bin/python -m pipeline.xiandai_knowledge review         # side-by-side page: PDF page | rendered Markdown

The mind map's formulas are mostly embedded pictures, so the text layer only gives node names. Pages 3–31 are wide;
at a readable zoom they are cut into a left and a right column, each in bands of at most MAX_PIXELS, like the questions.
"""
import argparse
import html
import json
import re
import shutil
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from dgy.sections import XIANDAI_INDEX_FILE, parse_markdown_index

from . import sources
from . import transcribe_questions as tq
from .imaging import render_clip
from .link_questions import Report
from .xiandai import OUT_DIR

WORK_DIR = OUT_DIR / "knowledge"
MARKDOWN_DIR = sources.PROJECT_ROOT / "knowledge-md"
REL_IMG_DIR = "content/xiandai/knowledge/img"
REVIEW_PREFIX = "../../../"  # content/xiandai/knowledge/ -> repository root
PROBE_FILE = "probe.md"
# Page 2: its formulas are pictures, so only reading the image gets them (page 4 is the worked example in the task).
PROBE_PAGE = 2
PROBE_PIECES = ["范德蒙", "拉普拉斯", "三对角行列式", r"(a-b)^{n-1}", r"(x_j-x_i)", r"(-1)^{mn}"]

TILE_ZOOM = 2.0
TWO_COLUMNS = 1300  # px: a page wider than this at TILE_ZOOM is cut into a left and a right column
COLUMN_OVERLAP = 40  # px each column reaches past the cut when there is no blank gap to cut in
COVERAGE_MIN = 0.8
TINY_TEXT = 2  # pt: the PDF hides stray digits at 0.8 pt; nobody can see them

_PAGE_MARK = re.compile(r"<!--\s*p\.(\d+)\s*-->")
_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
_NUMBERED = re.compile(r"^(\d+)(?:\.(\d+))?\.?\s+\S")
_CJK = re.compile(r"[一-鿿]")
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_PAGE_NUMBER = re.compile(r"^\d+/31$")
# CJK radicals the PDF uses for whole characters; NFKC leaves these alone.
_RADICALS = str.maketrans({"\u2ec6": "角", "\u2eec": "齐", "\u2ec5": "见", "\u2ec9": "贝"})


def normalize(text: str) -> str:
    """NFKC (the PDF writes 行 as the Kangxi radical ⾏) plus the few simplified radicals it also uses."""
    return unicodedata.normalize("NFKC", text).translate(_RADICALS)


@dataclass(frozen=True)
class KnowledgeFile:
    name: str  # "10_行列式.md"
    first: int
    last: int

    @property
    def title(self) -> str:
        return self.name[3:-3]

    def pages(self) -> range:
        return range(self.first, self.last + 1)


def knowledge_files(markdown_dir: Path = MARKDOWN_DIR) -> list[KnowledgeFile]:
    index = parse_markdown_index((markdown_dir / XIANDAI_INDEX_FILE).read_text(encoding="utf-8"))
    return [KnowledgeFile(name, first, last) for name, first, last in index]


# ---------- prepare ----------

def page_hints(page) -> list[str]:
    """The visible lines of text on a page, normalised to ordinary characters."""
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(s["text"] for s in line["spans"] if s["size"] >= TINY_TEXT)
            text = re.sub(r"\s+", " ", normalize(text)).strip()
            if text and not _PAGE_NUMBER.match(text):
                lines.append(text)
    return lines


def _blank_columns(img: Image.Image, threshold: int = 250) -> list[bool]:
    gray = img.convert("L")
    columns = gray.transpose(Image.Transpose.TRANSPOSE).tobytes()
    h = gray.height
    return [min(columns[x * h:(x + 1) * h]) >= threshold for x in range(gray.width)]


def column_cut(img: Image.Image) -> tuple[int, int]:
    """Where to split a wide page in two: the right and left edges of the two columns. In the middle of the blank run
    of columns nearest the centre (within the middle 30%) when there is one, else at the centre with some overlap."""
    blank = _blank_columns(img)
    w = img.width
    lo, hi = int(w * 0.35), int(w * 0.65)
    runs, start = [], None
    for x in range(lo, hi + 1):
        if blank[x] and start is None:
            start = x
        elif not blank[x] and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, hi))
    if runs:
        a, b = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - w / 2))
        cut = (a + b) // 2
        return cut, cut
    return w // 2 + COLUMN_OVERLAP, w // 2 - COLUMN_OVERLAP


def tiles(img: Image.Image, max_pixels: int = tq.MAX_PIXELS) -> list[tuple[str, Image.Image]]:
    """(where, tile) in reading order: the whole width in bands, or the left column's bands then the right column's."""
    if img.width <= TWO_COLUMNS:
        bands = tq.split_bands(img, max_pixels)
        return [(f"第 {i} 段", b) for i, b in enumerate(bands, start=1)]
    left_end, right_start = column_cut(img)
    out = []
    for side, column in (("左栏", img.crop((0, 0, left_end, img.height))), ("右栏", img.crop((right_start, 0, img.width, img.height)))):
        bands = [b for b in tq.split_bands(column, max_pixels) if b.convert("L").point(lambda v: 255 if v < 245 else 0).getbbox()]
        out += [(f"{side}第 {i} 段", b) for i, b in enumerate(bands, start=1)]
    return out


def _overview(page) -> Image.Image:
    zoom = (tq.MAX_PIXELS / (page.rect.width * page.rect.height)) ** 0.5
    return render_clip(page, page.rect, zoom)


def prepare(work_dir: Path = WORK_DIR, markdown_dir: Path = MARKDOWN_DIR) -> None:
    import fitz

    files = knowledge_files(markdown_dir)
    file_of = {p: f for f in files for p in f.pages()}
    img_dir = work_dir / "img"
    shutil.rmtree(img_dir, ignore_errors=True)
    img_dir.mkdir(parents=True)
    (work_dir / "out").mkdir(exist_ok=True)
    count = page_count = 0
    with fitz.open(sources.XIANDAI_PDF) as doc, (work_dir / "pages.jsonl").open("w", encoding="utf-8") as out:
        page_count = doc.page_count
        for page in doc:
            p = page.number + 1
            n = f"p{p:02d}"
            _overview(page).save(img_dir / f"{n}.png")
            parts = []
            for i, (where, tile) in enumerate(tiles(render_clip(page, page.rect, TILE_ZOOM)), start=1):
                tile.save(img_dir / f"{n}-{i}.png")
                parts.append({"path": f"{REL_IMG_DIR}/{n}-{i}.png", "where": where})
            count += len(parts)
            out.write(json.dumps({
                "page": p,
                "file": file_of[p].name,
                "overview": f"{REL_IMG_DIR}/{n}.png",
                "tiles": parts,
                "text": page_hints(page),
            }, ensure_ascii=False) + "\n")
    print(f"导图 {page_count} 页，放大切块 {count} 张，已写入 {work_dir}")


# ---------- check ----------

@dataclass
class Parsed:
    title: str | None = None
    pages: list[tuple[int, int]] = field(default_factory=list)  # (line index, page)
    headings: list[tuple[int, int, str]] = field(default_factory=list)  # (line index, level, text)


def parse(text: str) -> Parsed:
    parsed = Parsed()
    in_math = False
    for i, line in enumerate(text.splitlines()):
        if line.strip().startswith("$$") and line.strip().count("$$") == 1:
            in_math = not in_math
        if in_math:
            continue
        for m in _PAGE_MARK.finditer(line):
            parsed.pages.append((i, int(m.group(1))))
        if m := _HEADING.match(line):
            level, title = len(m.group(1)), m.group(2)
            if level == 1 and parsed.title is None and not parsed.headings:
                parsed.title = title
            else:
                parsed.headings.append((i, level, title))
    return parsed


def check_headings(where: str, parsed: Parsed, report: Report, from_one: bool = True) -> int:
    """## N. and ### N.M only, numbered in order under their ##; returns the number of sections."""
    h2 = None
    expected_h2 = 1 if from_one else None
    expected_h3 = 1
    count = 0
    for _i, level, title in parsed.headings:
        m = _NUMBERED.match(title)
        if level == 1:
            report.errors.append(f"{where}：只能有一个 # 标题（「{title}」）")
        elif level >= 4:
            report.warnings.append(f"{where}：「{'#' * level} {title}」——更深的节点用 **粗体** 和列表，不用 {level} 级标题")
        elif not m:
            report.errors.append(f"{where}：「{'#' * level} {title}」没有编号，## 写成「## 1. 标题」，### 写成「### 1.1 标题」")
        elif level == 2:
            if m.group(2) is not None:
                report.errors.append(f"{where}：「## {title}」是二级标题，编号只能是一个数，例如「## 2. …」")
                continue
            n = int(m.group(1))
            if expected_h2 is not None and n != expected_h2:
                report.errors.append(f"{where}：「## {title}」编号应为 {expected_h2}.")
            h2, expected_h2, expected_h3 = n, n + 1, 1
            count += 1
        else:
            if m.group(2) is None:
                report.errors.append(f"{where}：「### {title}」编号应为两段，例如「### 2.1 …」")
                continue
            if h2 is None and not from_one:  # a lone test page may go on under the previous page's ##
                h2, expected_h3 = int(m.group(1)), int(m.group(2))
            if h2 is None:
                report.errors.append(f"{where}：「### {title}」前面没有 ## 标题")
                continue
            want = f"{h2}.{expected_h3}"
            got = f"{m.group(1)}.{m.group(2)}"
            if got != want:
                report.errors.append(f"{where}：「### {title}」编号应为 {want}")
            expected_h3 = int(m.group(2)) + 1 if m.group(1) == str(h2) else expected_h3 + 1
            count += 1
    return count


def check_math(where: str, text: str, report: Report) -> list[dict]:
    formulas = []
    for k, paragraph in enumerate(re.split(r"\n\s*\n", text), start=1):
        if tq.unbalanced_dollars(paragraph):
            report.errors.append(f"{where} 第 {k} 段（「{paragraph.strip()[:20]}…」）：$ 没有成对")
        for i, (display, tex) in enumerate(tq.math_segments(paragraph)):
            formulas.append({"id": f"{where} 第 {k} 段第 {i + 1} 个公式", "tex": tex, "display": display})
            if found := tq.FULL_WIDTH_IN_MATH.search(tex):
                report.errors.append(f"{where} 第 {k} 段：公式里有全角标点「{found.group(0)}」，公式内一律用半角")
    if _IMAGE.search(text):
        report.errors.append(f"{where}：不要插图片，导图里的公式和图都转成文字")
    return formulas


def page_segments(text: str) -> dict[int, str]:
    """Each page's text: from its <!-- p.N --> mark to the next one."""
    marks = list(_PAGE_MARK.finditer(text))
    return {int(m.group(1)): text[m.end(): marks[i + 1].start() if i + 1 < len(marks) else len(text)]
            for i, m in enumerate(marks)}


def missing_hints(hints: list[str], segment: str) -> list[str]:
    """Hint lines (with two or more Chinese characters) whose Chinese characters are not found in the segment."""
    written = "".join(_CJK.findall(normalize(segment)))
    return [h for h in hints if len(cjk := "".join(_CJK.findall(h))) >= 2 and cjk not in written]


def check_coverage(where: str, page: int, hints: list[str], segment: str, report: Report) -> None:
    wanted = [h for h in hints if len(_CJK.findall(h)) >= 2]
    if not wanted:
        return
    missing = missing_hints(wanted, segment)
    if 1 - len(missing) / len(wanted) < COVERAGE_MIN:
        report.warnings.append(f"{where} 第 {page} 页：导图上这些文字没找到，可能漏了内容 {missing[:12]}"
                               + (" …" if len(missing) > 12 else ""))


def load_pages(work_dir: Path) -> dict[int, dict]:
    lines = (work_dir / "pages.jsonl").read_text(encoding="utf-8").splitlines()
    return {p["page"]: p for p in (json.loads(line) for line in lines if line)}


def check(work_dir: Path = WORK_DIR, probe: bool = False, markdown_dir: Path = MARKDOWN_DIR) -> tuple[Report, dict[str, str]]:
    report = Report()
    pages = load_pages(work_dir)
    files = knowledge_files(markdown_dir)
    out = work_dir / "out"
    texts: dict[str, str] = {}
    wanted = [PROBE_FILE] if probe else [f.name for f in files]
    for name in wanted:
        path = out / name
        if path.exists():
            texts[name] = path.read_text(encoding="utf-8")
        else:
            report.errors.append(f"还没有 out/{name}")
    if not probe:
        extra = sorted(p.name for p in out.glob("*.md") if p.name not in texts and p.name != PROBE_FILE)
        report.warnings += [f"out/{name} 不是六个文件之一，不会被采用" for name in extra]

    formulas, sections, pending = [], {}, 0
    for name, text in texts.items():
        parsed = parse(text)
        kf = next((f for f in files if f.name == name), None)
        if kf and parsed.title != kf.title:
            report.errors.append(f"{name}：第一行应为「# {kf.title}」")
        allowed = [PROBE_PAGE] if probe else list(kf.pages())
        seen = [p for _i, p in parsed.pages]
        for p in allowed:
            if seen.count(p) != 1:
                report.errors.append(f"{name}：<!-- p.{p} --> 应该正好出现一次，现在 {seen.count(p)} 次")
        report.errors += [f"{name}：第 {p} 页不属于这个文件（本文件是第 {allowed[0]}–{allowed[-1]} 页）" for p in sorted(set(seen) - set(allowed))]
        if seen != sorted(seen):
            report.errors.append(f"{name}：页码标记要按页序排列，现在是 {seen}")
        if parsed.pages and any(i < parsed.pages[0][0] for i, _level, _t in parsed.headings):
            report.errors.append(f"{name}：第一个 ## 之前要先有 <!-- p.{allowed[0]} -->")
        sections[name] = check_headings(name, parsed, report, from_one=not probe)
        if not sections[name]:
            report.errors.append(f"{name}：没有任何 ## 或 ### 小节")
        formulas += check_math(name, text, report)
        for p, segment in page_segments(text).items():
            if p in pages:
                check_coverage(name, p, pages[p]["text"], segment, report)
        pending += text.count("<!-- 待核")

    errors = tq.katex_errors(formulas)
    if errors is None:
        report.warnings.append("没有找到 node，跳过公式编译检查")
    else:
        report.errors += [f"{e['id']}：KaTeX 渲染不了（{e['error']}）" for e in errors]
        report.info.append(f"公式 {len(formulas)} 段，KaTeX 编译失败 {len(errors)} 段")
    if probe and PROBE_FILE in texts:
        written = tq.normalize_tex(texts[PROBE_FILE])
        missing = [p for p in PROBE_PIECES if tq.normalize_tex(p) not in written]
        if missing:
            report.errors.append(f"测验第 {PROBE_PAGE} 页：没转出这些内容 {missing}，模型可能没看到或没看清图片")
        else:
            report.info.append(f"测验第 {PROBE_PAGE} 页：关键内容都对上了")
    report.info += [f"{name}：小节 {n} 个" for name, n in sections.items()]
    if pending:
        report.info.append(f"待核标记 {pending} 处")
    return report, texts


def write(texts: dict[str, str], markdown_dir: Path = MARKDOWN_DIR) -> list[Path]:
    paths = []
    for name, text in texts.items():
        path = markdown_dir / name
        path.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
        paths.append(path)
    return paths


# ---------- review ----------

REVIEW_STYLE = tq.REVIEW_STYLE + """
.row > div:first-of-type { position: sticky; top: 12px; align-self: start; }
.row blockquote { margin: 8px 0; padding: 4px 12px; border-left: 3px solid #c9d3ff; background: #f6f8ff; }
"""


def review_page(texts: dict[str, str], pages: dict[int, dict], prefix: str = REVIEW_PREFIX) -> str:
    from dgy.markdown import render_markdown

    rows = []
    for name, text in texts.items():
        for p, segment in page_segments(text).items():
            info = pages.get(p, {})
            img = f'<img src="{prefix}{html.escape(info["overview"])}" alt="第 {p} 页">' if info else ""
            rows.append(f"""<section class="row" id="p{p}">
  <h2>第 {p} 页<small>{html.escape(name)}</small></h2>
  <div>{img}</div>
  <div>{render_markdown(segment)[0]}</div>
</section>""")
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>导图转写对照</title>
<link rel="stylesheet" href="{prefix}dgy/static/vendor/katex/katex.min.css"><style>{REVIEW_STYLE}</style></head>
<body><h1>导图转写对照（{len(rows)} 页）</h1>
{''.join(rows)}
<script src="{prefix}dgy/static/vendor/katex/katex.min.js"></script>
<script>document.querySelectorAll(".math.inline, .math.block").forEach((el) => katex.render(el.textContent, el,
  {{ displayMode: el.classList.contains("block"), throwOnError: false, strict: "ignore" }}));</script>
</body></html>
"""


def review(work_dir: Path = WORK_DIR, probe: bool = False) -> Path:
    _report, texts = check(work_dir, probe)
    path = work_dir / "review.html"
    path.write_text(review_page(texts, load_pages(work_dir)), encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.xiandai_knowledge")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare", help="生成导图页面图片和文字提示")
    check_cmd = sub.add_parser("check", help="校验转写结果")
    check_cmd.add_argument("--probe", action="store_true", help=f"只校验看图测验 out/{PROBE_FILE}（第 {PROBE_PAGE} 页）")
    check_cmd.add_argument("--write", action="store_true", help="没有错误时把六个文件拷进 knowledge-md/")
    review_cmd = sub.add_parser("review", help="生成原页与转写的对照页")
    review_cmd.add_argument("--probe", action="store_true", help=f"只看测验 out/{PROBE_FILE}")
    args = parser.parse_args(argv)
    if args.command == "prepare":
        prepare()
        return 0
    if args.command == "review":
        print(f"已写入 {review(probe=args.probe)}")
        return 0
    report, texts = check(probe=args.probe)
    print(report.render())
    if args.write and not args.probe and report.ok:
        for path in write(texts):
            print(f"已写入 {path}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
