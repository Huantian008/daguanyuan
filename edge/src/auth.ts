/** Login with a signed, expiring session cookie that names the user (HMAC-SHA256 via Web Crypto). */
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

/**
 * Token "<userId>.<expiresAt>.<signature>", where expiresAt is a millisecond timestamp.
 * The signature covers the user's current password, so changing a password logs that user out everywhere.
 */
export async function signSession(secret: string, userId: number, password: string, expiresAt: number): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret),
    encoder.encode(`dgy:${userId}:${expiresAt}:${password}`));
  return `${userId}.${expiresAt}.${toBase64Url(signature)}`;
}

/** The id of the user the token belongs to, or null if it is forged, expired, in the old format, or its owner's password changed. */
export async function verifySession(secret: string, token: string | undefined, now: number,
  passwordOf: (userId: number) => string): Promise<number | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1]) || Number(parts[1]) <= now) return null;
  const userId = Number(parts[0]);
  const password = passwordOf(userId);
  if (!password) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(parts[2]),
      encoder.encode(`dgy:${parts[0]}:${parts[1]}:${password}`));
    return valid ? userId : null;
  } catch {
    return null;
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
