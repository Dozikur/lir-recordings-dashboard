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
  missingCount: document.querySelector("#missingCount"),
  averageScore: document.querySelector("#averageScore"),
  trackRows: document.querySelector("#trackRows"),
  sortSelect: document.querySelector("#sortSelect"),
  scoreChart: document.querySelector("#scoreChart"),
  spotifyTotal: document.querySelector("#spotifyTotal"),
  youtubeTotal: document.querySelector("#youtubeTotal"),
  soundcloudTotal: document.querySelector("#soundcloudTotal"),
  playlistTotal: document.querySelector("#playlistTotal"),
  radioTotal: document.querySelector("#radioTotal"),
  highlightList: document.querySelector("#highlightList"),
  releaseList: document.querySelector("#releaseList"),
  heroCover: document.querySelector("#heroCover"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  heroSpotify: document.querySelector("#heroSpotify"),
  heroPlaylist: document.querySelector("#heroPlaylist"),
  heroScore: document.querySelector("#heroScore"),
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
  renderChart(state.cache.tracks);
  renderHighlights(summary, state.cache.tracks);
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
  const totalTracks = state.cache?.tracks?.length || summary.readyForApi || 0;
  const isrcCoverage = totalTracks ? ((totalTracks - summary.needsIsrc) / totalTracks) * 100 : 0;
  els.missingCount.textContent = `${decimal(isrcCoverage)} %`;
  els.averageScore.textContent = decimal(summary.averageScore);
  const updated = state.cache?.updatedAt ? formatDateTime(state.cache.updatedAt) : "bez ulozeneho snapshotu";
  els.syncLine.textContent = `Last updated: ${updated} / manual refresh`;
}

function renderRows(inputTracks) {
  const tracks = sortTracks([...inputTracks]);
  els.trackRows.innerHTML = tracks
    .map((track) => {
      const stats = track.stats || {};
      const isMissing = !track.isrc;
      const status = isMissing ? "missing" : track.ok ? "" : "error";
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
  els.heroPlaylist.textContent = number(top.stats?.playlistReach);
  els.heroScore.textContent = decimal(top.score || 0);
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

function renderChart(tracks) {
  const canvas = els.scoreChart;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(520, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(320 * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, 320);

  const top = tracks
    .filter((track) => track.isrc)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 7);

  const width = rect.width;
  const height = 320;
  const left = 132;
  const right = 18;
  const topPad = 24;
  const row = 35;
  const maxBar = width - left - right;

  ctx.font = "12px Aptos, Arial";
  ctx.fillStyle = "#a8b9dc";
  ctx.fillText("0", left, height - 20);
  ctx.fillText("100", width - right - 24, height - 20);

  if (!top.length) {
    ctx.fillStyle = "#a8b9dc";
    ctx.fillText("Zatim nejsou zadna track data.", 18, 40);
    return;
  }

  top.forEach((track, index) => {
    const y = topPad + index * row;
    const score = Math.max(0, Math.min(100, track.score || 0));
    ctx.fillStyle = "#c8d7f7";
    ctx.fillText(trim(track.track, 18), 14, y + 17);
    ctx.fillStyle = "rgba(200, 215, 247, 0.18)";
    roundRect(ctx, left, y, maxBar, 18, 4);
    ctx.fill();
    ctx.fillStyle = score > 0 ? "#26d2b4" : "#7890bf";
    roundRect(ctx, left, y, (score / 100) * maxBar, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#f7fbff";
    ctx.fillText(decimal(score), left + Math.min(maxBar - 30, (score / 100) * maxBar + 8), y + 14);
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
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

function renderHighlights(summary, tracks) {
  if (!els.highlightList) return;
  const topSpotify = [...tracks].sort((a, b) => (b.stats?.spotifyStreams || 0) - (a.stats?.spotifyStreams || 0))[0];
  const topPlaylist = [...tracks].sort((a, b) => (b.stats?.playlistReach || 0) - (a.stats?.playlistReach || 0))[0];
  const activeTracks = tracks.filter((track) => track.ok).length;
  const highlights = [
    {
      label: "Catalog coverage",
      value: `${number(activeTracks)} / ${number(tracks.length)} tracks`,
      detail: `${number(summary.releases)} releasu v reportu`,
    },
    {
      label: "Spotify leader",
      value: topSpotify?.track || "N/A",
      detail: `${number(topSpotify?.stats?.spotifyStreams)} streams`,
    },
    {
      label: "Playlist reach leader",
      value: topPlaylist?.track || "N/A",
      detail: `${number(topPlaylist?.stats?.playlistReach)} reach`,
    },
  ];
  els.highlightList.innerHTML = highlights
    .map(
      (item) => `<div class="highlight-item">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>`
    )
    .join("");
}

function renderStatus(status) {
  if (status.running) {
    els.syncButton.disabled = true;
  } else {
    if (!state.config?.running) els.syncButton.disabled = false;
  }
}

function withFallbackCache(cache, catalog) {
  if (cache?.tracks?.length) return cache;
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
    averageScore: synced.length ? totals.score / synced.length : 0,
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

