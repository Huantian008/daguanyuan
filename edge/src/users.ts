/** The accounts that may log in: listed in wrangler.jsonc `vars.USERS`, each pointing at the secret that holds its password. */

/** Who is logged in, as the pages see it. */
export interface User {
  id: number;
  name: string;
}

export interface Account extends User {
  /** Name of the secret (set with `wrangler secret put`) that holds this account's password. */
  passwordSecret: string;
}

const normalize = (name: string) => name.trim().toLowerCase();

/**
 * Reads `USERS`: an array in wrangler.jsonc, or the same list as JSON text (a .dev.vars file can only hold text).
 * Throws a readable error when the list is wrong.
 */
export function parseAccounts(raw: unknown): Account[] {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      throw new Error("USERS 不是合法的 JSON");
    }
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error("USERS 必须是至少有一个账号的列表");

  const ids = new Set<number>();
  const names = new Set<string>();
  return list.map((entry, i): Account => {
    const where = `USERS 第 ${i + 1} 项`;
    if (typeof entry !== "object" || entry === null) throw new Error(`${where}不是对象`);
    const { id, name, password_secret: secret } = entry as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) throw new Error(`${where}的 id 必须是正整数`);
    if (typeof name !== "string" || !normalize(name)) throw new Error(`${where}缺少 name`);
    if (typeof secret !== "string" || !secret) throw new Error(`${where}缺少 password_secret`);
    if (ids.has(id)) throw new Error(`USERS 里有重复的 id：${id}`);
    if (names.has(normalize(name))) throw new Error(`USERS 里有重复的用户名：${name.trim()}`);
    ids.add(id);
    names.add(normalize(name));
    return { id, name: name.trim(), passwordSecret: secret };
  });
}

/** The configured accounts; none when USERS is missing or wrong, which makes the site refuse to serve. */
export function accountsOf(env: { USERS?: unknown }): Account[] {
  try {
    return parseAccounts(env.USERS);
  } catch (error) {
    console.error((error as Error).message);
    return [];
  }
}

/** Matches the typed user name ignoring case and surrounding spaces. */
export function findAccount(accounts: Account[], name: string): Account | undefined {
  const wanted = normalize(name);
  return wanted ? accounts.find((a) => normalize(a.name) === wanted) : undefined;
}

/** The password held in the account's secret; empty when that secret is not set, so the account cannot log in. */
export function passwordOf(env: object, account: Account): string {
  const value = (env as Record<string, unknown>)[account.passwordSecret];
  return typeof value === "string" ? value : "";
}

export const toUser = ({ id, name }: Account): User => ({ id, name });
