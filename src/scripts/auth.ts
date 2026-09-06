import http from "node:http";
import readline from "node:readline";
import { config } from "../config.ts";
import { buildAuthorizeUrl, newState, exchangeAuthCode } from "../tiktok/auth.ts";

/**
 * One-off creator authorization.
 *
 * Opens with the authorize link, then accepts the callback either way:
 *  - a local listener, if the app's Redirect URL points at this machine
 *  - or a pasted callback URL, if the Redirect URL is a remote https endpoint
 *    you cannot serve locally
 */
const state = newState();
const authorizeUrl = buildAuthorizeUrl(state);

console.log("\n1. Open this URL and authorize as the creator:\n");
console.log(`   ${authorizeUrl}\n`);
console.log(`2. Waiting for the callback on http://localhost:${config.authPort}/`);
console.log("   ...or paste the full callback URL here and press Enter.\n");
console.log(`   (Redirect URL configured in .env: ${config.redirectUri})\n`);

let settled = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${config.authPort}`);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("No code in callback.");
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Authorized. You can close this tab and return to the terminal.");
  void finish(code, returnedState);
});

server.on("error", (error) => {
  console.warn(`Local listener unavailable (${error.message}). Paste the callback URL instead.`);
});
server.listen(config.authPort);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const url = new URL(trimmed);
    void finish(url.searchParams.get("code"), url.searchParams.get("state"));
  } catch {
    console.error("That does not parse as a URL. Paste the whole callback URL including ?code=...");
  }
});

async function finish(code: string | null, returnedState: string | null): Promise<void> {
  if (settled) return;

  if (!code) {
    console.error("Callback contained no `code`. Authorization was probably denied.");
    return;
  }
  // state is single-use and bound to this run; a mismatch means the callback
  // did not originate from the link printed above.
  if (returnedState !== state) {
    console.error(`State mismatch. Expected ${state}, got ${returnedState ?? "(none)"}. Refusing to exchange.`);
    return;
  }

  settled = true;

  try {
    const data = await exchangeAuthCode(code);
    console.log("\nAuthorized and stored.");
    console.log(`  open_id:        ${data.open_id}`);
    console.log(`  user_type:      ${data.user_type ?? "(not returned)"} (1 = creator)`);
    console.log(`  granted_scopes: ${JSON.stringify(data.granted_scopes ?? [])}`);
    console.log(`  access token expires:  ${formatExpiry(data.access_token_expire_in)}`);
    console.log(`  refresh token expires: ${formatExpiry(data.refresh_token_expire_in)}`);
    console.log("\nNext: npm run smoke\n");
    process.exitCode = 0;
  } catch (error) {
    console.error(`\nToken exchange failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    server.close();
  }
}

function formatExpiry(epochSeconds: number): string {
  return `${new Date(epochSeconds * 1000).toISOString()} (${epochSeconds})`;
}
