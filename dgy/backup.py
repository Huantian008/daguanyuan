"""One SQLite backup per study day, keeping the newest few."""
import sqlite3
from datetime import date
from pathlib import Path


def backup_daily(db_path: Path, backup_dir: Path, today: date, keep: int = 14) -> Path | None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"app-{today:%Y%m%d}.db"
    if target.exists():
        return None
    src = sqlite3.connect(db_path)
    try:
        dst = sqlite3.connect(target)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    for old in sorted(backup_dir.glob("app-*.db"))[:-keep]:
        old.unlink()
    return target
