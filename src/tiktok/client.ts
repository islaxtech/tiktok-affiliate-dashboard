import { config } from "../config.ts";
import { getDb } from "../db/index.ts";
import { assertAllowed } from "./allowlist.ts";
import { generateSign, unixTimestamp } from "./sign.ts";
import { getValidAccessToken, refreshAccessToken, requireToken } from "./auth.ts";

/** TikTok signals an expired access token in the body, not as HTTP 401. */
const ACCESS_TOKEN_EXPIRED = 105002;
const TOKEN_INVALID = 105001;
const MISSING_SCOPE = 105005;
const WRONG_TOKEN_IDENTITY = 101000;

export interface TtsEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

export class TtsApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly requestId: string | undefined,
    readonly httpStatus: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "TtsApiError";
  }
}

export interface TtsRequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
}

interface RawResult {
  httpStatus: number;
  text: string;
}

function persistRaw(
  options: TtsRequestOptions,
  signedQuery: Record<string, string | number>,
  bodyString: string | undefined,
  result: RawResult,
  parsed: Partial<TtsEnvelope<unknown>> | null,
): void {
  // Hard constraint: the raw response is stored before anything reads it.
  const { sign: _sign, ...loggableQuery } = signedQuery as Record<string, unknown>;
  getDb()
    .prepare(
      `INSERT INTO raw_responses (
         fetched_at, method, path, query, request_body,
         http_status, api_code, api_message, tts_request_id, body
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Math.floor(Date.now() / 1000),
      options.method,
      options.path,
      JSON.stringify(loggableQuery),
      bodyString ?? null,
      result.httpStatus,
      parsed?.code ?? null,
      parsed?.message ?? null,
      parsed?.request_id ?? null,
      result.text,
    );
}

async function performRequest(
  options: TtsRequestOptions,
  accessToken: string,
): Promise<{ result: RawResult; parsed: TtsEnvelope<unknown> | null; signedQuery: Record<string, string | number>; bodyString: string | undefined }> {
  const contentType = "application/json";

  // Serialize once. The signature must cover the exact bytes that go on the wire.
  const bodyString = options.body === undefined ? undefined : JSON.stringify(options.body);

  const query: Record<string, string | number> = {
    ...(options.query ?? {}),
    app_key: config.appKey,
    timestamp: unixTimestamp(),
  };

  const sign = generateSign({
    path: options.path,
    query,
    body: bodyString,
    contentType,
    appSecret: config.appSecret,
  });

  const signedQuery = { ...query, sign };

  const url = new URL(options.path, config.baseUrl);
  for (const [key, value] of Object.entries(signedQuery)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method,
    headers: {
      "content-type": contentType,
      // 202309 and later: the token goes in this header and is NOT signed.
      "x-tts-access-token": accessToken,
    },
    body: bodyString,
  });

  const result: RawResult = { httpStatus: response.status, text: await response.text() };

  let parsed: TtsEnvelope<unknown> | null = null;
  try {
    parsed = JSON.parse(result.text) as TtsEnvelope<unknown>;
  } catch {
    parsed = null;
  }

  persistRaw(options, signedQuery, bodyString, result, parsed);

  return { result, parsed, signedQuery, bodyString };
}

/**
 * Signed, allowlisted, read-only call to the TikTok Shop API.
 * Refreshes the access token once and retries if the token turns out to be stale.
 */
export async function ttsRequest<T>(options: TtsRequestOptions): Promise<TtsEnvelope<T>> {
  assertAllowed(options.method, options.path);

  let accessToken = await getValidAccessToken();
  let attempt = await performRequest(options, accessToken);

  const expired =
    attempt.result.httpStatus === 401 || attempt.parsed?.code === ACCESS_TOKEN_EXPIRED;

  if (expired) {
    const stored = requireToken();
    const refreshed = await refreshAccessToken(stored.refresh_token);
    accessToken = refreshed.access_token;
    attempt = await performRequest(options, accessToken);
  }

  const { result, parsed } = attempt;

  // Surface a moved generation loudly instead of silently trying another version.
  if (result.httpStatus === 404) {
    throw new TtsApiError(
      404,
      `${options.path} returned 404 — the API generation has probably moved. Re-check the path in Partner Center; do not fall back to another version.`,
      parsed?.request_id,
      404,
      options.path,
    );
  }

  if (!parsed) {
    throw new TtsApiError(
      -1,
      `Non-JSON response (HTTP ${result.httpStatus}): ${result.text.slice(0, 500)}`,
      undefined,
      result.httpStatus,
      options.path,
    );
  }

  if (parsed.code !== 0) {
    throw new TtsApiError(
      parsed.code,
      decorate(parsed.code, parsed.message),
      parsed.request_id,
      result.httpStatus,
      options.path,
    );
  }


  return parsed as TtsEnvelope<T>;
}

function decorate(code: number, message: string): string {
  switch (code) {
    case TOKEN_INVALID:
      return `${message} (token invalid or access was removed — run \`npm run auth\` to reauthorize)`;
    case MISSING_SCOPE:
      return `${message} (missing scope — check the app's creator.* scopes in Partner Center, then the token's granted_scopes)`;
    case WRONG_TOKEN_IDENTITY:
      return `${message} (wrong token identity — a seller token cannot call Affiliate Creator APIs)`;
    default:
      return message;
  }
}
