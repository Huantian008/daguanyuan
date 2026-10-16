import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, setup } from "./harness";

afterEach(() => vi.restoreAllMocks());

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

  it("asks for a user name as well as a password", async () => {
    const { client } = setup();
    const page = await (await client.get("/login")).text();
    expect(page).toContain('name="username"');
    expect(page).toContain('autocomplete="username"');
    expect(page).toContain('name="password"');
  });

  it.each([
    ["a wrong password", { username: "me", password: "nope" }],
    ["an unknown user name", { username: "nobody", password: "pw" }],
    ["no user name", { username: "", password: "pw" }],
    ["another user's password", { username: "me", password: "pw2" }],
  ])("rejects %s with the same message and no cookie", async (_label, form) => {
    const { client } = setup();
    const res = await client.post("/login", { ...form, next: "/" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("用户名或密码不对");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the user name in the form after a failed attempt", async () => {
    const { client } = setup();
    const res = await client.post("/login", { username: "pal", password: "nope", next: "/" });
    expect(await res.text()).toContain('value="pal"');
  });

  it("does not let anyone in whose password secret is not set", async () => {
    const { client } = setup({ friendPassword: "" });
    const res = await client.post("/login", { username: "pal", password: "", next: "/" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("logs in with a secure cookie and returns to the requested page", async () => {
    const { client } = setup();
    const res = await client.post("/login", { username: "me", password: "pw", next: "/speedtest" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/speedtest");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/dgy_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("lets the friend in with their own name and password", async () => {
    const { client } = setup();
    await client.login("pal", "pw2");
    expect((await client.get("/")).status).toBe(200);
  });

  it("accepts the user name in any case with spaces around it", async () => {
    const { client } = setup();
    await client.login("  ME ", "pw");
    expect((await client.get("/")).status).toBe(200);
  });

  it("only redirects back to pages on this site", async () => {
    const { client } = setup();
    const res = await client.post("/login", { username: "me", password: "pw", next: "https://evil.example/" });
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

  it("logs one user out everywhere when their password changes, without touching the other", async () => {
    const { app, env, client: me } = setup();
    const pal = new Client(app, env);
    await me.login();
    await pal.login("pal", "pw2");
    env.FRIEND_PASSWORD = "changed";
    expect((await pal.get("/")).status).toBe(303);
    expect((await me.get("/")).status).toBe(200);
  });

  it("refuses to serve anything until the signing key and the accounts are configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const options of [{ secret: "" }, { users: undefined }, { users: [] }, { users: "[{" }]) {
      const { client } = setup(options);
      expect((await client.get("/login")).status).toBe(503);
    }
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
