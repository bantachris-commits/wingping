# WingPing — Chrome Web Store Listing

Copy each section below into the matching field in the developer dashboard.

---

## Name

```
WingPing — Overhead Aircraft Alerts
```

## Short description (max 132 chars — this is the manifest description, already set)

```
Alerts when watched aircraft, military traffic, helicopters, jets, or balloons fly overhead. Radar, ATC radio, flight paths.
```

## Category

**Tools**

(Second choice: *Fun*. Pick Tools — utility extensions index better for search terms like "flight tracker".)

## Language

English (United States)

## Detailed description

```
Ever hear a helicopter circling and wonder what it is? WingPing tells you — the moment it enters your airspace.

WingPing watches the sky around any location you choose using free, community-run ADS-B flight data (airplanes.live, with adsb.lol as automatic fallback — no account or API key needed). When something interesting flies overhead, you get a desktop notification with the callsign, aircraft type, altitude, and distance — one click away from its live flight path on a map.

WHAT COUNTS AS INTERESTING? YOU DECIDE.

★ Nine alert categories — toggle each on or off:
• Military aircraft (curated military database + callsign patterns)
• Helicopters
• Jets (airliners and bizjets)
• Heavies (747s, A380s, C-5s and friends)
• Balloons — hot-air and high-altitude
• Gliders
• Drones / UAVs
• Props & general aviation
• Emergency squawks — 7500 / 7600 / 7700, because when someone declares an emergency overhead, you probably want to know

★ Watchlist — always alert on specific aircraft by tail number, ICAO hex code, callsign, or type. Wildcards supported (SAM* catches every special air mission).

★ Exclusion list — never alert on the medevac base next door or the flight school's Cessnas. Wildcards here too (LIFE*, SWA*). Emergency squawks override exclusions.

★ Radar scope — click the radar button and get a round, old-school PPI scope with a rotating sweep: every aircraft in range as a color-coded blip with heading vectors and callsigns, whether it matches your alerts or not. Click any blip for its flight path.

★ ATC radio — one click opens the LiveATC feed for your chosen airport, so you can listen to the controllers while you watch the traffic.

★ Easy location setup — type an address, city, or airport code (KDEN, DEN, KAPA...), use your current location, or enter coordinates directly. Set your alert radius from 1 to 250 nautical miles.

★ Quiet by design — per-aircraft cooldown stops a loitering helicopter from spamming you; jets and GA props are off by default so city dwellers aren't buried in alerts.

PRIVACY

WingPing collects nothing. No accounts, no analytics, no tracking. Your location is stored in your own Chrome sync storage and used only as a query to the public flight-data APIs. See the privacy policy for details.

Data: airplanes.live and adsb.lol community ADS-B networks. Map links: ADS-B Exchange, airplanes.live, or adsb.lol (your choice). Audio: LiveATC.net. Geocoding: OpenStreetMap Nominatim (only when you use the address lookup). WingPing is not affiliated with any of these services.
```

## Single purpose statement (Privacy tab)

```
Alerts the user when aircraft they care about — specific aircraft or chosen categories — fly over a user-selected location, and provides a view of that aircraft's flight path.
```

## Permission justifications (Privacy tab)

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings: location, alert radius, category toggles, watchlist and exclusion list. |
| `alarms` | Schedules the periodic (every 30 s) poll of the public aircraft-position API. |
| `notifications` | Shows the overhead-aircraft alert notifications, which are the core feature. |
| `api.airplanes.live` / `api.adsb.lol` | Fetches public ADS-B aircraft positions within the user's chosen radius. |
| `nominatim.openstreetmap.org` | Geocodes an address or airport code into coordinates, only when the user clicks "Look up" on the options page. |

## Data usage declarations (Privacy tab)

- Collects **location** — user-provided (typed or one-time browser geolocation), stored only in the user's Chrome storage, transmitted only as query parameters to the flight-data APIs to fetch nearby aircraft. Not sold, not shared, not used for unrelated purposes.
- No other data collected. No analytics, no accounts, no remote code.
- Certify: not sold to third parties ✔ · not used for creditworthiness ✔ · not used for unrelated purposes ✔

## Privacy policy URL

Point to the PRIVACY.md in your GitHub repo, e.g.:
```
https://github.com/<YOUR-USERNAME>/wingping/blob/main/PRIVACY.md
```

## Graphics checklist

| Asset | File | Required? |
|---|---|---|
| Store icon 128×128 | `store-assets/store-icon-128.png` | Required |
| Screenshot 1280×800 #1 (popup + alerts) | `store-assets/screenshot-1-popup.png` | ≥1 required |
| Screenshot 1280×800 #2 (map view) | `store-assets/screenshot-2-map.png` | recommended |
| Screenshot 1280×800 #3 (settings) | `store-assets/screenshot-3-settings.png` | recommended |
| Small promo tile 440×280 | `store-assets/promo-tile-440x280.png` | optional, shown in category pages |
| Marquee 1400×560 | `store-assets/marquee-1400x560.png` | optional, needed only if featured |

## Search keywords (work these into the description naturally — CWS has no keyword field)

plane tracker, flight tracker, ADS-B, aircraft overhead, military aircraft alert, helicopter alert, plane spotting, aviation, flight radar, ATC
