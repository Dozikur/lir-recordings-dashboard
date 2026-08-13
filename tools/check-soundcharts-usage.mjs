import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = await loadEnv(path.join(root, ".env"));
normalizeEnvSecrets();
assertAuthConfigured();

const response = await fetch(`${getBaseUrl()}/api/v2/team/usage`, {
  headers: {
    accept: "application/json",
    ...getAuthHeaders(),
  },
});

const body = await response.json().catch(() => ({}));
const quotaRemaining = response.headers.get("x-quota-remaining");
const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      quotaRemaining: quotaRemaining ? Number(quotaRemaining) : null,
      rateLimitRemaining: rateLimitRemaining ? Number(rateLimitRemaining) : null,
      usage: body,
    },
    null,
    2
  )
);

if (!response.ok) {
  const message = body?.errors?.[0]?.message || body?.message || response.statusText;
  throw new Error(`Soundcharts usage ${response.status}: ${message}`);
}

async function loadEnv(filePath) {
  const values = {};
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
  return values;
}

function getBaseUrl() {
  return (env.SOUNDCHARTS_BASE_URL || "https://customer.api.soundcharts.com").replace(/\/$/, "");
}

function assertAuthConfigured() {
  if (env.SOUNDCHARTS_ACCESS_TOKEN) return;
  if (env.SOUNDCHARTS_APP_ID && env.SOUNDCHARTS_API_KEY) return;
  throw new Error("Missing Soundcharts credentials. Set SOUNDCHARTS_APP_ID and SOUNDCHARTS_API_KEY in GitHub Secrets.");
}

function normalizeEnvSecrets() {
  for (const key of ["SOUNDCHARTS_ACCESS_TOKEN", "SOUNDCHARTS_APP_ID", "SOUNDCHARTS_API_KEY"]) {
    if (!env[key]) continue;
    env[key] = env[key].trim().replace(/^["']|["']$/g, "");
    const assignmentPrefix = `${key}=`;
    if (env[key].startsWith(assignmentPrefix)) env[key] = env[key].slice(assignmentPrefix.length).trim();
  }
}

function getAuthHeaders() {
  if (env.SOUNDCHARTS_ACCESS_TOKEN) return { Authorization: `Bearer ${env.SOUNDCHARTS_ACCESS_TOKEN}` };
  if (env.SOUNDCHARTS_APP_ID && env.SOUNDCHARTS_API_KEY) {
    return {
      "x-app-id": env.SOUNDCHARTS_APP_ID,
      "x-api-key": env.SOUNDCHARTS_API_KEY,
    };
  }
  throw new Error("Chybi Soundcharts credentials v .env.");
}
