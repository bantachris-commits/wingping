import {
  DEFAULT_SETTINGS, mapUrl, atcUrl, formatAlt, distanceNm, bearingDeg,
  CATEGORY_MATCHERS
} from "./shared/classify.js";

const list = document.getElementById("list");
const meta = document.getElementById("meta");
const err = document.getElementById("err");
const radarWrap = document.getElementById("radarWrap");
const radarBtn = document.getElementById("radarBtn");
const canvas = document.getElementById("radar");
const ctx = canvas.getContext("2d");

let settings = { ...DEFAULT_SETTINGS };
let snapshot = [];
let radarOn = false;
let animId = null;
let blips = []; // {x, y, hex} for click hit-testing

document.getElementById("options").addEventListener("click", e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
document.getElementById("refresh").addEventListener("click", async () => {
  meta.textContent = "Refreshing…";
  await chrome.runtime.sendMessage("wingping-refresh");
  render();
});
document.getElementById("atc").addEventListener("click", e => {
  e.preventDefault();
  chrome.tabs.create({ url: atcUrl(settings.nearestAirport) });
});
radarBtn.addEventListener("click", () => {
  radarOn = !radarOn;
  radarWrap.classList.toggle("open", radarOn);
  radarBtn.classList.toggle("toggled", radarOn);
  if (radarOn) sweep(); else cancelAnimationFrame(animId);
});
canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  let best = null, bestD = 14; // 14px hit radius
  for (const b of blips) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) chrome.tabs.create({ url: mapUrl(best.hex, settings) });
});

async function getSettings() {
  const { settings: s } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...s,
    categories: { ...DEFAULT_SETTINGS.categories, ...(s?.categories || {}) } };
}

// Color for a contact based on its alert evaluation.
function colorFor(ac) {
  const m = ac.match;
  if (m?.excluded) return "#3f4a63";
  if (m?.categories?.includes("emergency")) return "#ff2d2d";
  if (m?.watch) return "#4ade80";
  if (m?.categories?.includes("military")) return "#f87171";
  if (m?.categories?.includes("helicopter")) return "#fbbf24";
  if (m?.categories?.includes("balloon")) return "#c084fc";
  if (m?.categories?.includes("drone")) return "#f472b6";
  if (m?.categories?.includes("glider")) return "#2dd4bf";
  if (m?.categories?.includes("heavy")) return "#818cf8";
  if (m?.categories?.includes("jet")) return "#60a5fa";
  if (m?.categories?.includes("prop")) return "#9ca3af";
  return "#64748b";
}

// --- radar scope ---------------------------------------------------------------

function sweep(ts = 0) {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 14;
  ctx.clearRect(0, 0, W, H);

  // scope background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, "#06180d");
  bg.addColorStop(1, "#020a05");
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // range rings + cardinal spokes
  ctx.strokeStyle = "#1c4a2c"; ctx.lineWidth = 1; ctx.fillStyle = "#2f6b42";
  ctx.font = "9px system-ui"; ctx.textAlign = "left";
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); ctx.stroke();
    const nm = (settings.radiusNm * i) / 4;
    ctx.fillText(`${+nm.toFixed(1)}`, cx + 3, cy - (R * i) / 4 + 10);
  }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.fillStyle = "#3f8f58"; ctx.textAlign = "center"; ctx.font = "bold 10px system-ui";
  ctx.fillText("N", cx, cy - R + 1); ctx.fillText("S", cx, cy + R + 11);
  ctx.textAlign = "left"; ctx.fillText("E", cx + R + 3, cy + 3);
  ctx.textAlign = "right"; ctx.fillText("W", cx - R - 3, cy + 3);

  // rotating sweep beam
  const angle = ((ts / 1000) * (Math.PI * 2 / 4)) % (Math.PI * 2); // 4 s per revolution
  const grad = ctx.createConicGradient
    ? (() => { const g = ctx.createConicGradient(angle - Math.PI / 2, cx, cy);
        g.addColorStop(0, "rgba(74,222,128,0.30)");
        g.addColorStop(0.10, "rgba(74,222,128,0)");
        g.addColorStop(1, "rgba(74,222,128,0)");
        return g; })()
    : "rgba(74,222,128,0.08)";
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.strokeStyle = "rgba(74,222,128,0.9)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + R * Math.sin(angle), cy - R * Math.cos(angle)); ctx.stroke();

  // home dot
  ctx.fillStyle = "#93b4f8";
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

  // blips — every contact in the snapshot, alert status or not
  blips = [];
  ctx.font = "9px ui-monospace, monospace";
  for (const ac of snapshot) {
    const dist = distanceNm(ac, settings.lat, settings.lon);
    const brg = bearingDeg(ac, settings.lat, settings.lon);
    if (dist === null || brg === null) continue;
    const r = Math.min(dist / settings.radiusNm, 1) * R;
    const rad = (brg * Math.PI) / 180;
    const x = cx + r * Math.sin(rad);
    const y = cy - r * Math.cos(rad);
    blips.push({ x, y, hex: ac.hex });

    const color = colorFor(ac);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, ac.match && !ac.match.excluded ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();

    // velocity leader line from track
    if (typeof ac.track === "number" && typeof ac.gs === "number" && ac.gs > 30) {
      const tr = (ac.track * Math.PI) / 180;
      const len = 6 + Math.min(ac.gs / 40, 10);
      ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + len * Math.sin(tr), y - len * Math.cos(tr)); ctx.stroke();
    }

    ctx.fillStyle = ac.match?.excluded ? "#4a5670" : "#a7f3c9";
    ctx.textAlign = "left";
    ctx.fillText(ac.flight || ac.r || ac.hex.toUpperCase(), x + 7, y - 5);
  }

  if (radarOn) animId = requestAnimationFrame(sweep);
}

// --- list ------------------------------------------------------------------------

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
    li.addEventListener("click", () => chrome.tabs.create({ url: mapUrl(ac.hex, settings) }));

    const grow = document.createElement("div");
    grow.className = "grow";
    const id = document.createElement("div");
    id.className = "id";
    id.textContent = ac.flight || ac.r || ac.hex.toUpperCase();
    const sub = document.createElement("div");
    sub.className = "sub";
    const dist = distanceNm(ac, settings.lat, settings.lon);
    sub.textContent = [
      ac.t, ac.r && ac.r !== id.textContent ? ac.r : null, formatAlt(ac),
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
}

render();
