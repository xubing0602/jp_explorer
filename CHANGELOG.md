# Changelog

All notable changes to this project will be documented in this file.

## 2026-04-26

### Added
- Responsive design for mobile and tablet devices.
  - **Mobile (≤ 600px)**: app padding reduced to `12px`; topbar stats pushed to their own full-width row and laid out as a `repeat(3, 1fr)` grid (2 rows of 3 + 2) so all five stats are visible without overflow; stat font sizes and padding tightened to fit narrower columns; map `min-height` lowered from `520px` to `300px` and height changed to `52vh`; bar-chart label column narrowed; table cell padding and font size reduced (table still horizontally scrollable).
  - **Tablet (≤ 900px)**: existing single-column analytics and metric-list collapse retained; map height set to `60vh`.

### Removed
- Status bar (`#status` / "加载完成") removed from the header — loading state is no longer surfaced in the UI.
  - HTML element deleted from `index.html`.
  - `.status` CSS rule removed from `app.css`.
  - `updateStatus()` in `app.js` guarded with an early return when the element is absent, preventing runtime errors.

## 2026-04-25

### Changed
- Map now loads in a single render pass: municipality TopoJSON, prefecture TopoJSON, and `visits.csv` are fetched in parallel and applied at once, eliminating the gradual chunked fill-in and color flash on startup.

## 2026-04-17

### Added
- CSV-based visit levels (`data/visits.csv`) with 0-5 depth scale mapped to distinct colors.
- Hover interaction on municipalities with a custom “fancy” tooltip + hover highlight.
- Analytics section with global metrics, level distribution, and per-prefecture coverage table (sortable).

### Changed
- Switched map rendering to Google Maps (JS API + Data Layer).
- Prefecture boundaries now load from simplified TopoJSON (`data/prefectures2025.topo.json`) instead of the huge GeoJSON.
- UI refreshed to a more futuristic / geek style (glass, neon accents, motion).

### Removed
- Click-to-mark interactions and localStorage-based marking workflow.
- Leaflet dependency and OpenStreetMap tile layers.

## 2026-04-11

### Added
- CSV template generation (`data/visits.csv`) and multi-level coloring model for municipalities.

