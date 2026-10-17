import json

from dgy.bank import load_bank, plain_text, question_text

CHOICE = {"num": 1, "type": "choice", "stem": "函数 $f(x)=\\dfrac{1}{x}$ 在 $(0,1)$ 内（　　）.",
          "options": {"B": "无界", "A": "有界", "C": "$x>\\dfrac12$ 时有界", "D": "4."}, "figure": False,
          "answer": "C", "erratum": "速查原印 $B$"}


def test_question_text_renders_stem_options_answer_and_erratum():
    t = question_text(CHOICE)
    assert t.stem.startswith("<p>函数 <span class=\"math inline\">f(x)=\\dfrac{1}{x}</span>")
    assert [key for key, _html in t.options] == ["A", "B", "C", "D"]
    assert t.option("D") == "4."  # inline only: "4." does not turn into a numbered list
    assert t.option("C") == '<span class="math inline">x&gt;\\dfrac12</span> 时有界'
    assert t.answer_key == "C" and t.answer == "<p>C</p>\n"
    assert t.erratum == '速查原印 <span class="math inline">B</span>'
    assert not t.options_wide and not t.figure


def test_answers_and_long_options():
    t = question_text({"num": 2, "type": "fill", "stem": "求极限.\n\n(2) 再求", "options": None, "figure": True,
                       "answer": "① $1$;\n\n② $2$."})
    assert t.stem.count("<p>") == 2 and t.answer.count("<p>") == 2
    assert t.answer_key is None and t.erratum is None and t.options == () and t.figure
    wide = question_text(dict(CHOICE, options={k: "很长的一段选项文字，" * 3 for k in "ABCD"}))
    assert wide.options_wide


def test_plain_text_for_searching():
    assert plain_text("求 $\\displaystyle\\lim_{x\\to0}\\frac{\\sin x}{x}$ 的拐点") == "求 lim x 0 sin x x 的拐点"
    assert plain_text("$\\mathrm{e}^{x}$") == "e x"


def test_load_bank(tmp_path):
    assert load_bank(tmp_path) == {} and load_bank(None) == {}
    (tmp_path / "questions.json").write_text(json.dumps({"version": 1, "questions": [CHOICE]}, ensure_ascii=False),
                                             encoding="utf-8")
    bank = load_bank(tmp_path)
    assert list(bank) == [1] and "有界" in bank[1].search
