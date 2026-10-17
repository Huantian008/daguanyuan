from datetime import date

from fastapi import APIRouter, Depends, Form, Request

from .. import db
from ..web import exam_date, get_conn, redirect, render, warmup_days

router = APIRouter()


@router.get("/settings")
def settings_form(request: Request, saved: int = 0, conn=Depends(get_conn)):
    settings = request.app.state.settings
    backups = sorted(settings.backup_dir.glob("app-*.db")) if settings.backup_dir.exists() else []
    return render(request, "settings.html", nav="settings", exam_date=exam_date(conn),
                  warmup_days=warmup_days(conn), saved=saved, password_on=bool(settings.password),
                  db_path=settings.db_path, latest_backup=backups[-1].name if backups else None,
                  built_at=request.app.state.content.built_at)


@router.post("/settings")
def save(request: Request, exam_date: str = Form(...), warmup_days: str = Form("3"), conn=Depends(get_conn)):
    try:
        db.set_setting(conn, "exam_date", date.fromisoformat(exam_date).isoformat())
    except ValueError:
        pass
    if warmup_days.isdigit() and 1 <= int(warmup_days) <= 7:
        db.set_setting(conn, "warmup_days", warmup_days)
    return redirect("/settings?saved=1")
