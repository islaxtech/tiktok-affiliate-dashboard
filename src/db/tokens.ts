import { getDb } from "./index.ts";

export interface StoredToken {
  open_id: string;
  access_token: string;
  access_token_expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number;
  user_type: number | null;
  granted_scopes: string;
  seller_name: string | null;
  seller_base_region: string | null;
  obtained_at: number;
  updated_at: number;
}

export interface TokenUpsert {
  openId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  userType: number | null;
  grantedScopes: string[];
  sellerName?: string | null;
  sellerBaseRegion?: string | null;
}

export function saveToken(input: TokenUpsert): void {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO oauth_tokens (
         open_id, access_token, access_token_expires_at, refresh_token,
         refresh_token_expires_at, user_type, granted_scopes, seller_name,
         seller_base_region, obtained_at, updated_at
       ) VALUES (
         @open_id, @access_token, @access_token_expires_at, @refresh_token,
         @refresh_token_expires_at, @user_type, @granted_scopes, @seller_name,
         @seller_base_region, @now, @now
       )
       ON CONFLICT(open_id) DO UPDATE SET
         access_token             = excluded.access_token,
         access_token_expires_at  = excluded.access_token_expires_at,
         refresh_token            = excluded.refresh_token,
         refresh_token_expires_at = excluded.refresh_token_expires_at,
         user_type                = excluded.user_type,
         granted_scopes           = excluded.granted_scopes,
         seller_name              = excluded.seller_name,
         seller_base_region       = excluded.seller_base_region,
         updated_at               = excluded.updated_at`,
    )
    .run({
      open_id: input.openId,
      access_token: input.accessToken,
      access_token_expires_at: input.accessTokenExpiresAt,
      refresh_token: input.refreshToken,
      refresh_token_expires_at: input.refreshTokenExpiresAt,
      user_type: input.userType,
      granted_scopes: JSON.stringify(input.grantedScopes),
      seller_name: input.sellerName ?? null,
      seller_base_region: input.sellerBaseRegion ?? null,
      now,
    });
}

/** The single creator this dashboard is for. Most recently refreshed wins. */
export function getToken(): StoredToken | null {
  const row = getDb()
    .prepare(`SELECT * FROM oauth_tokens ORDER BY updated_at DESC LIMIT 1`)
    .get() as StoredToken | undefined;
  return row ?? null;
}
