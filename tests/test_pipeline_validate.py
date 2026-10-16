from pipeline.validate import validate


def _question(num):
    return {
        "num": num,
        "source": "2004数三",
        "source_full": "2004数三",
        "img": {"src": f"q/{num:03d}.webp", "w": 10, "h": 10},
        "answer": {"src": f"a/{num:03d}.webp", "w": 10, "h": 10},
        "solution": [{"src": f"s/{num:03d}-1.webp", "w": 10, "h": 10}],
    }


def _write(root, rel):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")


def _manifest():
    return {"questions": [_question(1), _question(2)], "knowledge": [], "alignment": {"weak": [], "skipped": []}}


def test_complete_content_passes(tmp_path):
    for rel in ("q/001.webp", "a/001.webp", "s/001-1.webp", "q/002.webp", "a/002.webp", "s/002-1.webp"):
        _write(tmp_path, rel)
    report = validate(_manifest(), tmp_path, expected=2)
    assert report.ok, report.errors


def test_missing_answer_is_reported(tmp_path):
    for rel in ("q/001.webp", "a/001.webp", "s/001-1.webp", "q/002.webp", "s/002-1.webp"):
        _write(tmp_path, rel)
    report = validate(_manifest(), tmp_path, expected=2)
    assert not report.ok
    assert any("#002" in e and "答案" in e for e in report.errors)


def test_wrong_question_count_is_reported(tmp_path):
    report = validate(_manifest(), tmp_path, expected=613)
    assert any("613" in e for e in report.errors)
