"""Runtime settings, from environment variables with local defaults."""
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXAM_DATE = "2026-12-19"
DEFAULT_WARMUP_DAYS = 3


@dataclass(frozen=True)
class Settings:
    content_dir: Path
    data_dir: Path
    knowledge_md_dir: Path
    password: str | None = None
    secret_key: str = ""
    https_only: bool = False

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def backup_dir(self) -> Path:
        return self.data_dir / "backups"


def _stored_secret(data_dir: Path) -> str:
    path = data_dir / "secret_key"
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    data_dir.mkdir(parents=True, exist_ok=True)
    key = secrets.token_hex(32)
    path.write_text(key, encoding="utf-8")
    return key


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("DGY_DATA_DIR", PROJECT_ROOT / "data"))
    return Settings(
        content_dir=Path(os.environ.get("DGY_CONTENT_DIR", PROJECT_ROOT / "content")),
        data_dir=data_dir,
        knowledge_md_dir=Path(os.environ.get("DGY_KNOWLEDGE_DIR", PROJECT_ROOT / "knowledge-md")),
        password=os.environ.get("APP_PASSWORD") or None,
        secret_key=os.environ.get("SECRET_KEY") or _stored_secret(data_dir),
        https_only=os.environ.get("HTTPS_ONLY") == "1",
    )
