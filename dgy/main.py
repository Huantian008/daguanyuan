"""The web app.  Run with:  python -m dgy  (or uvicorn dgy.main:create_app --factory)"""
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Callable
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import db, studyday
from .backup import backup_daily
from .config import Settings, load_settings
from .content import load_content
from .routes import auth, bank, dashboard, history, knowledge, preferences, review
from .web import TEMPLATES

STATIC_DIR = Path(__file__).parent / "static"
PUBLIC_PREFIXES = ("/static/", "/login")

# Windows' MIME registry often lacks these; without image/webp browsers refuse to show the question images.
for _type, _ext in (("image/webp", ".webp"), ("font/woff2", ".woff2"), ("font/woff", ".woff"), ("font/ttf", ".ttf")):
    mimetypes.add_type(_type, _ext)


def create_app(settings: Settings | None = None, clock: Callable[[], datetime] | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="大观园", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.clock = clock or studyday.now
    app.state.content = load_content(settings.content_dir, settings.knowledge_md_dir, settings.bank_dir)
    app.state.backup_day = None
    # Version stamps in asset URLs so browsers never show stale CSS/JS or old images after a rebuild.
    TEMPLATES.env.globals["asset_v"] = max(int(p.stat().st_mtime) for p in STATIC_DIR.rglob("*.*"))
    TEMPLATES.env.globals["content_v"] = "".join(ch for ch in app.state.content.built_at if ch.isdigit())

    conn = db.connect(settings.db_path)
    db.init_db(conn)
    conn.close()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        path = request.url.path
        if settings.password and not request.session.get("auth") and not path.startswith(PUBLIC_PREFIXES):
            if "application/json" in request.headers.get("accept", ""):
                return JSONResponse({"code": "login_required", "error": "登录已过期，请重新登录。"}, status_code=401)
            target = path + (f"?{request.url.query}" if request.url.query else "")
            return RedirectResponse(f"/login?next={quote(target)}", status_code=303)
        day = studyday.study_day(app.state.clock())
        if app.state.backup_day != day:
            backup_daily(settings.db_path, settings.backup_dir, day)
            app.state.backup_day = day
        return await call_next(request)

    # Added after the guard so it wraps it: the session is decoded before the guard reads it.
    app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, max_age=30 * 24 * 3600,
                       same_site="lax", https_only=settings.https_only)

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.mount("/content", StaticFiles(directory=settings.content_dir), name="content")
    app.mount("/knowledge/assets", StaticFiles(directory=settings.knowledge_md_dir / "assets", check_dir=False),
              name="knowledge-assets")
    for module in (auth, dashboard, review, bank, knowledge, history, preferences):
        app.include_router(module.router)
    return app
