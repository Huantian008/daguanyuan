import json

from PIL import Image, ImageDraw

from pipeline import xiandai_knowledge as xk
from pipeline.link_questions import Report

PAGE_4 = """<!-- p.4 -->

## 3. 矩阵逆

### 3.1 逆定义

**逆的定义**　设 $A$ 为 $n$ 阶矩阵，若存在 $n$ 阶矩阵 $B$，使得 $AB=E$，则称 $A$ 可逆，记作 $B=A^{-1}$.

### 3.2 可逆六充要

$\\iff|A|\\neq0$，$(kA)^{-1}=\\dfrac{1}{k}A^{-1}$

### 3.3 伴随矩阵

**伴随矩阵性质**　$A^*$，$|A^*|=|A|^{n-1}$
"""


def _work_dir(tmp_path, files: dict[str, str], hints: dict[int, list[str]] | None = None):
    (tmp_path / "out").mkdir(exist_ok=True)
    rows = [{"page": p, "file": "", "overview": f"img/p{p:02d}.png", "tiles": [], "text": (hints or {}).get(p, [])}
            for p in range(1, 32)]
    (tmp_path / "pages.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    for name, text in files.items():
        (tmp_path / "out" / name).write_text(text, encoding="utf-8")
    return tmp_path


def test_the_index_splits_the_31_pages_into_six_files():
    files = xk.knowledge_files()
    assert [f.name for f in files] == ["10_行列式.md", "11_矩阵.md", "12_向量.md", "13_线性方程组.md",
                                       "14_特征值与特征向量.md", "15_二次型.md"]
    assert [p for f in files for p in f.pages()] == list(range(1, 32))
    assert files[1].title == "矩阵" and (files[1].first, files[1].last) == (3, 12)


def test_normalize_turns_radicals_into_ordinary_characters():
    assert xk.normalize("⾏列式 上下三⻆ ⾮⻬次 详⻅") == "行列式 上下三角 非齐次 详见"


def test_headings_must_be_numbered_in_order():
    report = Report()
    text = "# 矩阵\n\n## 1. 乘法\n\n### 1.1 结合律\n\n### 1.3 交换律\n\n## 3. 转置\n\n### 转置定义\n\n#### 更深\n"
    assert xk.check_headings("f", xk.parse(text), report) == 4
    assert "### 1.3 交换律」编号应为 1.2" in "\n".join(report.errors)
    assert "## 3. 转置」编号应为 2." in "\n".join(report.errors)
    assert any("没有编号" in e for e in report.errors)
    assert any("粗体" in w for w in report.warnings)
    assert xk.parse(text).title == "矩阵"


def test_a_heading_inside_display_math_is_not_a_heading():
    parsed = xk.parse("# 矩阵\n\n$$\n# 1. x\n$$\n\n## 1. 乘法\n")
    assert [t for _i, _l, t in parsed.headings] == ["1. 乘法"]


def test_page_segments_and_missing_hints():
    segments = xk.page_segments("<!-- p.3 -->\n矩阵乘法\n<!-- p.4 -->\n矩阵逆 伴随矩阵")
    assert segments[3].strip() == "矩阵乘法" and segments[4].strip() == "矩阵逆 伴随矩阵"
    # only Chinese characters are compared, so math and punctuation written differently still count
    assert xk.missing_hints(["✅秩满可逆不为0 无关唯一只零解", "伴随矩阵", "逆求法", "3"], "> ✅ 秩满可逆不为 $0$　无关唯一只零解\n伴随矩阵") == ["逆求法"]


def test_column_cut_goes_through_the_blank_gap_nearest_the_middle():
    img = Image.new("RGB", (2000, 400), "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 899, 399), fill="black")
    draw.rectangle((1101, 0, 1999, 399), fill="black")
    assert xk.column_cut(img) == (1000, 1000)
    solid = Image.new("RGB", (2000, 400), "black")
    assert xk.column_cut(solid) == (1000 + xk.COLUMN_OVERLAP, 1000 - xk.COLUMN_OVERLAP)


PAGE_2 = """<!-- p.2 -->

### 2.3 ab型（特殊化）

$\\begin{vmatrix}a&b&\\cdots&b\\\\b&a&\\cdots&b\\end{vmatrix}=[a+(n-1)b](a-b)^{n-1}$

### 2.4 范德蒙

$D_n=\\prod\\limits_{1\\leqslant i<j\\leqslant n}(x_j-x_i)$

### 2.5 拉普拉斯

$\\begin{vmatrix}A&C\\\\O&B\\end{vmatrix}=|A||B|$，$\\begin{vmatrix}C&A\\\\B&O\\end{vmatrix}=(-1)^{mn}|A||B|$

### 2.6 三对角行列式（难）
"""


def test_probe_checks_page_2_and_its_numbering_need_not_start_at_1(tmp_path):
    report, _ = xk.check(_work_dir(tmp_path, {"probe.md": PAGE_2}), probe=True)
    assert report.ok, report.errors
    assert "测验第 2 页：关键内容都对上了" in report.info
    broken = PAGE_2.replace("(-1)^{mn}", "|A||B|").replace("p.2", "p.3")
    report, _ = xk.check(_work_dir(tmp_path, {"probe.md": broken}), probe=True)
    errors = "\n".join(report.errors)
    assert "(-1)^{mn}" in errors and "<!-- p.2 --> 应该正好出现一次" in errors and "第 3 页不属于这个文件" in errors


def test_full_check_needs_all_six_files_with_their_pages(tmp_path):
    good = "# 行列式\n\n<!-- p.1 -->\n\n## 1. 相关定义\n\n### 1.1 逆序数定义\n\n<!-- p.2 -->\n\n### 1.2 余子式求和\n"
    work = _work_dir(tmp_path, {"10_行列式.md": good, "11_矩阵.md": "# 矩阵\n\n<!-- p.3 -->\n\n## 1. 乘法\n",
                                "x.md": "# 多余\n"}, hints={1: ["相关定义", "逆序数定义", "行列式性质", "按行(列)展开定理"]})
    report, texts = xk.check(work)
    errors = "\n".join(report.errors)
    assert "还没有 out/12_向量.md" in errors and "11_矩阵.md：<!-- p.4 --> 应该正好出现一次" in errors
    assert "10_行列式.md" not in errors
    assert any("x.md" in w for w in report.warnings)
    assert any("第 1 页" in w and "行列式性质" in w for w in report.warnings)
    assert sorted(texts) == ["10_行列式.md", "11_矩阵.md"]


def test_write_copies_into_knowledge_md(tmp_path):
    paths = xk.write({"10_行列式.md": "# 行列式"}, tmp_path)
    assert paths[0].read_text(encoding="utf-8") == "# 行列式\n"
