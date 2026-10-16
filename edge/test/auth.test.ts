import { describe, expect, it } from "vitest";
import { passwordMatches, signSession, verifySession } from "../src/auth";

const SECRET = "test-secret";
const NOW = Date.parse("2026-10-16T12:00:00Z");
const DAY = 24 * 3600 * 1000;

describe("session cookies", () => {
  it("accepts a token it signed before it expires", async () => {
    const token = await signSession(SECRET, NOW + DAY);
    expect(await verifySession(SECRET, token, NOW)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(SECRET, NOW + DAY);
    expect(await verifySession(SECRET, token, NOW + 2 * DAY)).toBe(false);
  });

  it("rejects a token with a changed expiry", async () => {
    const token = await signSession(SECRET, NOW + DAY);
    const [, sig] = token.split(".");
    expect(await verifySession(SECRET, `${NOW + 100 * DAY}.${sig}`, NOW)).toBe(false);
  });

  it("rejects tokens signed with another secret, and garbage", async () => {
    const token = await signSession("other", NOW + DAY);
    expect(await verifySession(SECRET, token, NOW)).toBe(false);
    expect(await verifySession(SECRET, "nonsense", NOW)).toBe(false);
    expect(await verifySession(SECRET, undefined, NOW)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("compares exactly", () => {
    expect(passwordMatches("pw", "pw")).toBe(true);
    expect(passwordMatches("pw ", "pw")).toBe(false);
    expect(passwordMatches("", "pw")).toBe(false);
  });
});
