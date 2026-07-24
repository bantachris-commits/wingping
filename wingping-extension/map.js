// WingPing map page — Leaflet with selectable base layers, live aircraft
// markers from the background poll, trails, range ring, and a radar overlay.

import { DEFAULT_SETTINGS, alertColor, formatAlt, formatAltBoth, aglFt, distanceNm } from "./shared/classify.js";
import { startRadar } from "./shared/radar.js";

const params = new URLSearchParams(location.search);
const selectedHex = (params.get("icao") || "").toLowerCase() || null;

let settings = { ...DEFAULT_SETTINGS };
let snapshot = [];
let trails = {};
let markers = new Map();   // hex -> L.marker
let trailLine = null;
let followSelected = true;
let stopRadar = null;

async function getSettings() {
  const { settings: s } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...s,
    categories: { ...DEFAULT_SETTINGS.categories, ...(s?.categories || {}) } };
}

// --- base layers -------------------------------------------------------------

const baseLayers = {
  "Satellite": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Imagery © Esri World Imagery" }),
  "Streets": L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap contributors" }),
  "Dark": L.tileLayer(
    "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap · © CARTO" })
};
const layerForSetting = { satellite: "Satellite", streets: "Streets", dark: "Dark" };

const map = L.map("map", { zoomControl: true, attributionControl: true });
let rangeRing = null;
let homeMarker = null;

// --- aircraft glyphs -----------------------------------------------------------

const GLYPHS = {
  heli: `<ellipse cx="0" cy="-1" rx="3.4" ry="6"/><path d="M-1.2,3 L-0.8,11 L-3.5,13 L-3.5,14.6 L0,13.8 L3.5,14.6 L3.5,13 L0.8,11 L1.2,3 Z"/><rect x="-11" y="-2.4" width="22" height="1.8" rx=".9" transform="rotate(45)"/><rect x="-11" y="-2.4" width="22" height="1.8" rx=".9" transform="rotate(-45)"/>`,
  balloon: `<path d="M0,-12 C6,-12 8.2,-6.7 8.2,-3 C8.2,1.5 4.5,4.9 2.2,6.4 L2.2,8.2 L-2.2,8.2 L-2.2,6.4 C-4.5,4.9 -8.2,1.5 -8.2,-3 C-8.2,-6.7 -6,-12 0,-12 Z"/><rect x="-2.7" y="10.5" width="5.4" height="3.7" rx="1"/>`,
  plane: `<path d="M0,-14 C1.5,-14 2.1,-11 2.1,-8.5 L2.1,-3.5 L14,2.8 L14,5.6 L2.4,3.2 L2.1,8.4 L5.6,11.5 L5.6,13.6 L0.4,12.2 L-0.4,12.2 L-5.6,13.6 L-5.6,11.5 L-2.1,8.4 L-2.4,3.2 L-14,5.6 L-14,2.8 L-2.1,-3.5 L-2.1,-8.5 C-2.1,-11 -1.5,-14 0,-14 Z"/>`
};

function glyphFor(ac) {
  const m = ac.match;
  if (m?.categories?.includes("balloon")) return "balloon";
  if (m?.categories?.includes("helicopter")) return "heli";
  return "plane";
}

function iconFor(ac) {
  const color = ac.hex === selectedHex ? "#facc15" : alertColor(ac.match);
  const rot = glyphFor(ac) === "balloon" ? 0 : (typeof ac.track === "number" ? ac.track : 0);
  const name = ac.flight || ac.r || ac.hex.toUpperCase();
  const agl = aglFt(ac, settings);
  const sub = [ac.t, formatAlt(ac), agl !== null ? `${agl.toLocaleString()} AGL` : null]
    .filter(Boolean).join(" · ");
  const ring = ac.hex === selectedHex
    ? `<circle r="17" fill="none" stroke="#facc15" stroke-width="1.5" opacity=".6"/>` : "";
  return L.divIcon({
    className: "ac-marker",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html:
      `<svg width="44" height="44" viewBox="-22 -22 44 44">
         ${ring}
         <g fill="${color}" stroke="#0a0f1c" stroke-width="1" transform="rotate(${rot})">${GLYPHS[glyphFor(ac)]}</g>
       </svg>
       <div class="ac-label">${escapeHtml(name)}<span class="sub">${escapeHtml(sub)}</span></div>`
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- rendering -------------------------------------------------------------------

function renderHome() {
  const pos = [settings.lat, settings.lon];
  if (!homeMarker) {
    homeMarker = L.circleMarker(pos, { radius: 5, color: "#93b4f8", fillColor: "#93b4f8", fillOpacity: 1 })
      .addTo(map).bindTooltip("Home");
  } else homeMarker.setLatLng(pos);
  if (!rangeRing) {
    rangeRing = L.circle(pos, { radius: settings.radiusNm * 1852, color: "#60a5fa",
      weight: 1.2, dashArray: "5 6", fill: false }).addTo(map);
  } else { rangeRing.setLatLng(pos); rangeRing.setRadius(settings.radiusNm * 1852); }
}

function renderAircraft() {
  const seen = new Set();
  for (const ac of snapshot) {
    if (typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    seen.add(ac.hex);
    let mk = markers.get(ac.hex);
    if (!mk) {
      mk = L.marker([ac.lat, ac.lon], { icon: iconFor(ac) }).addTo(map);
      mk.on("click", () => selectAircraft(ac.hex));
      markers.set(ac.hex, mk);
    } else {
      mk.setLatLng([ac.lat, ac.lon]);
      mk.setIcon(iconFor(ac));
    }
  }
  for (const [hex, mk] of markers) {
    if (!seen.has(hex)) { map.removeLayer(mk); markers.delete(hex); }
  }
  renderTrail();
  renderBar();
}

function renderTrail() {
  if (trailLine) { map.removeLayer(trailLine); trailLine = null; }
  if (!selectedHex) return;
  const pts = (trails[selectedHex] || []).map(p => [p[0], p[1]]);
  const live = snapshot.find(a => a.hex === selectedHex);
  if (live && typeof live.lat === "number") pts.push([live.lat, live.lon]);
  if (pts.length < 2) return;
  trailLine = L.polyline(pts, { color: "#facc15", weight: 2.5, opacity: .9 }).addTo(map);
  if (followSelected && live) map.panTo([live.lat, live.lon]);
}

function renderBar() {
  const sel = document.getElementById("selInfo");
  const age = document.getElementById("age");
  if (selectedHex) {
    const ac = snapshot.find(a => a.hex === selectedHex);
    sel.textContent = ac
      ? `${ac.flight || ac.r || selectedHex.toUpperCase()} · ${ac.t || "?"} · ${formatAltBoth(ac, settings)} · ${
          (distanceNm(ac, settings.lat, settings.lon) ?? 0).toFixed(1)} NM`
      : `${selectedHex.toUpperCase()} — out of range`;
  } else sel.textContent = "";
  age.textContent = `${snapshot.length} aircraft · ${settings.radiusNm} NM`;
}

function selectAircraft(hex) {
  const url = new URL(location.href);
  url.searchParams.set("icao", hex);
  location.href = url.toString(); // simple + resets follow state
}

// --- data refresh -------------------------------------------------------------------

async function refreshData() {
  const sess = await chrome.storage.session.get(["snapshot", "trails"]);
  snapshot = sess.snapshot || [];
  trails = sess.trails || {};
  renderAircraft();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && (changes.snapshot || changes.trails)) refreshData();
  if (area === "sync" && changes.settings) init(false);
});

map.on("dragstart", () => { followSelected = false; });

document.getElementById("homeBtn").addEventListener("click", () => {
  followSelected = false;
  map.setView([settings.lat, settings.lon], map.getZoom());
});

// radar overlay
const radarBtn = document.getElementById("radarBtn");
const radarPanel = document.getElementById("radarPanel");
radarBtn.addEventListener("click", () => {
  const open = !radarPanel.classList.contains("open");
  radarPanel.classList.toggle("open", open);
  radarBtn.classList.toggle("toggled", open);
  if (open) {
    stopRadar = startRadar(
      document.getElementById("radar"),
      () => ({ snapshot, settings }),
      hex => selectAircraft(hex)
    );
  } else if (stopRadar) { stopRadar(); stopRadar = null; }
});

// --- init ------------------------------------------------------------------------

let currentBase = null;
async function init(firstLoad = true) {
  settings = await getSettings();

  const wanted = baseLayers[layerForSetting[settings.mapLayer] || "Satellite"];
  if (currentBase !== wanted) {
    if (currentBase) map.removeLayer(currentBase);
    wanted.addTo(map);
    currentBase = wanted;
  }
  if (firstLoad) {
    L.control.layers(baseLayers, null, { position: "topright" }).addTo(map);
    map.on("baselayerchange", e => { currentBase = e.layer; });
    map.setView([settings.lat, settings.lon], 11);
  }
  renderHome();
  await refreshData();
  // ask the worker for fresh data on open
  try { await chrome.runtime.sendMessage("wingping-refresh"); } catch { /* worker may be waking */ }
}

init();
