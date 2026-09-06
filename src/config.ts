import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in (see Partner Center -> your app -> App details).`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export const config = {
  appKey: required("TTS_APP_KEY"),
  appSecret: required("TTS_APP_SECRET"),
  redirectUri: optional("TTS_REDIRECT_URI", "http://localhost:5599/callback"),
  authPort: Number(optional("TTS_AUTH_PORT", "5599")),
  baseUrl: optional("TTS_BASE_URL", "https://open-api.tiktokglobalshop.com"),
  authBaseUrl: optional("TTS_AUTH_BASE_URL", "https://auth.tiktok-shops.com"),
  dbPath: optional("DB_PATH", "./data/dashboard.db"),
};
