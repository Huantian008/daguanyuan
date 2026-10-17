from dgy.content import Content
from dgy.drill import kp_index_of, onward_kp

from .factories import small_bank

# small_bank: chapter A has 考点 1 有界 (#1), 2 奇偶 (#2), 3 0/0 (#3); B has 1 基本概念题 (#4, #5), 2 隐函数求导 (#6, 仅数一).
CONTENT = Content(small_bank())


def status_of(done, excluded=(6,)):
    return lambda num: "excluded" if num in excluded else "mastered" if num in done else "new"


def where(found):
    return found and (found[0], found[1].index, found[1].total - found[1].done)


def q(num):
    return CONTENT.questions[num]


def test_onward_starts_at_the_very_first_kp_when_nothing_has_been_graded():
    assert where(onward_kp(CONTENT, status_of([]))) == ("A", 1, 1)


def test_onward_stays_on_the_last_questions_kp_while_it_has_questions_left():
    assert where(onward_kp(CONTENT, status_of([4]), q(4))) == ("B", 1, 1)


def test_onward_moves_on_through_the_book_skipping_kps_that_are_done():
    assert where(onward_kp(CONTENT, status_of([1, 2]), q(1))) == ("A", 3, 1)
    assert where(onward_kp(CONTENT, status_of([3]), q(3))) == ("B", 1, 2)


def test_onward_does_not_go_back_while_later_kps_have_work_left():
    assert where(onward_kp(CONTENT, status_of([2]), q(2))) == ("A", 3, 1)


def test_onward_goes_round_from_the_start_once_the_end_is_done():
    assert where(onward_kp(CONTENT, status_of([3, 4, 5]), q(5))) == ("A", 1, 1)
    assert where(onward_kp(CONTENT, status_of([1, 3, 4, 5]), q(3))) == ("A", 2, 1)


def test_onward_skips_excluded_kps_and_is_none_when_everything_is_done():
    assert onward_kp(CONTENT, status_of([1, 2, 3, 4, 5]), q(5)) is None
    assert where(onward_kp(CONTENT, status_of([1, 2, 3, 4, 5], excluded=()), q(5))) == ("B", 2, 1)


def test_kp_index_of():
    assert kp_index_of(CONTENT, "A", "极限", "0/0", status_of([])) == 3
    assert kp_index_of(CONTENT, "B", "导数概念", "基本概念题", status_of([])) == 1
