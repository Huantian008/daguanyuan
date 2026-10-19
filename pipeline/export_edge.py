"""Prepare the Cloudflare Worker in edge/ from the local build.

    .venv\\Scripts\\python -m pipeline.export_edge

Copies the images, CSS/JS and knowledge diagrams into edge/public/ (served as Workers Static Assets) and writes
edge/src/generated/: the question manifest, the knowledge Markdown pre-rendered to HTML, the knowledge sections with
the questions tagged with them, and URL version stamps.
"""
import json
import shutil
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

from dgy.bank import load_bank
from dgy.markdown import render_markdown
from dgy.sections import load_links, load_sections

from . import sources

ASSET_LIMIT = 25 * 1024 * 1024  # Workers Static Assets: 25 MiB per file
FILE_LIMIT = 20_000  # ... and 20,000 files per version on the Free plan
CONTENT_SUBDIRS = ("q", "a", "s", "k", "xiandai/q", "xiandai/s")  # not xiandai/transcribe or knowledge: work files
EDGE_DIR = sources.PROJECT_ROOT / "edge"
STATIC_DIR = sources.PROJECT_ROOT / "dgy" / "static"
MARKDOWN_DIR = sources.PROJECT_ROOT / "knowledge-md"
BANK_DIR = sources.PROJECT_ROOT / "bank-md"


@dataclass
class ExportReport:
    files: int = 0
    total_bytes: int = 0
    largest: tuple[str, int] = ("", 0)
    too_large: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.too_large and self.files <= FILE_LIMIT

    def render(self) -> str:
        lines = [
            f"静态资源 {self.files} 个文件，共 {self.total_bytes / 1024 / 1024:.1f} MB（上限 {FILE_LIMIT} 个）",
            f"最大的文件：{self.largest[0]}（{self.largest[1] / 1024:.0f} KB，上限 25 MiB）",
        ]
        lines += [f"  错误：超过 25 MiB：{name}" for name in self.too_large]
        lines.append("导出完成" if self.ok else "导出有问题，见上面的错误")
        return "\n".join(lines)


def _copy_tree(src: Path, dst: Path, public: Path, report: ExportReport, max_bytes: int) -> None:
    for path in sorted(src.rglob("*")):
        if not path.is_file():
            continue
        target = dst / path.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        size = path.stat().st_size
        rel = target.relative_to(public).as_posix()
        report.files += 1
        report.total_bytes += size
        if size > report.largest[1]:
            report.largest = (rel, size)
        if size > max_bytes:
            report.too_large.append(rel)


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def export_edge(content_dir: Path = sources.CONTENT_DIR, static_dir: Path = STATIC_DIR,
                markdown_dir: Path = MARKDOWN_DIR, edge_dir: Path = EDGE_DIR,
                max_bytes: int = ASSET_LIMIT, bank_dir: Path = BANK_DIR) -> ExportReport:
    public = edge_dir / "public"
    generated = edge_dir / "src" / "generated"
    shutil.rmtree(public, ignore_errors=True)
    generated.mkdir(parents=True, exist_ok=True)

    report = ExportReport()
    for sub in CONTENT_SUBDIRS:
        if (content_dir / sub).exists():
            _copy_tree(content_dir / sub, public / "content" / sub, public, report, max_bytes)
    _copy_tree(static_dir, public / "static", public, report, max_bytes)
    if (markdown_dir / "assets").exists():
        _copy_tree(markdown_dir / "assets", public / "knowledge" / "assets", public, report, max_bytes)

    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    _write_json(generated / "manifest.json", manifest)

    chapters = {}
    for entry in manifest["knowledge"]:
        md_name = entry.get("md")
        if md_name and (markdown_dir / md_name).exists():
            html, toc = render_markdown((markdown_dir / md_name).read_text(encoding="utf-8"))
            chapters[entry["slug"]] = {"html": html, "toc": [list(item) for item in toc]}
    overview_md = markdown_dir / "00_总目录.md"
    overview = render_markdown(overview_md.read_text(encoding="utf-8"))[0] if overview_md.exists() else ""
    _write_json(generated / "knowledge.json", {"chapters": chapters, "overview": overview})

    sections = load_sections(markdown_dir) if markdown_dir.exists() else {}
    links = load_links(markdown_dir, sections) if sections else {}
    _write_json(generated / "sections.json", {
        "sections": [asdict(s) for s in sections.values()],
        "links": {str(num): list(keys) for num, keys in sorted(links.items())},
    })

    # The question text, rendered here once so the Worker serves the same HTML as the Python site.
    _write_json(generated / "bank.json", {str(num): t.to_json() for num, t in sorted(load_bank(bank_dir).items())})

    _write_json(generated / "meta.json", {
        "content_v": "".join(ch for ch in manifest.get("built_at", "") if ch.isdigit()),
        "asset_v": str(max(int(p.stat().st_mtime) for p in static_dir.rglob("*") if p.is_file())),
    })
    return report


def main() -> int:
    report = export_edge()
    print(report.render())
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
