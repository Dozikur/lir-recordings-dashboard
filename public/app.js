const state = {
  catalog: null,
  cache: null,
  config: null,
  auto: false,
  autoTimer: null,
  statusTimer: null,
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
  progressBar: document.querySelector("#progressBar"),
  syncLog: document.querySelector("#syncLog"),
  releaseList: document.querySelector("#releaseList"),
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
  const [catalog, cache] = apiConfig
    ? await Promise.all([getJson("/api/catalog"), getJson("/api/cache")])
    : await Promise.all([getJson("data/catalog.json"), getJson("data/cache.json").catch(() => null)]);
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
  if (state.config.staticMode) {
    els.syncButton.disabled = false;
    els.syncButton.querySelector("span:last-child").textContent = "Spustit update";
    els.autoButton.disabled = true;
  }
  render();
}

async function refreshCache() {
  const cacheUrl = state.config?.staticMode ? `data/cache.json?ts=${Date.now()}` : "/api/cache";
  state.cache = withFallbackCache(await getJson(cacheUrl), state.catalog);
  render();
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
    clearLog();
    appendLog("Oteviram GitHub Actions. Tam klikni na Run workflow.");
    window.open("https://github.com/Dozikur/lir-recordings-dashboard/actions/workflows/dashboard-pages.yml", "_blank");
    return;
  }
  els.syncButton.disabled = true;
  clearLog();
  appendLog("Synchronizace spustena.");
  const response = await fetch("/api/sync", { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    els.syncButton.disabled = false;
    appendLog(body.message || body.error || "Synchronizaci se nepodarilo spustit.");
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
  renderRows(state.cache.tracks);
  renderTotals(summary.totals || {});
  renderChart(state.cache.tracks);
  renderReleases();
}

function renderBanner() {
  els.authBanner.className = "banner hidden";
  els.authBanner.textContent = "";

  if (state.config?.staticMode) {
    els.authBanner.className = "banner";
    els.authBanner.textContent = "Staticky dashboard z GitHub Pages. Data se obnovuji pres GitHub Actions.";
    return;
  }

  if (!state.config?.authConfigured) {
    els.authBanner.className = "banner";
    els.authBanner.textContent =
      "Soundcharts prihlaseni neni nastavene. Dopln .env podle .env.example a restartuj dashboard.";
    return;
  }
  if (state.cache?.source === "empty" || !state.cache?.updatedAt) {
    els.authBanner.className = "banner";
    els.authBanner.textContent = "Credentials jsou nastavene. Klikni na Aktualizovat pro prvni synchronizaci.";
  }
}

function renderSummary(summary) {
  els.releaseCount.textContent = number(summary.releases);
  els.readyCount.textContent = number(summary.readyForApi);
  els.syncedCount.textContent = number(summary.synced);
  els.missingCount.textContent = number(summary.needsIsrc);
  els.averageScore.textContent = decimal(summary.averageScore);
  const updated = state.cache?.updatedAt ? formatDateTime(state.cache.updatedAt) : "zatim bez synchronizace";
  const auth = state.config?.authMode === "not_configured" ? "bez API" : state.config?.authMode;
  els.syncLine.textContent = `Stav: ${auth} · posledni update: ${updated}`;
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
      return `<tr>
        <td>${escapeHtml(track.catalogId || "")}</td>
        <td title="${escapeHtml(track.release || "")}">${escapeHtml(track.track || "")}</td>
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
  ctx.fillStyle = "#64748b";
  ctx.fillText("0", left, height - 20);
  ctx.fillText("100", width - right - 24, height - 20);

  if (!top.length) {
    ctx.fillStyle = "#64748b";
    ctx.fillText("Zatim nejsou zadna track data.", 18, 40);
    return;
  }

  top.forEach((track, index) => {
    const y = topPad + index * row;
    const score = Math.max(0, Math.min(100, track.score || 0));
    ctx.fillStyle = "#1f2937";
    ctx.fillText(trim(track.track, 18), 14, y + 17);
    ctx.fillStyle = "#e8f1f7";
    roundRect(ctx, left, y, maxBar, 18, 4);
    ctx.fill();
    ctx.fillStyle = score > 0 ? "#0f766e" : "#b7c2cf";
    roundRect(ctx, left, y, (score / 100) * maxBar, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#1f2937";
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
  els.releaseList.innerHTML = state.catalog.releases
    .map((release) => {
      const label = release.status === "verified" ? "ISRC OK" : release.status === "needs_isrc" ? "vice tracku" : "overit";
      return `<div>
        <span>${escapeHtml(release.catalogId)} · ${escapeHtml(release.release)}</span>
        <strong>${label}</strong>
      </div>`;
    })
    .join("");
}

function renderStatus(status) {
  const percent = status.total ? Math.round((status.progress / status.total) * 100) : 0;
  els.progressBar.style.width = `${percent}%`;
  if (status.running) {
    els.syncButton.disabled = true;
    setLog([`${status.message} ${status.progress}/${status.total}`, ...status.errors.slice(-4)]);
  } else {
    if (!state.config?.running) els.syncButton.disabled = false;
    if (status.finishedAt) setLog([status.message, ...status.errors.slice(-4)]);
  }
}

function clearLog() {
  els.syncLog.innerHTML = "";
}

function appendLog(message) {
  const li = document.createElement("li");
  li.textContent = message;
  els.syncLog.prepend(li);
}

function setLog(messages) {
  els.syncLog.innerHTML = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
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

function formatDateTime(value) {
  return new Date(value).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" });
}

function trim(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
