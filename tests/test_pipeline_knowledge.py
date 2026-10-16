from pipeline.knowledge import parse_markdown_index, title_of

INDEX = """
| 原 PDF 页码 | 内容归宿 | 处理结果 |
|---|---|---|
| 1–9 | — | 封面、序言、目录及宣传信息，不进入复习正文 |
| 10–22 | [01 函数、极限与连续](./01_函数极限连续.md) | 正文与手写公式转写 |
| 58–59 | [07 多元函数微分学](./07_多元函数微分.md) | 按数学二范围筛选 |
"""


def test_parse_markdown_index_maps_files_to_page_ranges():
    assert parse_markdown_index(INDEX) == [
        ("01_函数极限连续.md", 10, 22),
        ("07_多元函数微分.md", 58, 59),
    ]


def test_title_of_reads_first_heading():
    assert title_of("> note\n\n# 函数、极限与连续\n\n## 1. 函数基础") == "函数、极限与连续"
