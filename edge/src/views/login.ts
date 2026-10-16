import { html } from "hono/html";
import type { Meta } from "../env";
import { layout } from "./layout";

export const loginPage = (meta: Meta, next: string, error?: string) => layout(meta, {
  title: "登录",
  body: html`<form class="card form login" method="post" action="/login">
  <h1>大观园</h1>
  <input type="hidden" name="next" value="${next}">
  <label for="password">密码</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ""}
  <button class="btn btn-primary">登录</button>
</form>`,
});
