// WingPing — round PPI radar scope renderer, shared by the popup and the map page.
// Pure canvas drawing; caller supplies data via the state getter.

import { distanceNm, bearingDeg, alertColor } from "./classify.js";

// startRadar(canvas, getState, onBlipClick) -> stop()
//   getState() -> { snapshot: [...], settings: {...} }
//   onBlipClick(hex) called when the user clicks a blip.
export function startRadar(canvas, getState, onBlipClick) {
  const ctx = canvas.getContext("2d");
  let animId = null;
  let blips = [];
  let running = true;

  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = null, bestD = 14;
    for (const b of blips) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best && onBlipClick) onBlipClick(best.hex);
  }
  canvas.addEventListener("click", onClick);

  function frame(ts = 0) {
    const { snapshot = [], settings } = getState();
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 14;
    ctx.clearRect(0, 0, W, H);

    // scope background
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, "#06180d");
    bg.addColorStop(1, "#020a05");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // range rings + spokes
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

    // rotating sweep (4 s per revolution)
    const angle = ((ts / 1000) * (Math.PI * 2 / 4)) % (Math.PI * 2);
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(angle - Math.PI / 2, cx, cy);
      g.addColorStop(0, "rgba(74,222,128,0.30)");
      g.addColorStop(0.10, "rgba(74,222,128,0)");
      g.addColorStop(1, "rgba(74,222,128,0)");
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(74,222,128,0.9)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.sin(angle), cy - R * Math.cos(angle)); ctx.stroke();

    // home dot
    ctx.fillStyle = "#93b4f8";
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

    // blips — every contact, alert status or not
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

      const color = alertColor(ac.match);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, ac.match && !ac.match.excluded ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();

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

    if (running) animId = requestAnimationFrame(frame);
  }
  animId = requestAnimationFrame(frame);

  return function stop() {
    running = false;
    cancelAnimationFrame(animId);
    canvas.removeEventListener("click", onClick);
  };
}
