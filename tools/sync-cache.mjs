import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = await loadEnv(path.join(root, ".env"));
const catalog = JSON.parse(await fs.readFile(path.join(root, "data", "catalog.json"), "utf8"));

const zeroStats = {
  spotifyStreams: 0,
  youtubeViews: 0,
  soundcloudPlays: 0,
  shazamCount: 0,
  tiktokVideos: 0,
  playlistReach: 0,
  playlistCount: 0,
  radioSpins: 0,
  spotifyPopularity: 0,
  soundchartsScore: 0,
  growth30d: 0,
};

const results = [];
for (const track of catalog.tracks.filter((item) => item.isrc)) {
  try {
    results.push(await fetchTrack(track));
  } catch (error) {
    results.push({
      ...track,
      ok: false,
      error: error.message,
      stats: zeroStats,
      score: 0,
      fetchedAt: new Date().toISOString(),
    });
  }
}

const byIsrc = new Map(results.map((track) => [track.isrc, track]));
const tracks = catalog.tracks.map((track) => {
  if (track.isrc && byIsrc.has(track.isrc)) return byIsrc.get(track.isrc);
  return {
    ...track,
    ok: false,
    status: track.isrc ? "error" : "needs_isrc",
    stats: zeroStats,
    score: 0,
    error: track.isrc ? "Not synced" : "Chybi ISRC",
  };
});

const cache = {
  updatedAt: new Date().toISOString(),
  source: "soundcharts-accessible-endpoints",
  tracks,
  summary: summarize(tracks, catalog.releases),
};

await fs.writeFile(path.join(root, "data", "cache.json"), `${JSON.stringify(cache, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      synced: cache.summary.synced,
      ready: cache.summary.readyForApi,
      tracks: cache.summary.trackRows,
      totals: cache.summary.totals,
      averageScore: cache.summary.averageScore,
    },
    null,
    2
  )
);

async function loadEnv(filePath) {
  const values = {};
  const text = await fs.readFile(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
  return values;
}

async function fetchTrack(track) {
  const song = unwrapObject(await soundcharts(`/api/v2.25/song/by-isrc/${encodeURIComponent(track.isrc)}`));
  if (!song?.uuid) throw new Error("Soundcharts nevratil UUID.");

  const encodedUuid = encodeURIComponent(song.uuid);
  const [spotifyAudience, spotifyPopularity, spotifyPlaylistReach, radioSpins] = await Promise.all([
    soundchartsOptional(`/api/v2/song/${encodedUuid}/audience/spotify?limit=30&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/popularity/spotify?limit=1&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/playlist/reach/spotify?limit=1&sort=desc&type=all`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/broadcasts?limit=100`),
  ]);

  const stats = {
    ...zeroStats,
    spotifyStreams: latestPlotValue(spotifyAudience),
    playlistReach: latestValue(spotifyPlaylistReach, "playlistReach"),
    playlistCount: latestValue(spotifyPlaylistReach, "playlistCount"),
    radioSpins: itemCount(radioSpins),
    spotifyPopularity: latestPlotValue(spotifyPopularity),
    growth30d: growthFromPlots(spotifyAudience),
  };

  return {
    ...track,
    ok: true,
    uuid: song.uuid,
    soundchartsUrl: song.appUrl || "",
    artist: artistNames(song),
    label: Array.isArray(song.labels) ? song.labels.map((label) => label.name).filter(Boolean).join(", ") : "",
    releaseDate: song.releaseDate ? String(song.releaseDate).slice(0, 10) : "",
    imageUrl: song.imageUrl || "",
    stats,
    score: scoreTrack(stats),
    fetchedAt: new Date().toISOString(),
  };
}

async function soundcharts(endpoint) {
  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    headers: {
      accept: "application/json",
      ...getAuthHeaders(),
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

function getBaseUrl() {
  return (env.SOUNDCHARTS_BASE_URL || "https://customer.api.soundcharts.com").replace(/\/$/, "");
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

function unwrapObject(response) {
  return response?.object || response?.data || response;
}

function artistNames(song) {
  const artists = song?.mainArtists?.length ? song.mainArtists : song?.artists;
  return Array.isArray(artists) ? artists.map((artist) => artist.name).filter(Boolean).join(", ") : "";
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

function scoreTrack(stats) {
  const score =
    Math.min(35, (stats.spotifyStreams / 1000000) * 35) +
    Math.min(15, (stats.playlistReach / 500000) * 15) +
    Math.min(5, (stats.playlistCount / 50) * 5) +
    Math.min(10, (stats.radioSpins / 100) * 10) +
    Math.min(5, (stats.spotifyPopularity / 100) * 5) +
    Math.max(0, Math.min(10, stats.growth30d * 10));
  return Math.round(Math.min(100, score) * 10) / 10;
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
