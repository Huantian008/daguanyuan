import { describe, expect, it } from "vitest";
import { passwordMatches, signSession, verifySession } from "../src/auth";

const SECRET = "test-secret";
const NOW = Date.parse("2026-10-16T12:00:00Z");
const DAY = 24 * 3600 * 1000;

const passwords: Record<number, string> = { 1: "pw", 2: "pw2" };
const passwordOf = (id: number) => passwords[id] ?? "";

describe("session cookies", () => {
  it("accepts a token it signed before it expires, and says whose it is", async () => {
    expect(await verifySession(SECRET, await signSession(SECRET, 1, "pw", NOW + DAY), NOW, passwordOf)).toBe(1);
    expect(await verifySession(SECRET, await signSession(SECRET, 2, "pw2", NOW + DAY), NOW, passwordOf)).toBe(2);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(SECRET, 1, "pw", NOW + DAY);
    expect(await verifySession(SECRET, token, NOW + 2 * DAY, passwordOf)).toBeNull();
  });

  it("rejects a token with a changed expiry", async () => {
    const [id, , sig] = (await signSession(SECRET, 1, "pw", NOW + DAY)).split(".");
    expect(await verifySession(SECRET, `${id}.${NOW + 100 * DAY}.${sig}`, NOW, passwordOf)).toBeNull();
  });

  it("rejects a token whose user was changed", async () => {
    const [, expiresAt, sig] = (await signSession(SECRET, 2, "pw2", NOW + DAY)).split(".");
    expect(await verifySession(SECRET, `1.${expiresAt}.${sig}`, NOW, passwordOf)).toBeNull();
  });

  it("rejects tokens signed with another secret, and garbage", async () => {
    const token = await signSession("other", 1, "pw", NOW + DAY);
    expect(await verifySession(SECRET, token, NOW, passwordOf)).toBeNull();
    expect(await verifySession(SECRET, "nonsense", NOW, passwordOf)).toBeNull();
    expect(await verifySession(SECRET, "1.2.3.4", NOW, passwordOf)).toBeNull();
    expect(await verifySession(SECRET, undefined, NOW, passwordOf)).toBeNull();
  });

  it("rejects the cookie format used before there were accounts", async () => {
    expect(await verifySession(SECRET, `${NOW + DAY}.c2lnbmF0dXJl`, NOW, passwordOf)).toBeNull();
  });

  it("stops working for a user whose password changed, but not for the others", async () => {
    const mine = await signSession(SECRET, 1, "pw", NOW + DAY);
    const theirs = await signSession(SECRET, 2, "pw2", NOW + DAY);
    const changed = (id: number) => (id === 2 ? "new-password" : passwordOf(id));
    expect(await verifySession(SECRET, theirs, NOW, changed)).toBeNull();
    expect(await verifySession(SECRET, mine, NOW, changed)).toBe(1);
  });

  it("rejects a user that no longer exists or has no password", async () => {
    const token = await signSession(SECRET, 3, "pw3", NOW + DAY);
    expect(await verifySession(SECRET, token, NOW, passwordOf)).toBeNull();
    const unset = await signSession(SECRET, 1, "", NOW + DAY);
    expect(await verifySession(SECRET, unset, NOW, () => "")).toBeNull();
  });
});

describe("passwordMatches", () => {
  it("compares exactly", () => {
    expect(passwordMatches("pw", "pw")).toBe(true);
    expect(passwordMatches("pw ", "pw")).toBe(false);
    expect(passwordMatches("", "pw")).toBe(false);
  });

  it("never matches an empty password", () => {
    expect(passwordMatches("", "")).toBe(false);
  });
});
