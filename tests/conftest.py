import pytest

from pipeline import sources


def _missing_pdfs():
    books = (sources.QUESTIONS_PDF, sources.ANSWERS_PDF, sources.SOLUTIONS_PDF,
             sources.XIANDAI_QUESTIONS_PDF, sources.XIANDAI_SOLUTIONS_PDF, sources.XIANDAI_PDF)
    return [p for p in books if not p.exists()]


def pytest_collection_modifyitems(config, items):
    missing = _missing_pdfs()
    if not missing:
        return
    skip = pytest.mark.skip(reason=f"source PDFs not found: {missing[0]}")
    for item in items:
        if "pdf" in item.keywords:
            item.add_marker(skip)
