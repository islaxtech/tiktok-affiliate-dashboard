import { ttsRequest, TtsApiError } from "../tiktok/client.ts";
import { requireToken } from "../tiktok/auth.ts";
import { CREATOR_PROFILE_PATH } from "../tiktok/endpoints.ts";

/**
 * Step 1 gate: prove signing, auth and token storage work end to end by
 * calling the one read-only endpoint that needs no arguments, and print the
 * raw response exactly as TikTok returned it.
 */
async function main(): Promise<void> {
  const token = requireToken();
  console.log(`Creator open_id: ${token.open_id}`);
  console.log(`Granted scopes:  ${token.granted_scopes}`);
  console.log(`Access token expires: ${new Date(token.access_token_expires_at * 1000).toISOString()}`);
  console.log(`\nGET ${CREATOR_PROFILE_PATH}\n`);

  const envelope = await ttsRequest<unknown>({
    method: "GET",
    path: CREATOR_PROFILE_PATH,
  });

  console.log(JSON.stringify(envelope, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof TtsApiError) {
    console.error(`\nAPI error ${error.code} on ${error.path}: ${error.message}`);
    console.error(`HTTP ${error.httpStatus}  request_id=${error.requestId ?? "(none)"}`);
    console.error("The raw response was still written to raw_responses.");
  } else {
    console.error(`\n${(error as Error).message}`);
  }
  process.exitCode = 1;
});
