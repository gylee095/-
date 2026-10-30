// Node 실행 환경(CLI·MCP)에서 비밀값을 환경변수로 읽는다. 값은 GCP Secret Manager / 1Password CLI 등에서 주입할 것.
import type { Env } from "./types.js";

const KEYS: (keyof Env)[] = [
  "SAFETYDATA_API_KEY",
  "OPENSKY_CLIENT_ID",
  "OPENSKY_CLIENT_SECRET",
  "NTFY_TOPIC",
  "NTFY_SERVER",
  "NTFY_TOKEN",
  "PUSHOVER_TOKEN",
  "PUSHOVER_USER",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "DISCORD_WEBHOOK_URL",
  "AISSTREAM_API_KEY",
  "FIRMS_MAP_KEY",
  "DASHBOARD_URL",
  "DISABLED_SOURCES",
];

export function envFromProcess(): Env {
  const env: Env = {};
  for (const k of KEYS) if (process.env[k]) env[k] = process.env[k];
  return env;
}
