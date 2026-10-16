from dgy.markdown import render_markdown


def test_math_is_left_in_place_for_katex():
    html, _toc = render_markdown("若 $a_1<b$ 则\n\n$$\n\\frac12\n$$\n")
    assert '<span class="math inline">a_1&lt;b</span>' in html
    assert '<div class="math block">' in html
    assert "\\frac12" in html


def test_headings_get_github_style_ids_and_h2_toc():
    html, toc = render_markdown("# 标题\n\n## 1. 函数基础\n\n### 1.1 有界\n\n## 2. 数列极限\n")
    assert '<h2 id="1-函数基础">' in html
    assert '<h3 id="11-有界">' in html
    assert toc == [("1-函数基础", "1. 函数基础"), ("2-数列极限", "2. 数列极限")]


def test_links_to_other_chapters_point_to_site_pages():
    html, _toc = render_markdown("见[泰勒](./01_函数极限连续.md#73-泰勒公式)和[总目录](./00_总目录.md)")
    assert 'href="/knowledge/01?tab=text#73-泰勒公式"' in html
    assert 'href="/knowledge"' in html


def test_tables_are_rendered():
    html, _toc = render_markdown("| a | b |\n|---|---|\n| $x$ | 2 |\n")
    assert "<table>" in html and '<span class="math inline">x</span>' in html
