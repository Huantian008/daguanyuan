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
_QUOTE_MARKERS = re.compile(r"(?m)^[ \t]*(?:>[ \t]?)+")


def _strip_quote_markers_in_math(tokens) -> None:
    """dollarmath keeps the "> " prefixes of $$ blocks written inside a blockquote; drop them."""
    depth = 0
    for tok in tokens:
        if tok.type == "blockquote_open":
            depth += 1
        elif tok.type == "blockquote_close":
            depth -= 1
        elif depth and tok.type.startswith("math_block"):
            tok.content = _QUOTE_MARKERS.sub("", tok.content)


def _site_link(match: re.Match) -> str:
    target = _CHAPTER_LINK.match(unquote(match.group(1)))
    if not target:
        return match.group(0)
    slug, anchor = target.group(1), target.group(2) or ""
    if slug == "00":
        return 'href="/knowledge"'
    return f'href="/knowledge/{slug}?tab=text{anchor}"'


def heading_ids(source: str) -> dict[int, str]:
    """Anchor id of each h2/h3, keyed by its 0-based source line: the same ids render_markdown puts on the page."""
    return {
        tok.map[0]: tok.attrs["id"]
        for tok in _md.parse(source, {})
        if tok.type == "heading_open" and tok.tag in ("h2", "h3") and tok.map and "id" in tok.attrs
    }


def render_inline(source: str) -> str:
    """Inline Markdown only (no paragraphs or lists): for short pieces such as a choice option written "4."."""
    return _md.renderInline(source)


def render_markdown(source: str) -> tuple[str, list[tuple[str, str]]]:
    """HTML plus a table of contents of (anchor id, title) for the h2 headings."""
    env: dict = {}
    tokens = _md.parse(source, env)
    _strip_quote_markers_in_math(tokens)
    toc = [
        (tok.attrs.get("id", ""), tokens[i + 1].content)
        for i, tok in enumerate(tokens)
        if tok.type == "heading_open" and tok.tag == "h2"
    ]
    html = _md.renderer.render(tokens, _md.options, env)
    return _HREF.sub(_site_link, html), toc
