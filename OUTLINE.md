# WingPing — Overhead Aircraft Alert Chrome Extension

## Concept

A Manifest V3 Chrome extension that watches the airspace around a location you choose and fires a desktop notification when an aircraft you care about flies overhead — either a **specific aircraft** (tail number, ICAO hex, callsign, or type) or a **category** of aircraft (military, helicopters, jets). Every alert and every row in the popup is one click away from a live map showing that aircraft's flight path.

## Data source

**Primary: airplanes.live** — `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius_nm}`
**Fallback: adsb.lol** — `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}`

Both are free community ADS-B aggregators, need no API key, and return the same readsb-derived JSON schema. Key fields per aircraft:

| Field | Meaning |
|---|---|
| `hex` | ICAO 24-bit address (unique aircraft ID) |
| `flight` | Callsign (e.g. `N123AB`, `EJM459`, `BLADE1`) |
| `r` | Registration / tail number |
| `t` | ICAO type designator (`B738`, `EC35`, `H60`…) |
| `dbFlags` | Bitfield — **bit 0 = military**, bit 2 = LADD, bit 3 = PIA |
| `category` | ADS-B emitter category — **`A7` = rotorcraft** |
| `alt_baro`, `gs`, `track` | Altitude (ft or `"ground"`), ground speed (kt), heading |
| `lat`, `lon`, `seen` | Position and staleness (seconds since last message) |

*Note: these API hosts were unreachable from the sandbox this was built in (network allowlist), so the response shape is coded to the published v2 schema rather than live-verified — expect at most minor field tweaks on first run.*

**Alternatives considered:** OpenSky (free but rate-limited, weak military/category data), ADS-B Exchange via RapidAPI (paid key). The options page has a provider dropdown so swapping later is trivial.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ background.js (MV3 service worker)                  │
│  chrome.alarms every 30s ──► fetch /v2/point/…      │
│  ├─ classify each aircraft (military/heli/jet)      │
│  ├─ match against watchlist (hex/reg/callsign/type) │
│  ├─ de-dupe via per-aircraft cooldown (storage)     │
│  ├─ chrome.notifications  ──► click = open map      │
│  ├─ badge count on toolbar icon                     │
│  └─ cache last snapshot for the popup               │
├─────────────────────────────────────────────────────┤
│ popup.html/js — live "what's overhead" list,        │
│   badges (MIL/HELI/JET/WATCHLIST), click → map      │
├─────────────────────────────────────────────────────┤
│ options.html/js — location, radius, categories,     │
│   watchlist, cooldown, map provider, polling rate   │
├─────────────────────────────────────────────────────┤
│ shared/classify.js — pure classification logic      │
│   (imported by worker + popup, unit-testable)       │
└─────────────────────────────────────────────────────┘
```

Why this shape: MV3 service workers are ephemeral, so **`chrome.alarms` (not `setInterval`) drives polling** and all state that must survive worker restarts (settings, cooldown timestamps, last snapshot) lives in `chrome.storage`. Chrome's floor for alarms is 30 seconds, which is also a polite polling rate for free community APIs.

## Detection & alert logic

1. **Fetch** aircraft within `radius` NM of home location (settable 1–250 NM; "overhead" default 5 NM).
2. **Filter** stale contacts (`seen > 60s`) and grounded aircraft (optional toggle).
3. **Classify** each aircraft:
   - **Military** — `dbFlags & 1` (aggregator's curated military DB — far more reliable than callsign guessing), plus a callsign-prefix backstop (RCH, PAT, EVAC, etc.).
   - **Helicopter** — emitter `category === "A7"`, plus an ICAO type-code list backstop (EC35, B06, R44, H60, S76, A139, …) since many rotorcraft squawk no category.
   - **Jet** — no direct ADS-B flag exists, so: known jet type designators (airliners + bizjets) plus a physics backstop (>250 kt at >10,000 ft ≈ turbine).
   - Matchers live in one table in `shared/classify.js`; adding a category (e.g. "warbirds", "heavies `A5`") is one entry.
4. **Watchlist match** — each entry is compared case-insensitively against `hex`, `r`, `flight`, and `t`. So `AE01CE`, `N90210`, `SAM46`, and `EC35` are all valid entries.
5. **De-dupe** — one notification per aircraft per cooldown window (default 30 min), keyed by hex, persisted so a service-worker restart doesn't re-alert.
6. **Notify** — rich notification: `⚠ MILITARY overhead: HOIST81 (H60) · 1,200 ft · 3.4 NM`, with a **"View flight path"** button. Clicking either opens the map.

## Map jump

Alerts and popup rows deep-link to a globe view **pre-filtered to that aircraft with its trail shown**:

- airplanes.live: `https://globe.airplanes.live/?icao={hex}`
- ADS-B Exchange: `https://globe.adsbexchange.com/?icao={hex}`
- adsb.lol: `https://adsb.lol/?icao={hex}`

Provider is a setting; ADSBx globe is the default map (best trail rendering / history scrubbing).

## File map

```
wingping-extension/
├── manifest.json          MV3 manifest, permissions, host allowlist
├── background.js          poller, matcher, notifier (service worker)
├── shared/classify.js     category + watchlist matching (pure functions)
├── popup.html/css/js      overhead list UI
├── options.html/css/js    settings UI
└── icons/                 16/32/48/128 px
```

Permissions kept minimal: `storage`, `alarms`, `notifications` + host permissions for the two API domains only. No content scripts, no tabs snooping, no `geolocation` in the worker (the options page uses `navigator.geolocation` on demand to fill in your coordinates).

## Install / try it

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `wingping-extension/`.
2. Open the extension's **Options**, set your location (or click *Use my current location*), radius, categories, and watchlist.
3. Wait ≤30 s; matched aircraft raise a notification and appear in the popup.

## Roadmap (post-v1)

- **v1.1** — alert history log with replay links; per-category sounds; quiet hours.
- **v1.2** — multiple named locations (home/work); altitude ceiling filter ("only below 10k ft").
- **v1.3** — richer categories: heavies (A5), gliders, balloons, emergency squawks (7500/7600/7700 — trivially available via `squawk` field and very fun).
- **v2** — optional local receiver source (dump1090/tar1090 `aircraft.json` URL) for zero-latency, unlimited polling; embedded mini-map in the popup.
