# WingPing Privacy Policy

*Last updated: July 24, 2026*

WingPing is a browser extension that alerts you when selected aircraft or aircraft categories fly over a location you choose. It is designed to collect nothing about you.

## What WingPing stores

Your settings — location coordinates, alert radius, category toggles, watchlist, exclusion list, and preferences — are stored in your browser's extension storage (`chrome.storage.sync`), which may sync between your own browsers via your Google account. This data never reaches the developer.

## What WingPing transmits

- **Flight data queries:** your chosen coordinates and radius are sent as URL parameters to the public ADS-B APIs (api.airplanes.live, api.adsb.lol) to fetch aircraft positions near you. These are community-run services with their own privacy practices.
- **Geocoding (optional):** when you type an address or airport code and click "Look up" on the options page, that text is sent to OpenStreetMap's Nominatim service to be converted to coordinates. This happens only when you click the button.
- **Nothing else.** No analytics, no telemetry, no crash reporting, no accounts, no cookies, no advertising identifiers.

## What WingPing does NOT do

- It does not read, track, or modify any web pages you visit (it has no content scripts).
- It does not collect browsing history.
- It does not sell or share any data with anyone — there is no data to sell.
- It does not run any code from remote servers.

## Third-party links

Alert notifications and popup rows open flight-tracking maps (ADS-B Exchange, airplanes.live, or adsb.lol) and the ATC button opens LiveATC.net. These sites have their own privacy policies. WingPing is not affiliated with any of them.

## Changes

Changes to this policy will be published in this repository with an updated date.

## Contact

Questions: open an issue on this repository.
