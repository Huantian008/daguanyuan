from datetime import date

from dgy.web import cn_date, safe_back


def test_cn_date():
    assert cn_date(date(2026, 10, 16)) == "10月16日周五"


def test_safe_back_only_allows_site_paths():
    assert safe_back("/bank/A#sec-2") == "/bank/A#sec-2"
    assert safe_back("https://evil.example") == "/"
    assert safe_back("//evil.example") == "/"
