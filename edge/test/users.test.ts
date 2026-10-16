import { describe, expect, it } from "vitest";
import { findAccount, parseAccounts, passwordOf } from "../src/users";

const LIST = [
  { id: 1, name: "小王", password_secret: "APP_PASSWORD" },
  { id: 2, name: "Pal", password_secret: "FRIEND_PASSWORD" },
];

describe("parseAccounts", () => {
  it("reads the array from wrangler vars", () => {
    expect(parseAccounts(LIST)).toEqual([
      { id: 1, name: "小王", passwordSecret: "APP_PASSWORD" },
      { id: 2, name: "Pal", passwordSecret: "FRIEND_PASSWORD" },
    ]);
  });

  it("reads the same list from a JSON string, because .dev.vars only holds strings", () => {
    expect(parseAccounts(JSON.stringify(LIST))).toEqual(parseAccounts(LIST));
  });

  it("keeps names without the spaces around them", () => {
    expect(parseAccounts([{ id: 1, name: " me ", password_secret: "A" }])[0].name).toBe("me");
  });

  const dup = (a: object, b: object) => [{ id: 1, name: "a", password_secret: "A", ...a }, { id: 2, name: "b", password_secret: "B", ...b }];
  it.each([
    ["a missing list", undefined],
    ["an empty list", []],
    ["something that is not a list", { id: 1 }],
    ["broken JSON", "[{"],
    ["an entry that is not an object", [null]],
    ["an id that is not a positive whole number", [{ id: 0, name: "a", password_secret: "A" }]],
    ["an id given as text", [{ id: "1", name: "a", password_secret: "A" }]],
    ["a blank name", [{ id: 1, name: "  ", password_secret: "A" }]],
    ["an entry without a secret name", [{ id: 1, name: "a" }]],
    ["two accounts with the same id", dup({ id: 1 }, { id: 1 })],
    ["two names that differ only in case or spaces", dup({ name: "Pal" }, { name: " pal " })],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseAccounts(raw)).toThrow();
  });
});

describe("findAccount", () => {
  const accounts = parseAccounts(LIST);

  it("matches the name ignoring case and surrounding spaces", () => {
    expect(findAccount(accounts, "  pal ")?.id).toBe(2);
    expect(findAccount(accounts, "小王")?.id).toBe(1);
  });

  it("finds nobody for an unknown or empty name", () => {
    expect(findAccount(accounts, "nobody")).toBeUndefined();
    expect(findAccount(accounts, "")).toBeUndefined();
    expect(findAccount(accounts, "   ")).toBeUndefined();
  });
});

describe("passwordOf", () => {
  const [me] = parseAccounts(LIST);

  it("reads the secret the account points at", () => {
    expect(passwordOf({ APP_PASSWORD: "pw", FRIEND_PASSWORD: "other" }, me)).toBe("pw");
  });

  it("is empty when that secret is not set, so the account cannot log in", () => {
    expect(passwordOf({}, me)).toBe("");
    expect(passwordOf({ APP_PASSWORD: 42 }, me)).toBe("");
  });
});
