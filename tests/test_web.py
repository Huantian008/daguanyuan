from datetime import date

from dgy.web import cn_date, duration, safe_back


def test_duration_uses_seconds_under_a_minute():
    assert duration(5) == "5 秒"
    assert duration(59) == "59 秒"


def test_duration_uses_rounded_minutes_from_a_minute():
    assert duration(60) == "1 分钟"
    assert duration(150) == "3 分钟"


def test_duration_of_unknown_time_is_empty():
    assert duration(None) == ""
    assert duration(0) == ""


def test_cn_date():
    assert cn_date(date(2026, 10, 16)) == "10月16日周五"


def test_safe_back_only_allows_site_paths():
    assert safe_back("/bank/A#sec-2") == "/bank/A#sec-2"
    assert safe_back("https://evil.example") == "/"
    assert safe_back("//evil.example") == "/"
