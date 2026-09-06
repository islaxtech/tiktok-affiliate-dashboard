import crypto from "node:crypto";
import { config } from "../config.ts";
import { saveToken, getToken, type StoredToken } from "../db/tokens.ts";

/** user_type on the *token* response; 1 means a creator identity. */
export const CREATOR_USER_TYPE = 1;

export interface TokenResponseData {
  access_token: string;
  access_token_expire_in: number;
  refresh_token: string;
  refresh_token_expire_in: number;
  open_id: string;
  user_type?: number;
  granted_scopes?: string[];
  seller_name?: string | null;
  seller_base_region?: string | null;
}

export function newState(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Creator authorization link. This is deliberately *not* the seller endpoint —
 * creator links use shop.tiktok.com/alliance/creator/auth with app_key, and
 * `state` is required (it is optional for sellers).
 */
export function buildAuthorizeUrl(state: string): string {
  const url = new URL("https://shop.tiktok.com/alliance/creator/auth");
  url.searchParams.set("app_key", config.appKey);
  url.searchParams.set("state", state);
  return url.toString();
}

async function callAuthService(
  endpoint: "/api/v2/token/get" | "/api/v2/token/refresh",
  params: Record<string, string>,
): Promise<TokenResponseData> {
  const url = new URL(endpoint, config.authBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // The auth service takes app_secret directly and is not request-signed.
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();

  let payload: { code?: number; message?: string; data?: TokenResponseData };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Auth service returned non-JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }

  if (payload.code !== 0 || !payload.data) {
    throw new Error(
      `Auth service error on ${endpoint}: code=${payload.code} message=${payload.message ?? "(none)"}`,
    );
  }

  return payload.data;
}

function persist(data: TokenResponseData): TokenResponseData {
  saveToken({
    openId: data.open_id,
    accessToken: data.access_token,
    accessTokenExpiresAt: data.access_token_expire_in,
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt: data.refresh_token_expire_in,
    userType: data.user_type ?? null,
    grantedScopes: data.granted_scopes ?? [],
    sellerName: data.seller_name ?? null,
    sellerBaseRegion: data.seller_base_region ?? null,
  });
  return data;
}

/** Exchange the `code` from the redirect callback for tokens. */
export async function exchangeAuthCode(authCode: string): Promise<TokenResponseData> {
  const data = await callAuthService("/api/v2/token/get", {
    app_key: config.appKey,
    app_secret: config.appSecret,
    auth_code: authCode,
    grant_type: "authorized_code",
  });

  if (data.user_type !== undefined && data.user_type !== CREATOR_USER_TYPE) {
    throw new Error(
      `Authorized identity is user_type=${data.user_type}, expected ${CREATOR_USER_TYPE} (creator). ` +
        `A seller token cannot call Affiliate Creator APIs.`,
    );
  }

  return persist(data);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponseData> {
  const data = await callAuthService("/api/v2/token/refresh", {
    app_key: config.appKey,
    app_secret: config.appSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  // The docs recommend revalidating identity on every newly issued token
  // rather than assuming it matches the previous one.
  if (data.user_type !== undefined && data.user_type !== CREATOR_USER_TYPE) {
    throw new Error(`Refreshed token has user_type=${data.user_type}, expected ${CREATOR_USER_TYPE} (creator).`);
  }

  return persist(data);
}

const REFRESH_SKEW_SECONDS = 300;

/** Returns a usable access token, refreshing first if it is expired or close to it. */
export async function getValidAccessToken(): Promise<string> {
  const stored = requireToken();
  const now = Math.floor(Date.now() / 1000);

  if (stored.access_token_expires_at - now > REFRESH_SKEW_SECONDS) {
    return stored.access_token;
  }

  if (stored.refresh_token_expires_at <= now) {
    throw new Error("Refresh token has expired. Run `npm run auth` to reauthorize.");
  }

  const refreshed = await refreshAccessToken(stored.refresh_token);
  return refreshed.access_token;
}

export function requireToken(): StoredToken {
  const stored = getToken();
  if (!stored) {
    throw new Error("No creator token stored. Run `npm run auth` first.");
  }
  return stored;
}
