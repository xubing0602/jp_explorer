# Changelog

All notable changes to this project will be documented in this file.

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

