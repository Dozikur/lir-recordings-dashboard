import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = await loadEnv(path.join(root, ".env"));
normalizeEnvSecrets();
const catalog = JSON.parse(await fs.readFile(path.join(root, "data", "catalog.json"), "utf8"));
const soundcloudLinks = await loadOptionalJson(path.join(root, "data", "soundcloud-links.json"), {});
const soundcloudProfileUrl = env.SOUNDCLOUD_PROFILE_URL || "https://soundcloud.com/let-it-roll-recordings";
let soundcloudProfileTracksPromise = null;
let soundcloudTokenPromise = null;
let soundcloudWarningLogged = false;
assertAuthConfigured();
console.log(
  `Soundcharts auth mode: ${env.SOUNDCHARTS_ACCESS_TOKEN ? "access_token" : "legacy_headers"}; SoundCloud: ${
    soundcloudConfigured() ? "configured" : "not configured"
  }; app id length: ${
    env.SOUNDCHARTS_APP_ID?.length || 0
  }; api key length: ${env.SOUNDCHARTS_API_KEY?.length || 0}`
);

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

if (cache.summary.readyForApi > 0 && cache.summary.synced === 0) {
  const sampleErrors = tracks
    .filter((track) => track.isrc && !track.ok)
    .slice(0, 5)
    .map((track) => `${track.isrc}: ${track.error || "unknown error"}`)
    .join("; ");
  throw new Error(`Soundcharts sync returned 0/${cache.summary.readyForApi} tracks. Check GitHub Secrets. ${sampleErrors}`);
}

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
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
  return values;
}

async function loadOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchTrack(track) {
  const song = unwrapObject(await soundcharts(`/api/v2.25/song/by-isrc/${encodeURIComponent(track.isrc)}`));
  if (!song?.uuid) throw new Error("Soundcharts nevratil UUID.");

  const encodedUuid = encodeURIComponent(song.uuid);
  const artist = artistNames(song);
  const [spotifyAudience, youtubeStreaming, spotifyPopularity, spotifyPlaylistReach, radioSpins, soundcloudTrack] = await Promise.all([
    soundchartsOptional(`/api/v2/song/${encodedUuid}/audience/spotify?limit=30&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/streaming/youtube?limit=1&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/popularity/spotify?limit=1&sort=desc`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/playlist/reach/spotify?limit=1&sort=desc&type=all`),
    soundchartsOptional(`/api/v2/song/${encodedUuid}/broadcasts?limit=100`),
    soundcloudConfigured() ? soundcloudTrackOptional(track, artist) : Promise.resolve(null),
  ]);

  const stats = {
    ...zeroStats,
    spotifyStreams: latestPlotValue(spotifyAudience),
    youtubeViews: latestPlotValue(youtubeStreaming),
    soundcloudPlays: soundcloudTrack ? Number(soundcloudTrack.playback_count || 0) : 0,
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
    soundcloudUrl: soundcloudTrack?.permalink_url || "",
    soundcloudTitle: soundcloudTrack?.title || "",
    soundcloudUser: soundcloudTrack?.user?.username || "",
    artist,
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

async function soundcloudTrackFor(track, artist) {
  const linked = soundcloudLinks[track.isrc] || soundcloudLinks[track.catalogId];
  if (linked) return soundcloudTrackFromLink(linked);

  const profileMatch = bestSoundcloudMatch(await soundcloudProfileTracks(), track, artist, { minScore: 55, requireArtist: false });
  if (profileMatch) return profileMatch;

  const query = [track.track, artist].filter(Boolean).join(" ");
  const candidates = await soundcloudSearch(query);
  return bestSoundcloudMatch(candidates, track, artist, { minScore: 60, requireArtist: true });
}

async function soundcloudTrackOptional(track, artist) {
  try {
    return await soundcloudTrackFor(track, artist);
  } catch (error) {
    if (!soundcloudWarningLogged) {
      console.warn(`SoundCloud enrichment skipped: ${error.message}`);
      soundcloudWarningLogged = true;
    }
    return null;
  }
}

async function soundcloudTrackFromLink(value) {
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    return soundcloud(`/tracks/${encodeURIComponent(String(value))}`);
  }
  return soundcloud(`/resolve?url=${encodeURIComponent(String(value))}`);
}

async function soundcloudSearch(query) {
  const response = await soundcloud(`/tracks?q=${encodeURIComponent(query)}&limit=10&linked_partitioning=false`);
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.collection)) return response.collection;
  return [];
}

async function soundcloudProfileTracks() {
  soundcloudProfileTracksPromise ||= fetchSoundcloudProfileTracks();
  return soundcloudProfileTracksPromise;
}

async function fetchSoundcloudProfileTracks() {
  const user = await soundcloud(`/resolve?url=${encodeURIComponent(soundcloudProfileUrl)}`);
  if (!user?.id) return [];
  const response = await soundcloud(`/users/${encodeURIComponent(String(user.id))}/tracks?limit=200&linked_partitioning=false`);
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.collection)) return response.collection;
  return [];
}

function bestSoundcloudMatch(candidates, track, artist, options = {}) {
  const minScore = options.minScore ?? 60;
  const trackNeedle = normalize(track.track);
  const artistTokens = normalize(artist).split(" ").filter((token) => token.length > 2);
  const scored = candidates
    .filter((candidate) => candidate?.kind === "track" || candidate?.title)
    .map((candidate) => {
      const title = normalize(candidate.title);
      const user = normalize(candidate.user?.username);
      const description = normalize(candidate.description);
      const permalink = normalize(candidate.permalink_url);
      let artistEvidence = 0;
      let score = 0;
      if (title === trackNeedle) score += 70;
      else if (title.includes(trackNeedle) || trackNeedle.includes(title)) score += 45;
      for (const token of artistTokens) {
        if (title.includes(token)) {
          score += 20;
          artistEvidence += 1;
        }
        if (user.includes(token)) {
          score += 18;
          artistEvidence += 1;
        }
        if (description.includes(token) || permalink.includes(token)) {
          score += 6;
          artistEvidence += 1;
        }
      }
      return { artistEvidence, candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minScore) return null;
  if (options.requireArtist && artistTokens.length && !best.artistEvidence) return null;
  return best.candidate;
}

async function soundcloud(endpoint) {
  const response = await fetch(`https://api.soundcloud.com${endpoint}`, {
    headers: {
      accept: "application/json; charset=utf-8",
      Authorization: `OAuth ${await getSoundcloudAccessToken()}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.error || response.statusText;
    throw new Error(`SoundCloud ${response.status}: ${message}`);
  }
  return body;
}

async function getSoundcloudAccessToken() {
  if (env.SOUNDCLOUD_ACCESS_TOKEN) return env.SOUNDCLOUD_ACCESS_TOKEN;
  soundcloudTokenPromise ||= fetchSoundcloudAccessToken();
  return soundcloudTokenPromise;
}

async function fetchSoundcloudAccessToken() {
  const credentials = Buffer.from(`${env.SOUNDCLOUD_CLIENT_ID}:${env.SOUNDCLOUD_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json; charset=utf-8",
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const message = body?.message || body?.error || response.statusText;
    throw new Error(`SoundCloud token ${response.status}: ${message}`);
  }
  return body.access_token;
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
  for (const key of [
    "SOUNDCHARTS_ACCESS_TOKEN",
    "SOUNDCHARTS_APP_ID",
    "SOUNDCHARTS_API_KEY",
    "SOUNDCLOUD_ACCESS_TOKEN",
    "SOUNDCLOUD_CLIENT_ID",
    "SOUNDCLOUD_CLIENT_SECRET",
  ]) {
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

function soundcloudConfigured() {
  return Boolean(env.SOUNDCLOUD_ACCESS_TOKEN || (env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET));
}

function unwrapObject(response) {
  return response?.object || response?.data || response;
}

function artistNames(song) {
  const artists = song?.mainArtists?.length ? song.mainArtists : song?.artists;
  return Array.isArray(artists) ? artists.map((artist) => artist.name).filter(Boolean).join(", ") : "";
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
