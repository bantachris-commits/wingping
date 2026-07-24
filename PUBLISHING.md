# WingPing — GitHub & Store Publishing Guide

## 1. Push to GitHub (PowerShell)

Assumes the project lives at `C:\dev\wingping` with this layout (unzip `wingping-extension.zip` there):

```
C:\dev\wingping\
├── wingping-extension\     ← the extension source (manifest.json at its root)
├── OUTLINE.md
└── PUBLISHING.md
```

### One-time tool install

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
# restart the terminal after installing so git/gh are on PATH
```

### Create the repo and push (GitHub CLI — easiest)

```powershell
cd C:\dev\wingping

# a sensible .gitignore
@"
*.zip
node_modules/
.DS_Store
"@ | Out-File -Encoding utf8 .gitignore

git init
git add .
git commit -m "WingPing v0.1.0 - overhead aircraft alerts (military/heli/jet/balloon + watchlist)"

gh auth login                 # pick GitHub.com → HTTPS → login via browser
gh repo create wingping --public --source . --remote origin --push
```

Done — `gh repo create ... --push` creates the repo under your account and pushes in one step. Use `--private` instead of `--public` if you're not ready to share.

### Without the GitHub CLI (plain git)

Create an empty repo named `wingping` at github.com/new (no README), then:

```powershell
cd C:\dev\wingping
git init
git add .
git commit -m "WingPing v0.1.0"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/wingping.git
git push -u origin main
```

### Building the store upload zip

Stores want `manifest.json` at the **root of the zip** — so zip the folder's *contents*, not the folder:

```powershell
cd C:\dev\wingping
Compress-Archive -Path .\wingping-extension\* -DestinationPath .\wingping-v0.1.0.zip -Force
```

Tag releases as you go:

```powershell
git tag v0.1.0
git push --tags
```

---

## 2. Chrome Web Store

1. **Developer account** — https://chrome.google.com/webstore/devconsole → sign in with a Google account → pay the **one-time $5** registration fee.
2. **New item** → upload `wingping-v0.1.0.zip`.
3. **Store listing** — you'll need:
   - Name, short description (132 chars), full description.
   - **Icon 128×128** (already in `icons/`).
   - **At least one screenshot, 1280×800 or 640×400** — screenshot the popup and the map page.
   - Category: *Tools* or *Fun*; language.
4. **Privacy tab** — this is what actually gates approval:
   - *Single purpose*: "Alerts the user when selected aircraft or aircraft categories fly over a user-chosen location, and shows their flight path."
   - *Permission justifications*:
     - `storage` — save user settings (location, watchlist, exclusions).
     - `alarms` — periodic polling of the aircraft-position API.
     - `notifications` — the overhead alerts themselves.
     - Host permissions (`api.airplanes.live`, `api.adsb.lol`) — fetch public ADS-B aircraft positions around the user's chosen location.
     - Host permission (`nominatim.openstreetmap.org`) — one-off geocoding when the user looks up an address or airport code on the options page.
   - *Data usage*: declare that location is user-entered, stored locally/sync only, and **not transmitted anywhere except as API query parameters**; no data sold/shared. WingPing has no analytics — say so.
   - You'll need a **privacy policy URL** — a `PRIVACY.md` in the GitHub repo works (link the raw/rendered page).
5. Submit for review. First review typically takes **1–3 days** (can be longer). Broad host permissions and remote code are the usual rejection reasons — WingPing has neither (two named API hosts, all code bundled), so it should pass cleanly.
6. Updates: bump `"version"` in manifest.json, re-zip, upload, resubmit.

> Note: if you later embed the satellite map, add the tile hosts (e.g. `server.arcgisonline.com`, `tile.openstreetmap.org`, `*.basemaps.cartocdn.com`) to `host_permissions` and to the justification list — and remember MapLibre/Leaflet must be **bundled in the zip**, never loaded from a CDN (remote code = instant rejection).

---

## 3. Microsoft Edge Add-ons

Edge runs Chrome MV3 extensions unchanged.

1. Register at https://partner.microsoft.com/dashboard/microsoftedge — **free**.
2. Submit the **same zip**. Listing + privacy questions mirror Chrome's.
3. Review is usually a few business days. Separate listing, same codebase — just re-upload each release.

(Edge users can also install straight from the Chrome Web Store, but a native listing looks better and updates cleaner.)

---

## 4. Firefox (addons.mozilla.org)

Firefox supports MV3 but **not `background.service_worker`** — it uses event pages. Two small manifest edits make one codebase work in both:

```json
"background": {
  "service_worker": "background.js",
  "scripts": ["background.js"],
  "type": "module"
},
"browser_specific_settings": {
  "gecko": { "id": "wingping@yourdomain.example", "strict_min_version": "121.0" }
}
```

Chrome uses `service_worker` and ignores `scripts`; Firefox does the opposite. The `chrome.*` APIs used (storage, alarms, notifications, tabs, action) all exist in Firefox under `chrome.*` — no code changes needed. One behavioral gap: Firefox notifications don't support buttons, so the "View flight path" button silently drops (clicking the notification body still opens the map — already handled).

1. Account at https://addons.mozilla.org → Developer Hub — **free**.
2. Submit the zip. AMO runs an automated validator, then human review (hours–days).
3. Firefox for Android also accepts MV3 extensions if you want mobile alerts.

---

## 5. Other browsers

| Browser | How |
|---|---|
| **Brave / Vivaldi / Arc** | Install directly from the Chrome Web Store — nothing to do. |
| **Opera** | addons.opera.com developer account (free), same zip; or users install from CWS via Opera's "Install Chrome extensions" add-on. |
| **Safari** | Real port: macOS + Xcode, `xcrun safari-web-extension-converter .\wingping-extension`, then ship through the App Store (**$99/yr** Apple Developer). Only worth it if you actually want Safari users. |

## 6. Release checklist (every version)

1. Bump `"version"` in `manifest.json` (e.g. 0.1.0 → 0.2.0).
2. `git commit`, `git tag v0.2.0`, `git push --tags`.
3. `Compress-Archive -Path .\wingping-extension\* -DestinationPath .\wingping-v0.2.0.zip -Force`
4. Upload to Chrome dashboard + Edge Partner Center + AMO.
5. Attach the zip to a GitHub Release (`gh release create v0.2.0 .\wingping-v0.2.0.zip --notes "changelog..."`).
