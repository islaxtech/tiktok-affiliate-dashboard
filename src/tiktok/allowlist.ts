/**
 * The complete set of API calls this app is permitted to make.
 *
 * Hard constraint: this dashboard is read-only. Nothing that creates, updates
 * or deletes state on TikTok Shop may ever appear here. The HTTP client refuses
 * any request not on this list, so adding an entry is the only way to widen
 * the blast radius — do that deliberately.
 *
 * Note that several *read* endpoints are POST (`.../search`), so method alone
 * cannot be the guard; entries are exact `METHOD path` pairs.
 *
 * Paths are added per build step, only after being confirmed against the
 * current Partner Center reference page. Generation numbers move.
 */
export const ALLOWED_REQUESTS = new Set<string>([
  // Confirmed: partner.tiktokshop.com/docv2/page/get-creator-profile-202405
  "GET /affiliate_creator/202405/profiles",
]);

export function assertAllowed(method: string, path: string): void {
  const key = `${method.toUpperCase()} ${path}`;
  if (!ALLOWED_REQUESTS.has(key)) {
    throw new Error(
      `Blocked: "${key}" is not on the read-only allowlist. ` +
        `If this is genuinely a read endpoint, add it to src/tiktok/allowlist.ts after confirming the path in Partner Center.`,
    );
  }
}
