// WingPing service worker: polls the ADS-B point API on an alarm,
// classifies traffic, fires notifications, and caches a snapshot for the popup.

import {
  DEFAULT_SETTINGS, API_PROVIDERS, evaluate, isUsable, describe, formatAltBoth,
  distanceNm, mapUrl, CATEGORY_MATCHERS, EMERGENCY_SQUAWKS
} from "./shared/classify.js";

const ALARM = "wingping-poll";

// --- settings ---------------------------------------------------------------

async function getSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings,
    categories: { ...DEFAULT_SETTINGS.categories, ...(settings?.categories || {}) } };
}

// --- lifecycle --------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await schedule();
  poll();
});
chrome.runtime.onStartup.addListener(async () => {
  await schedule();
  poll();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    schedule().then(poll);
  }
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM) poll(); });

async function schedule() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARM);
  // chrome.alarms floor is 30 seconds (0.5 min).
  const period = Math.max(0.5, (s.pollSeconds || 30) / 60);
  chrome.alarms.create(ALARM, { periodInMinutes: period });
}

// --- polling ----------------------------------------------------------------

async function fetchAircraft(s) {
  const order = s.provider === "adsb.lol"
    ? ["adsb.lol", "airplanes.live"]
    : ["airplanes.live", "adsb.lol"];
  for (const name of order) {
    try {
      const url = API_PROVIDERS[name](s.lat, s.lon, s.radiusNm);
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { aircraft: data.ac || data.aircraft || [], source: name };
    } catch (e) {
      console.warn(`WingPing: ${name} failed:`, e.message);
    }
  }
  return { aircraft: null, source: null }; // both providers failed
}

async function poll() {
  const s = await getSettings();
  const { aircraft, source } = await fetchAircraft(s);

  if (aircraft === null) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
    await chrome.storage.session.set({ lastError: "Data sources unreachable", lastPoll: Date.now() });
    return;
  }

  const usable = aircraft.filter(ac => isUsable(ac, s));
  const evaluated = usable.map(ac => ({ ac, match: evaluate(ac, s) }));
  const alerts = evaluated.filter(e => e.match && !e.match.excluded);

  // Accumulate position history for trails on the embedded map.
  const now = Date.now();
  const { trails = {} } = await chrome.storage.session.get("trails");
  for (const ac of usable) {
    if (typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    const t = trails[ac.hex] || [];
    const last = t[t.length - 1];
    if (!last || last[0] !== ac.lat || last[1] !== ac.lon) {
      t.push([ac.lat, ac.lon, typeof ac.alt_baro === "number" ? ac.alt_baro : null, now]);
      if (t.length > 240) t.shift(); // ~2 h at 30 s polls
    }
    trails[ac.hex] = t;
  }
  for (const [hex, t] of Object.entries(trails)) {
    if (now - t[t.length - 1][3] > 30 * 60 * 1000) delete trails[hex]; // gone 30 min
  }
  await chrome.storage.session.set({ trails });

  // Snapshot for the popup & radar (ALL overhead traffic, matches flagged).
  await chrome.storage.session.set({
    lastError: null,
    lastPoll: Date.now(),
    lastSource: source,
    snapshot: evaluated.map(({ ac, match }) => ({
      hex: ac.hex, flight: (ac.flight || "").trim(), r: ac.r, t: ac.t,
      alt_baro: ac.alt_baro, alt_geom: ac.alt_geom, gs: ac.gs, track: ac.track,
      squawk: ac.squawk, lat: ac.lat, lon: ac.lon, dbFlags: ac.dbFlags,
      category: ac.category, match
    }))
  });

  // Toolbar badge = number of alerting aircraft overhead right now.
  await chrome.action.setBadgeBackgroundColor({ color: "#1d4ed8" });
  await chrome.action.setBadgeText({ text: alerts.length ? String(alerts.length) : "" });

  if (s.notify) await notifyNew(alerts, s);
}

// --- notifications with per-aircraft cooldown --------------------------------

async function notifyNew(alerts, s) {
  const now = Date.now();
  const cooldownMs = (s.cooldownMinutes || 30) * 60 * 1000;
  const { alerted = {} } = await chrome.storage.local.get("alerted");

  for (const { ac, match } of alerts) {
    const last = alerted[ac.hex] || 0;
    if (now - last < cooldownMs) continue;
    alerted[ac.hex] = now;

    const labels = match.categories.map(c =>
      c === "emergency"
        ? `⚠ ${EMERGENCY_SQUAWKS[ac.squawk] || "EMERGENCY"} (${ac.squawk})`
        : CATEGORY_MATCHERS[c].label);
    if (match.watch) labels.unshift(`WATCHLIST:${match.watch}`);
    const dist = distanceNm(ac, s.lat, s.lon);
    const distTxt = dist !== null ? ` · ${dist.toFixed(1)} NM` : "";

    chrome.notifications.create(`wingping:${ac.hex}:${now}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `${labels.join(" · ")} overhead`,
      message: `${describe(ac)} · ${formatAltBoth(ac, s)}${distTxt}`,
      priority: 2,
      buttons: [{ title: "View flight path" }]
    });
  }

  // Prune stale cooldown entries so storage doesn't grow forever.
  for (const [hex, t] of Object.entries(alerted)) {
    if (now - t > cooldownMs * 4) delete alerted[hex];
  }
  await chrome.storage.local.set({ alerted });
}

async function openMap(notificationId) {
  const hex = notificationId.split(":")[1];
  if (!hex) return;
  const s = await getSettings();
  const url = mapUrl(hex, s);
  // Embedded map page is a relative extension URL; external globes are absolute.
  chrome.tabs.create({ url: url.startsWith("http") ? url : chrome.runtime.getURL(url) });
  chrome.notifications.clear(notificationId);
}

chrome.notifications.onClicked.addListener(openMap);
chrome.notifications.onButtonClicked.addListener(id => openMap(id));

// Popup can request an immediate refresh.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg === "wingping-refresh") {
    poll().then(() => sendResponse(true));
    return true; // keep the message channel open for the async response
  }
});
