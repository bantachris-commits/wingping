import {
  DEFAULT_SETTINGS, mapUrl, atcUrl, formatAlt, formatAltBoth, distanceNm,
  CATEGORY_MATCHERS, alertColor
} from "./shared/classify.js";
import { startRadar } from "./shared/radar.js";

const list = document.getElementById("list");
const meta = document.getElementById("meta");
const err = document.getElementById("err");
const radarWrap = document.getElementById("radarWrap");
const radarBtn = document.getElementById("radarBtn");
const canvas = document.getElementById("radar");

let settings = { ...DEFAULT_SETTINGS };
let snapshot = [];
let radarOn = false;
let stopRadar = null;

function openMapFor(hex) {
  const url = mapUrl(hex, settings);
  chrome.tabs.create({ url: url.startsWith("http") ? url : chrome.runtime.getURL(url) });
}

document.getElementById("options").addEventListener("click", e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
document.getElementById("refresh").addEventListener("click", async () => {
  meta.textContent = "Refreshing…";
  try { await chrome.runtime.sendMessage("wingping-refresh"); } catch { /* worker waking up */ }
  render();
});
document.getElementById("atc").addEventListener("click", e => {
  e.preventDefault();
  chrome.tabs.create({ url: atcUrl(settings.nearestAirport) });
});

// --- mini map panel (opens in the popup, like the radar) ------------------------

const mapWrap = document.getElementById("mapWrap");
const mapBtn = document.getElementById("mapBtn");
let mapOn = false;
let mini = null, miniBase = null, miniRing = null, miniHome = null;
const miniMarkers = new Map();

const TILE_LAYERS = {
  satellite: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "© Esri"],
  streets:   ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OSM"],
  dark:      ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "© OSM · CARTO"]
};

function initMiniMap() {
  mini = L.map("miniMap", { zoomControl: false, attributionControl: false });
  const [url] = TILE_LAYERS[settings.mapLayer] || TILE_LAYERS.satellite;
  miniBase = L.tileLayer(url, { maxZoom: 19 }).addTo(mini);
  mini.setView([settings.lat, settings.lon], 10);
}

function updateMiniMap() {
  if (!mini) return;
  const pos = [settings.lat, settings.lon];
  if (!miniHome) miniHome = L.circleMarker(pos, { radius: 4, color: "#93b4f8", fillColor: "#93b4f8", fillOpacity: 1 }).addTo(mini);
  else miniHome.setLatLng(pos);
  if (!miniRing) miniRing = L.circle(pos, { radius: settings.radiusNm * 1852, color: "#60a5fa", weight: 1, dashArray: "4 5", fill: false }).addTo(mini);
  else { miniRing.setLatLng(pos); miniRing.setRadius(settings.radiusNm * 1852); }

  const seen = new Set();
  for (const ac of snapshot) {
    if (typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    seen.add(ac.hex);
    const color = alertColor(ac.match);
    let mk = miniMarkers.get(ac.hex);
    if (!mk) {
      mk = L.circleMarker([ac.lat, ac.lon], { radius: 5, color, fillColor: color, fillOpacity: .95, weight: 1.5 })
        .addTo(mini)
        .bindTooltip(() => `${ac.flight || ac.r || ac.hex.toUpperCase()} · ${ac.t || "?"} · ${formatAltBoth(ac, settings)}`,
                     { direction: "top", offset: [0, -6] });
      mk.on("click", () => openMapFor(ac.hex));
      miniMarkers.set(ac.hex, mk);
    } else {
      mk.setLatLng([ac.lat, ac.lon]);
      mk.setStyle({ color, fillColor: color });
    }
  }
  for (const [hex, mk] of miniMarkers) {
    if (!seen.has(hex)) { mini.removeLayer(mk); miniMarkers.delete(hex); }
  }
}

mapBtn.addEventListener("click", () => {
  mapOn = !mapOn;
  mapWrap.classList.toggle("open", mapOn);
  mapBtn.classList.toggle("toggled", mapOn);
  if (mapOn) {
    if (radarOn) radarBtn.click();
    if (!mini) initMiniMap();
    setTimeout(() => { mini.invalidateSize(); updateMiniMap(); }, 60);
  }
});

document.getElementById("expandMap").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("map.html") });
});

radarBtn.addEventListener("click", () => {
  radarOn = !radarOn;
  radarWrap.classList.toggle("open", radarOn);
  radarBtn.classList.toggle("toggled", radarOn);
  if (radarOn) {
    if (mapOn) mapBtn.click();
    stopRadar = startRadar(canvas, () => ({ snapshot, settings }), openMapFor);
  } else if (stopRadar) { stopRadar(); stopRadar = null; }
});

async function getSettings() {
  const { settings: s } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...s,
    categories: { ...DEFAULT_SETTINGS.categories, ...(s?.categories || {}) } };
}

function badge(cls, text) {
  const b = document.createElement("span");
  b.className = `badge b-${cls}`;
  b.textContent = text;
  return b;
}

async function render() {
  settings = await getSettings();
  const sess = await chrome.storage.session.get(["snapshot", "lastPoll", "lastError", "lastSource"]);
  snapshot = sess.snapshot || [];
  const { lastPoll, lastError, lastSource } = sess;

  err.hidden = !lastError;
  if (lastError) err.textContent = `⚠ ${lastError}`;

  const excluded = snapshot.filter(a => a.match?.excluded);
  const visible = snapshot.filter(a => !a.match?.excluded);

  const when = lastPoll ? new Date(lastPoll).toLocaleTimeString() : "never";
  meta.innerHTML = "";
  meta.append(`${visible.length} aircraft within ${settings.radiusNm} NM`);
  if (excluded.length) {
    const s = document.createElement("span");
    s.className = "excl";
    s.textContent = ` · ${excluded.length} excluded`;
    s.title = excluded.map(a => `${a.flight || a.r || a.hex} (${a.match.excluded})`).join("\n");
    meta.append(s);
  }
  meta.append(` · updated ${when}` + (lastSource ? ` · ${lastSource}` : ""));

  // Alerts first, then by distance.
  const rows = [...visible].sort((a, b) => {
    const am = a.match ? 0 : 1, bm = b.match ? 0 : 1;
    if (am !== bm) return am - bm;
    return (distanceNm(a, settings.lat, settings.lon) ?? 999) -
           (distanceNm(b, settings.lat, settings.lon) ?? 999);
  });

  list.replaceChildren();
  if (!rows.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Nothing overhead right now.";
    list.append(d);
    return;
  }

  for (const ac of rows) {
    const li = document.createElement("li");
    li.title = "Open live flight path";
    li.addEventListener("click", () => openMapFor(ac.hex));

    const grow = document.createElement("div");
    grow.className = "grow";
    const id = document.createElement("div");
    id.className = "id";
    id.textContent = ac.flight || ac.r || ac.hex.toUpperCase();
    const sub = document.createElement("div");
    sub.className = "sub";
    const dist = distanceNm(ac, settings.lat, settings.lon);
    sub.textContent = [
      ac.t, ac.r && ac.r !== id.textContent ? ac.r : null, formatAltBoth(ac, settings),
      typeof ac.gs === "number" ? `${Math.round(ac.gs)} kt` : null,
      dist !== null ? `${dist.toFixed(1)} NM` : null
    ].filter(Boolean).join(" · ");
    grow.append(id, sub);
    li.append(grow);

    if (ac.match?.watch) li.append(badge("watch", "WATCH"));
    for (const c of ac.match?.categories || []) {
      li.append(badge(c, c === "emergency" ? `SQK ${ac.squawk}` : CATEGORY_MATCHERS[c].label));
    }
    list.append(li);
  }
  if (mapOn) updateMiniMap();
}

// Live-update the popup while it's open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.snapshot) render();
});

render();
