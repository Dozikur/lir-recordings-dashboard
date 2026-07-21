const state = {
  catalog: null,
  cache: null,
  external: null,
  config: null,
  auto: false,
  autoTimer: null,
  statusTimer: null,
};

const lirCoverOverrides = {
  LIR027: "https://i1.sndcdn.com/artworks-03P8Cbo4DR68jxFk-yoSTyw-t500x500.jpg",
  GB2LD2610218: "https://i1.sndcdn.com/artworks-03P8Cbo4DR68jxFk-yoSTyw-t500x500.jpg",
  LIR028: "./lir028-redemption.png",
  GB2LD2610309: "./lir028-redemption.png",
  LIR022: "https://i1.sndcdn.com/artworks-XHkUDSGd61O44d3r-CyyMkg-t500x500.jpg",
  GB2LD2610071: "https://i1.sndcdn.com/artworks-XHkUDSGd61O44d3r-CyyMkg-t500x500.jpg",
  LIR021: "https://i1.sndcdn.com/artworks-dM1gSdmp96mwxKFA-Aw5hhg-t500x500.jpg",
  GB2LD2610061: "https://i1.sndcdn.com/artworks-dM1gSdmp96mwxKFA-Aw5hhg-t500x500.jpg",
  LIR023: "https://i1.sndcdn.com/artworks-wgAsvBRzyooRF65z-O64z2Q-t500x500.jpg",
  GB2LD2610129: "https://i1.sndcdn.com/artworks-wgAsvBRzyooRF65z-O64z2Q-t500x500.jpg",
  LIREP025: "https://i1.sndcdn.com/artworks-zul8tfk1qUnmjGbT-6qgX6w-t500x500.png",
  GB2LD2610145: "https://i1.sndcdn.com/artworks-zul8tfk1qUnmjGbT-6qgX6w-t500x500.png",
  GB2LD2610146: "https://i1.sndcdn.com/artworks-zul8tfk1qUnmjGbT-6qgX6w-t500x500.png",
  GB2LD2610147: "https://i1.sndcdn.com/artworks-zul8tfk1qUnmjGbT-6qgX6w-t500x500.png",
};

const els = {
  syncLine: document.querySelector("#syncLine"),
  syncButton: document.querySelector("#syncButton"),
  autoButton: document.querySelector("#autoButton"),
  authBanner: document.querySelector("#authBanner"),
  releaseCount: document.querySelector("#releaseCount"),
  readyCount: document.querySelector("#readyCount"),
  syncedCount: document.querySelector("#syncedCount"),
  trackRows: document.querySelector("#trackRows"),
  sortSelect: document.querySelector("#sortSelect"),
  topScoreList: document.querySelector("#topScoreList"),
  spotifyTotal: document.querySelector("#spotifyTotal"),
  youtubeTotal: document.querySelector("#youtubeTotal"),
  soundcloudTotal: document.querySelector("#soundcloudTotal"),
  playlistTotal: document.querySelector("#playlistTotal"),
  radioTotal: document.querySelector("#radioTotal"),
  releaseList: document.querySelector("#releaseList"),
  heroCover: document.querySelector("#heroCover"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  heroSpotify: document.querySelector("#heroSpotify"),
  heroYoutube: document.querySelector("#heroYoutube"),
  heroSoundcloud: document.querySelector("#heroSoundcloud"),
  heroPlaylist: document.querySelector("#heroPlaylist"),
  topTracksPeriod: document.querySelector("#topTracksPeriod"),
  trendingPeriod: document.querySelector("#trendingPeriod"),
  playlistPeriod: document.querySelector("#playlistPeriod"),
  topTracksList: document.querySelector("#topTracksList"),
  trendingTracksList: document.querySelector("#trendingTracksList"),
  playlistSourcesList: document.querySelector("#playlistSourcesList"),
};

els.syncButton.addEventListener("click", syncNow);
els.autoButton.addEventListener("click", toggleAuto);
els.sortSelect.addEventListener("change", render);

await boot();

async function boot() {
  await refreshAll();
  if (!state.config?.staticMode) state.statusTimer = window.setInterval(refreshStatus, 2500);
  window.setInterval(refreshCache, 60000);
}

async function refreshAll() {
  const apiConfig = await getJson("/api/config").catch(() => null);
  const externalPromise = getJson(staticDataUrl("data/external-insights.json")).catch(() => null);
  const [catalog, cache, external] = apiConfig
    ? await Promise.all([getJson("/api/catalog"), getJson("/api/cache"), externalPromise])
    : await Promise.all([getJson("data/catalog.json"), getJson(staticDataUrl("data/cache.json")).catch(() => null), externalPromise]);
  state.config =
    apiConfig ||
    {
      authConfigured: true,
      authMode: "github_pages",
      staticMode: true,
      updatedAt: cache?.updatedAt || null,
      running: false,
    };
  state.catalog = catalog;
  state.cache = withFallbackCache(cache, catalog);
  state.external = external;
  if (state.config.staticMode) {
    els.syncButton.disabled = false;
    els.syncButton.querySelector("span:last-child").textContent = "Update data";
    els.autoButton.disabled = true;
  }
  render();
}

async function refreshCache() {
  const cacheUrl = state.config?.staticMode ? staticDataUrl("data/cache.json") : "/api/cache";
  state.cache = withFallbackCache(await getJson(cacheUrl), state.catalog);
  render();
}

function staticDataUrl(path) {
  return `${path}?v=${Date.now()}`;
}

async function refreshStatus() {
  if (state.config?.staticMode) return;
  const status = await getJson("/api/sync/status");
  const config = await getJson("/api/config");
  state.config = config;
  renderStatus(status);
  if (!status.running && els.syncButton.disabled) {
    els.syncButton.disabled = false;
    await refreshCache();
  }
}

async function syncNow() {
  if (state.config?.staticMode) {
    window.open("https://github.com/Dozikur/lir-recordings-dashboard/actions/workflows/dashboard-pages.yml", "_blank");
    return;
  }
  els.syncButton.disabled = true;
  const response = await fetch("/api/sync", { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    els.syncButton.disabled = false;
    showBanner(body.message || body.error || "Synchronizaci se nepodarilo spustit.", true);
  }
}

function toggleAuto() {
  if (state.config?.staticMode) return;
  state.auto = !state.auto;
  els.autoButton.classList.toggle("primary", state.auto);
  if (state.auto) {
    syncNow();
    state.autoTimer = window.setInterval(syncNow, 30 * 60 * 1000);
  } else {
    window.clearInterval(state.autoTimer);
  }
}

function render() {
  if (!state.catalog || !state.cache) return;
  const summary = state.cache.summary || summarizeLocal(state.cache.tracks, state.catalog.releases);
  renderBanner();
  renderSummary(summary);
  renderHero(state.cache.tracks);
  renderRows(state.cache.tracks);
  renderTotals(summary.totals || {});
  renderTopScore(state.cache.tracks);
  renderExternalInsights(state.external, state.cache.tracks);
  renderReleases();
}

function renderBanner() {
  els.authBanner.className = "banner hidden";
  els.authBanner.textContent = "";

  if (state.config?.staticMode) {
    return;
  }

  if (!state.config?.authConfigured) {
    els.authBanner.className = "banner";
    els.authBanner.textContent = "Datovy zdroj neni pripraveny. Dashboard zatim zobrazuje posledni ulozeny snapshot.";
    return;
  }
  if (state.cache?.source === "empty" || !state.cache?.updatedAt) {
    els.authBanner.className = "banner";
    els.authBanner.textContent = "Zatim neni ulozeny zadny snapshot. Spust rucni aktualizaci dat.";
  }
}

function showBanner(message, isError = false) {
  els.authBanner.className = isError ? "banner error" : "banner";
  els.authBanner.textContent = message;
}

function renderSummary(summary) {
  els.releaseCount.textContent = number(summary.releases);
  els.readyCount.textContent = number(summary.readyForApi);
  els.syncedCount.textContent = number(summary.synced);
  const updated = state.cache?.updatedAt ? formatDateTime(state.cache.updatedAt) : "bez ulozeneho snapshotu";
  els.syncLine.textContent = `Last updated: ${updated} / manual refresh`;
}

function renderRows(inputTracks) {
  const tracks = sortTracks([...inputTracks]);
  els.trackRows.innerHTML = tracks
    .map((track) => {
      const stats = track.stats || {};
      const isMissing = !track.isrc;
      const status = isMissing ? "missing" : track.ok ? "" : track.status === "pending" ? "pending" : "error";
      const isrc = isMissing
        ? '<span class="pill missing">chybi ISRC</span>'
        : `<span class="pill ${status}">${escapeHtml(track.isrc)}</span>`;
      const coverUrl = coverForTrack(track);
      const cover = coverUrl
        ? `<img class="track-cover" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" />`
        : '<span class="track-cover track-cover-fallback"></span>';
      return `<tr>
        <td>${escapeHtml(track.catalogId || "")}</td>
        <td title="${escapeHtml(track.release || "")}">
          <div class="track-cell">${cover}<span>${escapeHtml(track.track || "")}</span></div>
        </td>
        <td>${isrc}</td>
        <td title="${escapeHtml(track.label || "")}">${escapeHtml(track.artist || "")}</td>
        <td class="num">${number(stats.spotifyStreams)}</td>
        <td class="num">${number(stats.youtubeViews)}</td>
        <td class="num">${number(stats.soundcloudPlays)}</td>
        <td class="num">${number(stats.playlistReach)}</td>
        <td class="num">${number(stats.radioSpins)}</td>
        <td class="num"><strong>${decimal(track.score || 0)}</strong></td>
      </tr>`;
    })
    .join("");
}

function renderHero(tracks) {
  const top = [...tracks]
    .filter((track) => track.ok)
    .sort((a, b) => (streamTotal(b) || b.score || 0) - (streamTotal(a) || a.score || 0))[0];
  if (!top) return;

  const coverUrl = coverForTrack(top);
  if (coverUrl) {
    els.heroCover.innerHTML = `<img src="${escapeHtml(coverUrl)}" alt="" />`;
  } else {
    els.heroCover.textContent = top.catalogId || "LIR";
  }
  els.heroTitle.textContent = top.track || top.release || "Top track";
  els.heroMeta.textContent = `${top.artist || "Unknown artist"} / ${top.catalogId || ""}`;
  els.heroSpotify.textContent = number(top.stats?.spotifyStreams);
  els.heroYoutube.textContent = number(top.stats?.youtubeViews);
  els.heroSoundcloud.textContent = number(top.stats?.soundcloudPlays);
  els.heroPlaylist.textContent = number(top.stats?.playlistReach);
}

function coverForTrack(track) {
  return lirCoverOverrides[track.isrc] || lirCoverOverrides[track.catalogId] || track.imageUrl || "";
}

function sortTracks(tracks) {
  const sort = els.sortSelect.value;
  if (sort === "streams") {
    return tracks.sort((a, b) => streamTotal(b) - streamTotal(a));
  }
  if (sort === "catalog") {
    return tracks.sort((a, b) => String(a.catalogId).localeCompare(String(b.catalogId)));
  }
  if (sort === "missing") {
    return tracks.sort((a, b) => Number(!b.isrc) - Number(!a.isrc));
  }
  return tracks.sort((a, b) => (b.score || 0) - (a.score || 0));
}

function streamTotal(track) {
  const stats = track.stats || {};
  return (stats.spotifyStreams || 0) + (stats.youtubeViews || 0) + (stats.soundcloudPlays || 0);
}

function renderTotals(totals) {
  els.spotifyTotal.textContent = number(totals.spotifyStreams);
  els.youtubeTotal.textContent = number(totals.youtubeViews);
  els.soundcloudTotal.textContent = number(totals.soundcloudPlays);
  els.playlistTotal.textContent = number(totals.playlistReach);
  els.radioTotal.textContent = number(totals.radioSpins);
}

function renderTopScore(tracks) {
  const top = tracks
    .filter((track) => track.isrc)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 7);

  if (!top.length) {
    els.topScoreList.innerHTML = `<div class="empty-state">Zatim nejsou zadna track data.</div>`;
    return;
  }

  els.topScoreList.innerHTML = `${top
    .map((track, index) => {
      const score = Math.max(0, Math.min(100, track.score || 0));
      const coverUrl = coverForTrack(track);
      const cover = coverUrl
        ? `<img class="score-cover" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" />`
        : '<span class="score-cover score-cover-fallback"></span>';
      return `<div class="score-row">
        <span class="rank">${number(index + 1)}</span>
        ${cover}
        <div class="score-copy">
          <strong>${escapeHtml(track.track || "")}</strong>
          <span>${escapeHtml(track.artist || track.release || "")}</span>
          <div class="score-bar" aria-hidden="true"><span style="width: ${score}%"></span></div>
        </div>
        <strong class="score-value">${decimal(score)}</strong>
      </div>`;
    })
    .join("")}
    <div class="score-axis"><span>0</span><span>100</span></div>`;
}

function renderReleases() {
  const tracksByRelease = new Map();
  for (const track of state.cache.tracks || []) {
    if (!tracksByRelease.has(track.catalogId)) tracksByRelease.set(track.catalogId, []);
    tracksByRelease.get(track.catalogId).push(track);
  }

  els.releaseList.innerHTML = state.catalog.releases
    .map((release) => {
      const label = release.status === "verified" ? "ISRC OK" : release.status === "needs_isrc" ? "vice tracku" : "overit";
      const releaseTracks = tracksByRelease.get(release.catalogId) || [];
      const cover = lirCoverOverrides[release.catalogId] || coverForTrack(releaseTracks.find((track) => coverForTrack(track)) || {}) || "";
      const releaseScore = releaseTracks.reduce((sum, track) => sum + Number(track.score || 0), 0);
      const spotify = releaseTracks.reduce((sum, track) => sum + Number(track.stats?.spotifyStreams || 0), 0);
      const coverHtml = cover
        ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" />`
        : `<span class="cover-fallback">${escapeHtml(release.catalogId.slice(0, 3))}</span>`;
      return `<div class="release-card">
        <div class="release-cover">${coverHtml}</div>
        <div class="release-copy">
          <span>${escapeHtml(release.catalogId)}</span>
          <strong>${escapeHtml(release.release)}</strong>
          <small>${number(spotify)} Spotify · score ${decimal(releaseScore)}</small>
        </div>
        <em>${label}</em>
      </div>`;
    })
    .join("");
}

function renderExternalInsights(external, tracks) {
  const period = external?.period || "Last 30 days";
  els.topTracksPeriod.textContent = period;
  els.trendingPeriod.textContent = period;
  els.playlistPeriod.textContent = period;
  renderExternalTrackList(els.topTracksList, external?.topTracks || [], tracks);
  renderExternalTrackList(els.trendingTracksList, external?.trendingTracks || [], tracks);
  renderPlaylistSources(external?.playlistSources || []);
}

function renderExternalTrackList(target, rows, tracks) {
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">Ceka na rucni import dat.</div>`;
    return;
  }

  target.innerHTML = rows
    .slice(0, 10)
    .map((row) => {
      const matchedTrack = findTrackMatch(row, tracks);
      const coverUrl = coverForTrack(matchedTrack || {});
      const trendClass = Number(row.changePercent || 0) >= 0 ? "positive" : "negative";
      const cover = coverUrl
        ? `<img class="mini-cover" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" />`
        : '<span class="mini-cover mini-cover-fallback"></span>';
      return `<div class="mini-row">
        <span class="rank">${number(row.rank)}</span>
        ${cover}
        <div class="mini-copy">
          <strong>${escapeHtml(row.track || "")}</strong>
          <span>${escapeHtml(row.artist || row.release || "")}</span>
        </div>
        <div class="mini-value">
          <strong>${number(row.streams)}</strong>
          <span class="${trendClass}">${signedDecimal(row.changePercent)} %</span>
        </div>
      </div>`;
    })
    .join("");
}

function renderPlaylistSources(rows) {
  if (!rows.length) {
    els.playlistSourcesList.innerHTML = `<div class="empty-state">Ceka na rucni import playlist dat.</div>`;
    return;
  }

  els.playlistSourcesList.innerHTML = rows
    .slice(0, 10)
    .map(
      (row) => `<div class="playlist-row">
        <span class="rank">${number(row.rank)}</span>
        <div class="mini-copy">
          <strong>${escapeHtml(row.playlist || "")}</strong>
          <span>${number(row.followers)} followers / ${number(row.playedTracks)} played</span>
        </div>
        <div class="mini-value">
          <strong>${number(row.streams)}</strong>
          <span>streams</span>
        </div>
      </div>`
    )
    .join("");
}

function findTrackMatch(row, tracks) {
  const rowTrack = normalize(row.track);
  const rowRelease = normalize(row.release);
  return tracks.find((track) => normalize(track.track) === rowTrack) || tracks.find((track) => normalize(track.release) === rowRelease);
}

function renderStatus(status) {
  if (status.running) {
    els.syncButton.disabled = true;
  } else {
    if (!state.config?.running) els.syncButton.disabled = false;
  }
}

function withFallbackCache(cache, catalog) {
  if (cache?.tracks?.length) return mergeCacheWithCatalog(cache, catalog);
  const tracks = catalog.tracks.map((track) => ({
    ...track,
    ok: false,
    stats: {},
    score: 0,
  }));
  return {
    updatedAt: null,
    source: "empty",
    tracks,
    summary: summarizeLocal(tracks, catalog.releases),
  };
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
        error: catalogTrack.isrc ? "Ceka na dalsi API sync" : "Chybi ISRC",
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
    summary: summarizeLocal(tracks, catalog.releases),
  };
}

function summarizeLocal(tracks, releases) {
  const ready = tracks.filter((track) => track.isrc);
  const synced = ready.filter((track) => track.ok);
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
  return {
    releases: releases.length,
    trackRows: tracks.length,
    readyForApi: ready.length,
    synced: synced.length,
    needsIsrc: tracks.filter((track) => !track.isrc).length,
    totals,
  };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function number(value) {
  return Math.round(Number(value || 0)).toLocaleString("cs-CZ");
}

function decimal(value) {
  return Number(value || 0).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function signedDecimal(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${decimal(numeric)}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" });
}

function trim(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

