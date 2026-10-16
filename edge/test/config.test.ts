// The real wrangler.jsonc: a typo in USERS would make the live site answer 503, so check that it parses.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAccounts } from "../src/users";

// wrangler.jsonc allows full-line // comments, which JSON.parse does not.
const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""));

describe("accounts in wrangler.jsonc", () => {
  it("are a valid list", () => {
    expect(() => parseAccounts(config.vars?.USERS)).not.toThrow();
  });

  it("keep the ids and password secrets the data and the live secrets already depend on", () => {
    // The migration gave all existing progress to id 1, and APP_PASSWORD is the owner's password that is already set.
    const accounts = parseAccounts(config.vars.USERS);
    expect(accounts.map((a) => [a.id, a.passwordSecret])).toEqual([[1, "APP_PASSWORD"], [2, "FRIEND_PASSWORD"]]);
  });
});
