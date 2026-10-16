import sqlite3
from datetime import date

from dgy.backup import backup_daily


def _make_db(path):
    with sqlite3.connect(path) as c:
        c.execute("CREATE TABLE t (x)")
        c.execute("INSERT INTO t VALUES (42)")


def test_creates_one_backup_per_day(tmp_path):
    db_path = tmp_path / "app.db"
    _make_db(db_path)
    first = backup_daily(db_path, tmp_path / "backups", date(2026, 10, 16))
    assert first.name == "app-20261016.db"
    with sqlite3.connect(first) as c:
        assert c.execute("SELECT x FROM t").fetchone() == (42,)
    assert backup_daily(db_path, tmp_path / "backups", date(2026, 10, 16)) is None


def test_keeps_only_the_newest_backups(tmp_path):
    db_path = tmp_path / "app.db"
    _make_db(db_path)
    backups = tmp_path / "backups"
    backups.mkdir()
    for day in range(1, 17):
        (backups / f"app-202609{day:02d}.db").write_bytes(b"old")
    backup_daily(db_path, backups, date(2026, 10, 16), keep=14)
    kept = sorted(p.name for p in backups.iterdir())
    assert len(kept) == 14
    assert kept[-1] == "app-20261016.db"
    assert "app-20260901.db" not in kept
