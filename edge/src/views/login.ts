import { html } from "hono/html";
import type { Meta } from "../env";
import { layout } from "./layout";

/** `username` refills the form after a failed attempt, so only the password has to be typed again. */
export const loginPage = (meta: Meta, next: string, error?: string, username = "") => layout(meta, {
  title: "登录",
  body: html`<form class="card form login" method="post" action="/login">
  <h1>大观园</h1>
  <input type="hidden" name="next" value="${next}">
  <label for="username">用户名</label>
  <input id="username" name="username" type="text" value="${username}" autocomplete="username" autocapitalize="none" spellcheck="false" ${username ? "" : "autofocus"} required>
  <label for="password">密码</label>
  <input id="password" name="password" type="password" autocomplete="current-password" ${username ? "autofocus" : ""} required>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ""}
  <button class="btn btn-primary">登录</button>
</form>`,
});
