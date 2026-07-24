import { DEFAULT_SETTINGS } from "./shared/classify.js";

const $ = id => document.getElementById(id);

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
  $("cat-military").checked = s.categories.military;
  $("cat-helicopter").checked = s.categories.helicopter;
  $("cat-jet").checked = s.categories.jet;
  $("watchlist").value = (s.watchlist || []).join("\n");
}

$("geo").addEventListener("click", () => {
  $("geo").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    pos => {
      $("lat").value = pos.coords.latitude.toFixed(5);
      $("lon").value = pos.coords.longitude.toFixed(5);
      $("geo").textContent = "Use my current location";
    },
    e => {
      $("geo").textContent = `Location failed: ${e.message}`;
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

$("save").addEventListener("click", async () => {
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
    categories: {
      military: $("cat-military").checked,
      helicopter: $("cat-helicopter").checked,
      jet: $("cat-jet").checked
    },
    watchlist: $("watchlist").value
      .split(/[\n,]+/)
      .map(x => x.trim())
      .filter(Boolean)
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
