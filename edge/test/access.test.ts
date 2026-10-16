import { describe, expect, it } from "vitest";
import { setup } from "./harness";

describe("login and access control", () => {
  it("sends visitors without a session to the login page", async () => {
    const { client } = setup();
    const page = await client.get("/");
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("/login?next=%2F");
    const image = await client.get("/content/q/001.webp");
    expect(image.status).toBe(303);
    expect(image.headers.get("location")).toMatch(/^\/login/);
  });

  it("serves CSS and JS without logging in", async () => {
    const { client } = setup();
    const css = await client.get("/static/css/app.css?v=1760000000");
    expect(css.status).toBe(200);
    expect(css.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("rejects a wrong password", async () => {
    const { client } = setup();
    const res = await client.post("/login", { password: "nope", next: "/" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("密码不对");
  });

  it("logs in with a secure cookie and returns to the requested page", async () => {
    const { client } = setup();
    const res = await client.post("/login", { password: "pw", next: "/speedtest" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/speedtest");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/dgy_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("only redirects back to pages on this site", async () => {
    const { client } = setup();
    const res = await client.post("/login", { password: "pw", next: "https://evil.example/" });
    expect(res.headers.get("location")).toBe("/");
  });

  it("serves question images once logged in, with long caching for versioned URLs", async () => {
    const { client } = setup();
    await client.login();
    const versioned = await client.get("/content/q/001.webp?v=20261016120000");
    expect(versioned.status).toBe(200);
    expect(await versioned.text()).toBe("img");
    expect(versioned.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    const plain = await client.get("/content/q/001.webp");
    expect(plain.headers.get("cache-control")).toBe("private, no-cache");
    expect((await client.get("/content/q/999.webp")).status).toBe(404);
  });

  it("logs out", async () => {
    const { client } = setup();
    await client.login();
    await client.post("/logout", {});
    expect((await client.get("/")).status).toBe(303);
  });

  it("refuses to serve anything until the password and secret are configured", async () => {
    const { client } = setup({ password: "" });
    expect((await client.get("/login")).status).toBe(503);
  });

  it("shows the speed test page", async () => {
    const { client } = setup();
    await client.login();
    const page = await client.get("/speedtest");
    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain("测速");
    expect(text).toContain("/content/q/001.webp");
    expect((await client.get("/ping")).status).toBe(204);
  });
});
