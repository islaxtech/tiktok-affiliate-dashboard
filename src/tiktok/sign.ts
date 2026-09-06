import crypto from "node:crypto";

/**
 * Query params that are never part of the signature base string.
 * Per "Sign your API request": sign is the output itself, and access_token
 * is excluded for legacy endpoints that still pass it in the query string.
 */
const EXCLUDED_KEYS = new Set(["sign", "access_token"]);

export interface SignInput {
  /** Request path only, no host and no query string. e.g. /affiliate_creator/202405/profiles */
  path: string;
  /** Query params as they will be sent, excluding `sign`. */
  query: Record<string, string | number>;
  /**
   * The exact body bytes that will be sent, or undefined for bodyless requests.
   * Must be the same string handed to fetch — re-serializing changes the sign.
   */
  body?: string;
  /** Content-Type of the outgoing request; multipart/form-data bodies are not signed. */
  contentType?: string;
  appSecret: string;
}

/**
 * HMAC-SHA256 request signature.
 *
 * Steps, per the Partner Center "Sign your API request" doc:
 *   1. take all query params except `sign` and `access_token`
 *   2. sort keys alphabetically, concatenate as {key}{value}
 *   3. prefix with the request path
 *   4. append the raw request body (unless multipart/form-data)
 *   5. wrap the whole thing in the app secret on both sides
 *   6. HMAC-SHA256 with the app secret as key, lowercase hex
 */
export function generateSign(input: SignInput): string {
  const { path, query, body, contentType, appSecret } = input;

  const paramString = Object.keys(query)
    .filter((key) => !EXCLUDED_KEYS.has(key))
    .sort()
    .map((key) => `${key}${query[key]}`)
    .join("");

  let base = `${path}${paramString}`;

  const isMultipart = (contentType ?? "").toLowerCase().startsWith("multipart/form-data");
  if (!isMultipart && body) {
    base += body;
  }

  const wrapped = `${appSecret}${base}${appSecret}`;

  return crypto.createHmac("sha256", appSecret).update(wrapped, "utf8").digest("hex");
}

/** 10-digit Unix timestamp. Must be within 5 minutes of TikTok's clock. */
export function unixTimestamp(now: number = Date.now()): number {
  return Math.floor(now / 1000);
}
