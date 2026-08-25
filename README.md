# Hydro — Hydration & Urination Tracker

A mobile-first, privacy-focused hydration and urination tracker. Built with
plain HTML, CSS, and vanilla JavaScript — no frameworks, no build step, no
backend, and no external database. Every entry, goal, and setting is stored
on-device using the browser's **Local Storage** API.

## Project structure

```
hydration-tracker/
├── index.html          App shell: header, main content mount, bottom nav
├── styles.css           All design tokens, layout, and component styles
├── app.js                State, router, screens, charts, reminders — everything runs from here
├── manifest.json      Web app manifest (installable, "Add to Home Screen")
├── service-worker.js  Caches the app shell so it also works offline
└── README.md            This file
```

There is intentionally no `package.json`, bundler, or npm dependency — open
`index.html` in a browser (or serve the folder statically) and it runs.

## Running it

Any static file server works, e.g.:

```bash
cd hydration-tracker
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` directly by double-clicking also works in most
browsers; a local server is only needed for the service worker (offline
caching) to register, since `file://` origins can't use it.

## Navigation

The nav pattern mirrors a typical mobile food-delivery app (Cloud Kitchen
reference): a **hamburger icon** on each top-level tab opens a bottom sheet
"Menu", and every sub-screen shows an explicit **back arrow** rather than
relying on the browser's own back gesture — so it behaves identically on
iOS and Android.

- **Bottom nav (always visible):** Home · History · Stats
- **Hamburger menu (bottom sheet, from any tab):** My Profile, Goals,
  Reminders, Settings, Export Data, Clear All Data, About Hydro, Cancel
- Screens opened from the menu remember which tab you came from, so the
  back arrow — and the highlighted bottom-nav tab — return you to the right
  place.

## Screens

- **Dashboard (Today)** — circular goal-progress ring, quick totals, quick-add buttons, recent entries
- **Add Water** — preset volumes (100/250/500/750/1000 ml), custom amount, date & time, notes
- **Add Urination** — small/medium/large, date & time, notes
- **History** — full local log, filterable by type and date, tap any entry to edit or delete
- **Statistics** — Day / Month / Year tabs with bar charts for water intake and urination frequency, goal %, trends vs. the previous period, and a water-vs-urination pattern summary
- **My Profile** — name, units (ml/L or oz), and daily water goal in one place
- **Goals** — daily water goal with quick presets, custom amount, and a goal-streak counter
- **Reminders** — optional on-device notifications on an interval, within active hours
- **Settings** — export/import/clear data, with a link back to My Profile for name/units
- **About** — what the app does and how the privacy model works

## Data & privacy model

- All data is stored under a single `localStorage` key, as plain JSON.
- Nothing is sent over the network. There is no server, no analytics, no
  tracking pixel, and no account or sign-in of any kind.
- **Export Data** (Settings → Your Data) downloads a JSON backup file you
  control. **Import Data** restores from that same file. **Clear All Data**
  permanently wipes local storage after a confirmation step.
- Reminders use the browser's `Notification` API directly and only fire
  while the tab/app is open — there is no push server, so the schedule
  itself never leaves the device either.
- Clearing your browser's site data, using a different browser, or
  switching devices will not carry history over — that's the trade-off of
  having no backend. Use Export Data any time you want a personal backup.

## Notes on implementation choices

- **No external fonts/CDNs**: the UI uses the OS system font stack
  (`-apple-system, Segoe UI, Roboto, …`) rather than a Google Fonts import,
  so the app makes zero network requests beyond loading its own three files.
- **Charts** are hand-built inline SVG (a small `svgBarChart()` helper in
  `app.js`) — no charting library — to keep the whole app dependency-free.
- **Editing** reuses a single bottom-sheet component for both entry types,
  driven by the same add/update/delete functions used elsewhere.
