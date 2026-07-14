import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const catalogPath = path.join(dataDir, "catalog.json");
const cachePath = path.join(dataDir, "cache.json");
const envPath = path.join(__dirname, ".env");

let env = {};
await refreshEnv();

const PORT = Number(env.PORT || 5177);

let syncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  progress: 0,
  total: 0,
  message: "Ready",
  errors: [],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/config") {
      return sendJson(res, await getConfigSummary());
    }

    if (url.pathname === "/api/catalog") {
      return sendJson(res, await readCatalog());
    }

    if (url.pathname === "/api/cache") {
      return sendJson(res, await readCache());
    }

    if (url.pathname === "/api/sync" && req.method === "POST") {
      if (syncState.running) {
        return sendJson(res, { ok: false, message: "Synchronizace uz bezi." }, 409);
      }
      runSync().catch((error) => {
        syncState.running = false;
        syncState.finishedAt = new Date().toISOString();
        syncState.message = "Synchronizace spadla.";
        syncState.errors.push(error.message);
      });
      return sendJson(res, { ok: true, message: "Synchronizace spustena." });
    }

    if (url.pathname === "/api/sync/status") {
      return sendJson(res, syncState);
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { ok: false, error: error.message }, 500);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`LIR dashboard running at http://127.0.0.1:${PORT}`);
});

async function loadEnv(filePath, target = {}) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      target[key] = rest.join("=").replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional; dashboard still runs without live API credentials.
  }
  return target;
}

async function refreshEnv() {
  env = {};
  await loadEnv(envPath, env);
  return env;
}

function getBaseUrl() {
  return (env.SOUNDCHARTS_BASE_URL || "https://customer.api.soundcharts.com").replace(/\/$/, "");
}

async function readCatalog() {
  return JSON.parse(await fs.readFile(catalogPath, "utf8"));
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    return {
      updatedAt: null,
      tracks: [],
      summary: null,
      source: "empty",
    };
  }
}

async function writeCache(cache) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

async function getConfigSummary() {
  await refreshEnv();
  const cache = await readCache();
  return {
    authConfigured: hasAuth(),
    authMode: getAuthMode(),
    baseUrl: getBaseUrl(),
    updatedAt: cache.updatedAt,
    running: syncState.running,
  };
}

function hasAuth() {
  return Boolean(
    env.SOUNDCHARTS_ACCESS_TOKEN ||
      (env.SOUNDCHARTS_APP_ID && env.SOUNDCHARTS_API_KEY) ||
      (env.SOUNDCHARTS_CLIENT_ID && env.SOUNDCHARTS_CLIENT_SECRET)
  );
}

function getAuthMode() {
  if (env.SOUNDCHARTS_ACCESS_TOKEN) return "access_token";
  if (env.SOUNDCHARTS_APP_ID && env.SOUNDCHARTS_API_KEY) return "legacy_headers";
  if (env.SOUNDCHARTS_CLIENT_ID && env.SOUNDCHARTS_CLIENT_SECRET) {
    return "client_credentials";
  }
  return "not_configured";
}

async function getAuthHeaders() {
  if (env.SOUNDCHARTS_ACCESS_TOKEN) {
    return { Authorization: `Bearer ${env.SOUNDCHARTS_ACCESS_TOKEN}` };
  }
  if (env.SOUNDCHARTS_APP_ID && env.SOUNDCHARTS_API_KEY) {
    return {
      "x-app-id": env.SOUNDCHARTS_APP_ID,
      "x-api-key": env.SOUNDCHARTS_API_KEY,
    };
  }
  if (env.SOUNDCHARTS_CLIENT_ID && env.SOUNDCHARTS_CLIENT_SECRET) {
    const token = await requestAccessToken();
    return { Authorization: `Bearer ${token}` };
  }
  throw new Error("Chybi Soundcharts credentials v .env.");
}

let tokenCache = { token: null, expiresAt: 0 };
async function requestAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;

  const bodyParams = new URLSearchParams({ grant_type: "client_credentials" });
  if (env.SOUNDCHARTS_TEAM_ID) bodyParams.set("team_id", env.SOUNDCHARTS_TEAM_ID);

  const basicAuth = Buffer.from(`${env.SOUNDCHARTS_CLIENT_ID}:${env.SOUNDCHARTS_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(env.SOUNDCHARTS_TOKEN_URL || "https://account.soundcharts.com/oauth/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: bodyParams,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${body.message || response.statusText}`);
  }
  const token = body.access_token || body.token;
  if (!token) throw new Error("Token endpoint nevratil access_token.");
  tokenCache = {
    token,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
  return token;
}

async function runSync() {
  await refreshEnv();
  const catalog = await readCatalog();
  const tracks = catalog.tracks.filter((track) => track.isrc);
  const previous = await readCache();

  syncState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: 0,
    total: tracks.length,
    message: "Synchronizuji Soundcharts data...",
    errors: [],
  };

  const results = [];
  for (const track of tracks) {
    try {
      const enriched = await fetchTrack(track);
      results.push(enriched);
    } catch (error) {
      results.push({
        ...track,
        ok: false,
        error: error.message,
        stats: {},
        score: 0,
      });
      syncState.errors.push(`${track.isrc}: ${error.message}`);
    }
    syncState.progress += 1;
  }

  const merged = mergeMissingTracks(catalog.tracks, results, previous.tracks || []);
  const cache = {
    updatedAt: new Date().toISOString(),
    source: "soundcharts",
    tracks: merged,
    summary: summarize(merged, catalog.releases),
  };
  await writeCache(cache);

  syncState.running = false;
  syncState.finishedAt = cache.updatedAt;
  syncState.message = "Synchronizace dokoncena.";
}

async function fetchTrack(track) {
  const songResponse = await soundcharts(`/api/v2.25/song/by-isrc/${encodeURIComponent(track.isrc)}`);
  const song = unwrapObject(songResponse);
  const uuid = song?.uuid;
  if (!uuid) throw new Error("Soundcharts nevratil UUID.");

  const stats = await fetchAvailableSongStats(uuid);

  const labels = Array.isArray(song.labels) ? song.labels.map((label) => label.name).filter(Boolean) : [];
  const releaseDate = song.releaseDate ? song.releaseDate.slice(0, 10) : "";

  return {
    ...track,
    ok: true,
    uuid,
    soundchartsUrl: song.appUrl || "",
    artist: artistNames(song),
    label: labels.join(", "),
    releaseDate,
    imageUrl: song.imageUrl || "",
    stats,
    score: scoreTrack(stats),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchAvailableSongStats(uuid) {
  const encodedUuid = encodeURIComponent(uuid);
  const [spotifyAudience, spotifyPopularity, spotifyPlaylistReach, radioSpins] = await Promise.all([
    soundchartsOptional(`/api/v2/song/${encodedUuid}/audience/spotify?limit=30&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/popularity/spotify?limit=1&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/playlist/reach/spotify?limit=1&sort=desc&type=all`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/broadcasts?limit=100`),
  ]);

  return {
    spotifyStreams: latestPlotValue(spotifyAudience),
    youtubeViews: 0,
    soundcloudPlays: 0,
    shazamCount: 0,
    tiktokVideos: 0,
    playlistReach: latestValue(spotifyPlaylistReach, "playlistReach"),
    playlistCount: latestValue(spotifyPlaylistReach, "playlistCount"),
    radioSpins: itemCount(radioSpins),
    spotifyPopularity: latestPlotValue(spotifyPopularity),
    soundchartsScore: 0,
    growth30d: growthFromPlots(spotifyAudience),
  };
}

async function soundcharts(endpoint) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    headers: {
      accept: "application/json",
      ...headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || body?.message || response.statusText;
    throw new Error(`Soundcharts ${response.status}: ${message}`);
  }
  return body;
}

async function soundchartsOptional(endpoint) {
  try {
    return await soundcharts(endpoint);
  } catch (error) {
    return { errors: [{ message: error.message }], items: [] };
  }
}

function unwrapObject(response) {
  return response?.object || response?.data || response;
}

function artistNames(song) {
  const artists = song?.mainArtists?.length ? song.mainArtists : song?.artists;
  return Array.isArray(artists) ? artists.map((artist) => artist.name).filter(Boolean).join(", ") : "";
}

function normalizeStats(raw) {
  const found = {
    spotifyStreams: pickMetric(raw, ["spotify", "stream"]),
    youtubeViews: pickMetric(raw, ["youtube", "view"]),
    soundcloudPlays: pickMetric(raw, ["soundcloud", "play"]),
    shazamCount: pickMetric(raw, ["shazam", "count"]),
    tiktokVideos: pickMetric(raw, ["tiktok", "video"]),
    playlistReach: pickMetric(raw, ["playlist", "reach"]),
    playlistCount: pickMetric(raw, ["playlist", "count"]),
    radioSpins: pickMetric(raw, ["radio", "spin"]),
    spotifyPopularity: pickMetric(raw, ["spotify", "popularity"]),
    soundchartsScore: pickMetric(raw, ["score"]),
    growth30d: pickGrowth(raw),
  };
  return Object.fromEntries(Object.entries(found).map(([key, value]) => [key, Number.isFinite(value) ? value : 0]));
}

function latestPlotValue(response) {
  const item = Array.isArray(response?.items) ? response.items[0] : null;
  const plot = Array.isArray(item?.plots) ? item.plots[0] : null;
  const value = Number(plot?.value);
  return Number.isFinite(value) ? value : 0;
}

function latestValue(response, key) {
  const item = Array.isArray(response?.items) ? response.items[0] : null;
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function itemCount(response) {
  const total = Number(response?.page?.total);
  if (Number.isFinite(total)) return total;
  return Array.isArray(response?.items) ? response.items.length : 0;
}

function growthFromPlots(response) {
  const items = Array.isArray(response?.items) ? response.items : [];
  if (items.length < 2) return 0;
  const newest = latestPlotValue({ items: [items[0]] });
  const oldest = latestPlotValue({ items: [items[items.length - 1]] });
  if (!oldest) return 0;
  return (newest - oldest) / oldest;
}

function pickMetric(raw, keywords) {
  const matches = [];
  walk(raw, [], (pathParts, value) => {
    if (typeof value !== "number") return;
    const haystack = pathParts.join(" ").toLowerCase();
    if (keywords.every((keyword) => haystack.includes(keyword))) matches.push(value);
  });
  return matches.length ? Math.max(...matches) : 0;
}

function pickGrowth(raw) {
  const matches = [];
  walk(raw, [], (pathParts, value) => {
    if (typeof value !== "number") return;
    const haystack = pathParts.join(" ").toLowerCase();
    if (haystack.includes("growth") || haystack.includes("evolution") || haystack.includes("change")) matches.push(value);
  });
  if (!matches.length) return 0;
  const value = matches.find((item) => item > -1 && item < 1) ?? matches[0];
  return value;
}

function walk(value, pathParts, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...pathParts, String(index)], visitor));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walk(child, [...pathParts, key], visitor);
    }
    return;
  }
  visitor(pathParts, value);
}

function scoreTrack(stats) {
  const streamBase = stats.spotifyStreams + stats.youtubeViews + stats.soundcloudPlays;
  const score =
    Math.min(35, (streamBase / 1000000) * 35) +
    Math.min(5, (stats.shazamCount / 10000) * 5) +
    Math.min(5, (stats.tiktokVideos / 10000) * 5) +
    Math.min(15, (stats.playlistReach / 500000) * 15) +
    Math.min(5, (stats.playlistCount / 50) * 5) +
    Math.min(10, (stats.radioSpins / 100) * 10) +
    Math.min(5, (stats.spotifyPopularity / 100) * 5) +
    Math.max(0, Math.min(10, stats.growth30d * 10));
  return Math.round(Math.min(100, score) * 10) / 10;
}

function mergeMissingTracks(catalogTracks, syncedTracks, previousTracks) {
  const byIsrc = new Map();
  for (const track of previousTracks) if (track.isrc) byIsrc.set(track.isrc, track);
  for (const track of syncedTracks) if (track.isrc) byIsrc.set(track.isrc, track);

  return catalogTracks.map((track) => {
    if (!track.isrc) {
      return {
        ...track,
        ok: false,
        status: "needs_isrc",
        stats: {},
        score: 0,
      };
    }
    return byIsrc.get(track.isrc) || { ...track, ok: false, stats: {}, score: 0 };
  });
}

function summarize(tracks, releases) {
  const ready = tracks.filter((track) => track.isrc);
  const synced = ready.filter((track) => track.ok);
  const totals = synced.reduce(
    (sum, track) => {
      const stats = track.stats || {};
      sum.spotifyStreams += stats.spotifyStreams || 0;
      sum.youtubeViews += stats.youtubeViews || 0;
      sum.soundcloudPlays += stats.soundcloudPlays || 0;
      sum.playlistReach += stats.playlistReach || 0;
      sum.radioSpins += stats.radioSpins || 0;
      sum.score += track.score || 0;
      return sum;
    },
    { spotifyStreams: 0, youtubeViews: 0, soundcloudPlays: 0, playlistReach: 0, radioSpins: 0, score: 0 }
  );
  return {
    releases: releases.length,
    trackRows: tracks.length,
    readyForApi: ready.length,
    synced: synced.length,
    needsIsrc: tracks.filter((track) => !track.isrc).length,
    totals,
    averageScore: synced.length ? Math.round((totals.score / synced.length) * 10) / 10 : 0,
  };
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function serveStatic(urlPath, res) {
  const safePath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}
