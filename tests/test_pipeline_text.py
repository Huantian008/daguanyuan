from pipeline.text import clean_outline_title, years


def test_years_finds_exam_years():
    assert years("2002数二; 🖐️基础严选第五章选择9; 660数二325") == {"2002"}


def test_years_ignores_book_numbers_like_1000_and_880():
    assert years("🐙早年1000; 880第三章基础解答22") == set()


def test_years_survives_leading_garbage_digits():
    assert years("11996数二；武基础严选第") == {"1996"}
    assert years("11)2025数一") == {"2025"}


def test_clean_outline_title_strips_enumeration_and_arrows():
    assert clean_outline_title("(1) 2004数三 >>") == "2004数三"
    assert clean_outline_title("xi) 2025数一 >>") == "2025数一"
    assert clean_outline_title("(a) 2021数一（仅数学一） >>") == "2021数一（仅数学一）"
    assert clean_outline_title("1. 积分计算 >>") == "积分计算"
    assert clean_outline_title("A. 函数极限连续 >>") == "函数极限连续"
