/** Password login with a signed, expiring session cookie (HMAC-SHA256 via Web Crypto). */
const encoder = new TextEncoder();

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Token "<expiresAt>.<signature>", where expiresAt is a millisecond timestamp. */
export async function signSession(secret: string, expiresAt: number): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`dgy:${expiresAt}`));
  return `${expiresAt}.${toBase64Url(signature)}`;
}

export async function verifySession(secret: string, token: string | undefined, now: number): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || Number(parts[0]) <= now) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(parts[1]),
      encoder.encode(`dgy:${parts[0]}`));
  } catch {
    return false;
  }
}

/** Constant-time comparison; an empty expected password never matches. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return b.length > 0 && diff === 0;
}
