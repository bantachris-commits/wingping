import { DEFAULT_SETTINGS, mapUrl, formatAlt, distanceNm } from "./shared/classify.js";

const list = document.getElementById("list");
const meta = document.getElementById("meta");
const err = document.getElementById("err");

document.getElementById("options").addEventListener("click", e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
document.getElementById("refresh").addEventListener("click", async () => {
  meta.textContent = "Refreshing…";
  await chrome.runtime.sendMessage("wingping-refresh");
  render();
});

async function getSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

function badge(cls, text) {
  const b = document.createElement("span");
  b.className = `badge b-${cls}`;
  b.textContent = text;
  return b;
}

async function render() {
  const s = await getSettings();
  const { snapshot = [], lastPoll, lastError, lastSource } =
    await chrome.storage.session.get(["snapshot", "lastPoll", "lastError", "lastSource"]);

  err.hidden = !lastError;
  if (lastError) err.textContent = `⚠ ${lastError}`;

  const when = lastPoll ? new Date(lastPoll).toLocaleTimeString() : "never";
  meta.textContent =
    `${snapshot.length} aircraft within ${s.radiusNm} NM · updated ${when}` +
    (lastSource ? ` · ${lastSource}` : "");

  // Matches first, then by distance.
  const rows = [...snapshot].sort((a, b) => {
    const am = a.match ? 0 : 1, bm = b.match ? 0 : 1;
    if (am !== bm) return am - bm;
    return (distanceNm(a, s.lat, s.lon) ?? 999) - (distanceNm(b, s.lat, s.lon) ?? 999);
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
    li.addEventListener("click", () => chrome.tabs.create({ url: mapUrl(ac.hex, s) }));

    const grow = document.createElement("div");
    grow.className = "grow";
    const id = document.createElement("div");
    id.className = "id";
    id.textContent = ac.flight || ac.r || ac.hex.toUpperCase();
    const sub = document.createElement("div");
    sub.className = "sub";
    const dist = distanceNm(ac, s.lat, s.lon);
    sub.textContent = [
      ac.t, ac.r && ac.r !== id.textContent ? ac.r : null, formatAlt(ac),
      typeof ac.gs === "number" ? `${Math.round(ac.gs)} kt` : null,
      dist !== null ? `${dist.toFixed(1)} NM` : null
    ].filter(Boolean).join(" · ");
    grow.append(id, sub);
    li.append(grow);

    if (ac.match?.watch) li.append(badge("watch", "WATCH"));
    for (const c of ac.match?.categories || []) li.append(badge(c, c.toUpperCase()));
    list.append(li);
  }
}

render();
