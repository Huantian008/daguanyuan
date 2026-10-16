"""Render the knowledge Markdown. Math is left as `.math.inline` / `.math.block` elements for KaTeX in the browser."""
import re
from urllib.parse import unquote

from markdown_it import MarkdownIt
from mdit_py_plugins.anchors import anchors_plugin
from mdit_py_plugins.dollarmath import dollarmath_plugin

_md = (
    MarkdownIt("commonmark", {"html": True})
    .enable("table")
    .use(dollarmath_plugin, allow_space=True, double_inline=True)
    .use(anchors_plugin, min_level=2, max_level=3)
)

_HREF = re.compile(r'href="([^"]+)"')
_CHAPTER_LINK = re.compile(r"^\./(\d\d)_[^/#]+\.md(#.*)?$")


def _site_link(match: re.Match) -> str:
    target = _CHAPTER_LINK.match(unquote(match.group(1)))
    if not target:
        return match.group(0)
    slug, anchor = target.group(1), target.group(2) or ""
    if slug == "00":
        return 'href="/knowledge"'
    return f'href="/knowledge/{slug}?tab=text{anchor}"'


def render_markdown(source: str) -> tuple[str, list[tuple[str, str]]]:
    """HTML plus a table of contents of (anchor id, title) for the h2 headings."""
    env: dict = {}
    tokens = _md.parse(source, env)
    toc = [
        (tok.attrs.get("id", ""), tokens[i + 1].content)
        for i, tok in enumerate(tokens)
        if tok.type == "heading_open" and tok.tag == "h2"
    ]
    html = _md.renderer.render(tokens, _md.options, env)
    return _HREF.sub(_site_link, html), toc
