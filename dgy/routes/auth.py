import hmac

from fastapi import APIRouter, Form, Request

from ..web import redirect, render, safe_back

router = APIRouter()


@router.get("/login")
def login_form(request: Request, next: str = "/"):
    if not request.app.state.settings.password:
        return redirect("/")
    return render(request, "login.html", next=safe_back(next), error=None)


@router.post("/login")
def login(request: Request, password: str = Form(""), next: str = Form("/")):
    expected = request.app.state.settings.password or ""
    if expected and hmac.compare_digest(password.encode(), expected.encode()):
        request.session["auth"] = True
        return redirect(safe_back(next))
    return render(request, "login.html", next=safe_back(next), error="密码不对，请重新输入。")


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return redirect("/login")
