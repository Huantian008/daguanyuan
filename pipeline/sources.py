"""Where the source PDFs live. Defaults to the folder that contains the project (E:\\大观园)."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path(os.environ.get("DGY_SOURCE_DIR", PROJECT_ROOT.parent))
CONTENT_DIR = Path(os.environ.get("DGY_CONTENT_DIR", PROJECT_ROOT / "content"))

QUESTIONS_PDF = SOURCE_DIR / "【章节版】数二高数严选大观.pdf"
ANSWERS_PDF = SOURCE_DIR / "大观严选数二答案速查.pdf"
SOLUTIONS_PDF = SOURCE_DIR / "大观严选题答案.pdf"

KNOWLEDGE_DIR = SOURCE_DIR / "【合集】A4版知识点"
GAOSHU_PDF = KNOWLEDGE_DIR / "【高数合集】大观知识点.pdf"
XIANDAI_PDF = KNOWLEDGE_DIR / "框图版（@南门朔制作）" / "线代大观知识点.pdf"
# 线代臻选题: the 数二 question book (its file name really ends in a space) and the answer book with the solutions.
XIANDAI_QUESTIONS_PDF = KNOWLEDGE_DIR / "【A4紧凑】数二线代臻选题 .pdf"
XIANDAI_SOLUTIONS_PDF = KNOWLEDGE_DIR / "【通用答案】线代臻选题.pdf"
XIANDAI_CONTENT_DIR = CONTENT_DIR / "xiandai"

MARKDOWN_DIR = KNOWLEDGE_DIR / "数学二Markdown复习资料"
