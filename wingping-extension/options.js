import { DEFAULT_SETTINGS } from "./shared/classify.js";

const $ = id => document.getElementById(id);
const CATS = ["military", "helicopter", "jet", "heavy", "balloon", "glider", "drone", "prop", "emergency"];

async function load() {
  const { settings } = await chrome.storage.sync.get("settings");
  const s = { ...DEFAULT_SETTINGS, ...settings,
    categories: { ...DEFAULT_SETTINGS.categories, ...(settings?.categories || {}) } };

  $("lat").value = s.lat;
  $("lon").value = s.lon;
  $("radiusNm").value = s.radiusNm;
  $("pollSeconds").value = s.pollSeconds;
  $("cooldownMinutes").value = s.cooldownMinutes;
  $("provider").value = s.provider;
  $("mapProvider").value = s.mapProvider;
  $("notify").checked = s.notify;
  $("ignoreGround").checked = s.ignoreGround;
  $("nearestAirport").value = s.nearestAirport || "";
  for (const c of CATS) $(`cat-${c}`).checked = !!s.categories[c];
  $("watchlist").value = (s.watchlist || []).join("\n");
  $("exclusions").value = (s.exclusions || []).join("\n");
}

// --- address / airport-code lookup via Nominatim (OpenStreetMap) ---------------

const looksLikeAirportCode = q => /^[A-Za-z]{3,4}$/.test(q.trim());

$("lookupBtn").addEventListener("click", lookup);
$("lookup").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); lookup(); } });

async function lookup() {
  const q = $("lookup").value.trim();
  const status = $("lookupStatus");
  if (!q) { status.textContent = "Type an address, place, or airport code first."; return; }

  const isCode = looksLikeAirportCode(q);
  const query = isCode ? `${q.toUpperCase()} airport` : q;
  status.textContent = "Searching…";
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const results = await res.json();
    if (!results.length) { status.textContent = `No match for "${q}".`; return; }

    const hit = results[0];
    $("lat").value = parseFloat(hit.lat).toFixed(5);
    $("lon").value = parseFloat(hit.lon).toFixed(5);
    status.textContent = `✓ ${hit.display_name}`;

    if (isCode) {
      // 4 letters ≈ ICAO already; 3 letters is IATA — LiveATC handles both in search.
      $("nearestAirport").value = q.toUpperCase();
    }
  } catch (e) {
    status.textContent = `Lookup failed: ${e.message}`;
  }
}

$("geo").addEventListener("click", () => {
  $("geo").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    pos => {
      $("lat").value = pos.coords.latitude.toFixed(5);
      $("lon").value = pos.coords.longitude.toFixed(5);
      $("geo").textContent = "📍 My location";
    },
    e => {
      $("geo").textContent = `Failed: ${e.message}`;
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

// --- save -----------------------------------------------------------------------

const parseList = txt => txt.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);

$("save").addEventListener("click", async () => {
  const categories = {};
  for (const c of CATS) categories[c] = $(`cat-${c}`).checked;

  const settings = {
    lat: parseFloat($("lat").value),
    lon: parseFloat($("lon").value),
    radiusNm: Math.min(250, Math.max(1, parseInt($("radiusNm").value, 10) || 5)),
    pollSeconds: Math.max(30, parseInt($("pollSeconds").value, 10) || 30),
    cooldownMinutes: Math.max(1, parseInt($("cooldownMinutes").value, 10) || 30),
    provider: $("provider").value,
    mapProvider: $("mapProvider").value,
    notify: $("notify").checked,
    ignoreGround: $("ignoreGround").checked,
    maxStaleSeconds: DEFAULT_SETTINGS.maxStaleSeconds,
    nearestAirport: $("nearestAirport").value.trim().toUpperCase(),
    categories,
    watchlist: parseList($("watchlist").value),
    exclusions: parseList($("exclusions").value)
  };

  if (!Number.isFinite(settings.lat) || !Number.isFinite(settings.lon)) {
    $("status").textContent = "Enter a valid latitude and longitude.";
    $("status").style.color = "#dc2626";
    return;
  }

  await chrome.storage.sync.set({ settings });
  $("status").style.color = "#16a34a";
  $("status").textContent = "Saved — polling restarted.";
  setTimeout(() => ($("status").textContent = ""), 2500);
});

load();
