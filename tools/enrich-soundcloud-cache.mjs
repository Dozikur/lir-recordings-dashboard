import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = await loadEnv(path.join(root, ".env"));
normalizeEnvSecrets();

const cachePath = path.join(root, "data", "cache.json");
const catalog = JSON.parse(await fs.readFile(path.join(root, "data", "catalog.json"), "utf8"));
const publishedCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
const cache = mergeCacheWithCatalog(publishedCache, catalog);
const soundcloudLinks = await loadOptionalJson(path.join(root, "data", "soundcloud-links.json"), {});
const soundcloudProfileUrl = env.SOUNDCLOUD_PROFILE_URL || "https://soundcloud.com/let-it-roll-recordings";

let soundcloudProfileTracksPromise = null;
let soundcloudTokenPromise = null;
let soundcloudWarningLogged = false;

if (!soundcloudConfigured()) {
  throw new Error("Missing SoundCloud credentials. Set SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET in GitHub Secrets.");
}

const tracks = [];
for (const track of cache.tracks || []) {
  tracks.push(await enrichTrack(track));
}

const enriched = {
  ...cache,
  updatedAt: new Date().toISOString(),
  source: `${cache.source || "cache"}+soundcloud`,
  tracks,
  summary: summarize(tracks, cache.summary || {}, catalog),
};

await fs.writeFile(cachePath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      tracks: tracks.length,
      soundcloudMatched: tracks.filter((track) => Number(track.stats?.soundcloudPlays || 0) > 0).length,
      soundcloudTotal: enriched.summary.totals.soundcloudPlays,
    },
    null,
    2
  )
);

async function enrichTrack(track) {
  if (!track?.isrc) return track;
  const soundcloudTrack = await soundcloudTrackOptional(track);
  if (!soundcloudTrack) {
    return {
      ...track,
      stats: {
        ...track.stats,
        soundcloudPlays: Number(track.stats?.soundcloudPlays || 0),
      },
    };
  }

  return {
    ...track,
    soundcloudUrl: soundcloudTrack.permalink_url || "",
    soundcloudTitle: soundcloudTrack.title || "",
    soundcloudUser: soundcloudTrack.user?.username || "",
    stats: {
      ...track.stats,
      soundcloudPlays: Number(soundcloudTrack.playback_count || 0),
    },
  };
}

async function soundcloudTrackOptional(track) {
  try {
    return await soundcloudTrackFor(track);
  } catch (error) {
    if (!soundcloudWarningLogged) {
      console.warn(`SoundCloud enrichment skipped: ${error.message}`);
      soundcloudWarningLogged = true;
    }
    return null;
  }
}

async function soundcloudTrackFor(track) {
  const linked = soundcloudLinks[track.isrc] || soundcloudLinks[track.catalogId];
  if (linked) return soundcloudTrackFromLink(linked);

  const profileMatch = bestSoundcloudMatch(await soundcloudProfileTracks(), track, { minScore: 55, requireArtist: false });
  if (profileMatch) return profileMatch;

  const query = [track.track, track.artist].filter(Boolean).join(" ");
  const candidates = await soundcloudSearch(query);
  return bestSoundcloudMatch(candidates, track, { minScore: 60, requireArtist: true });
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

function bestSoundcloudMatch(candidates, track, options = {}) {
  const minScore = options.minScore ?? 60;
  const trackNeedle = normalize(track.track);
  const artistTokens = normalize(track.artist).split(" ").filter((token) => token.length > 2);
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

function mergeCacheWithCatalog(cache, catalog) {
  const cachedByIsrc = new Map((cache.tracks || []).filter((track) => track.isrc).map((track) => [track.isrc, track]));
  const usedIsrc = new Set();
  const tracks = catalog.tracks.map((catalogTrack) => {
    const cached = catalogTrack.isrc ? cachedByIsrc.get(catalogTrack.isrc) : null;
    if (!cached) {
      return {
        ...catalogTrack,
        ok: false,
        status: catalogTrack.isrc ? "pending" : "needs_isrc",
        stats: {},
        score: 0,
        error: catalogTrack.isrc ? "Ceka na dalsi Soundcharts sync" : "Chybi ISRC",
      };
    }
    usedIsrc.add(catalogTrack.isrc);
    return {
      ...cached,
      ...catalogTrack,
      stats: cached.stats || {},
    };
  });

  for (const cached of cache.tracks || []) {
    if (!cached.isrc || usedIsrc.has(cached.isrc)) continue;
    tracks.push(cached);
  }

  return {
    ...cache,
    tracks,
    summary: summarize(tracks, cache.summary || {}, catalog),
  };
}

function summarize(tracks, previousSummary, catalog) {
  const totals = tracks.reduce(
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
  const synced = tracks.filter((track) => track.ok).length;
  const readyForApi = tracks.filter((track) => track.isrc).length;
  return {
    ...previousSummary,
    releases: catalog?.releases?.length || previousSummary.releases || 0,
    trackRows: tracks.length,
    readyForApi,
    synced,
    needsIsrc: tracks.filter((track) => !track.isrc).length,
    totals,
    averageScore: synced ? Math.round((totals.score / synced) * 10) / 10 : 0,
  };
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

async function loadOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeEnvSecrets() {
  for (const key of ["SOUNDCLOUD_ACCESS_TOKEN", "SOUNDCLOUD_CLIENT_ID", "SOUNDCLOUD_CLIENT_SECRET", "SOUNDCLOUD_PROFILE_URL"]) {
    if (!env[key]) continue;
    env[key] = env[key].trim().replace(/^["']|["']$/g, "");
    const assignmentPrefix = `${key}=`;
    if (env[key].startsWith(assignmentPrefix)) env[key] = env[key].slice(assignmentPrefix.length).trim();
  }
}

function soundcloudConfigured() {
  return Boolean(env.SOUNDCLOUD_ACCESS_TOKEN || (env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
