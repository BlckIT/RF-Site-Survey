# RF-Site-Survey — Roadmap & Feature Tracker

## Completed

### v0.1 — Fork & Rebrand (2026-04-16)
- [x] Forked from hnykda/wifi-heatmapper → BlckIT/RF-Site-Survey
- [x] Updated README, package.json with new branding

### v0.2 — Wall Editor (2026-04-16)
- [x] Chain-drawing walls with click-to-place
- [x] Shift-snap for horizontal/vertical walls
- [x] Drag-to-adjust endpoints
- [x] Right-click to delete walls
- [x] Wall splitting
- [x] Material presets (drywall, wood, glass, brick, concrete, metal, custom)
- [x] Material legend and color coding

### v0.3 — WiFi Interface & Target SSID (2026-04-16)
- [x] WiFi interface selector dropdown (for multi-adapter setups)
- [x] Target SSID dropdown with passive scanning (no connection required)
- [x] API endpoint `/api/wifi-interfaces` for listing adapters
- [x] API endpoint `/api/wifi-scan` for scanning SSIDs

### v0.4 — Bug Fixes (2026-04-16)
- [x] Sudo password quoting (special characters broke shell commands)
- [x] iperfRunner crash when not connected to WiFi (undefined.ssid)
- [x] Wall placement bug (couldn't start new chain)
- [x] Consistent UI styling across components

### v0.5 — Wall Snap & Room Drawing (2026-04-16)
- [x] Snap-to-close (auto-close rooms when last point is near first)
- [x] Snap to existing wall endpoints (connect walls precisely)
- [x] Shared endpoint drag (moving a corner moves all connected walls)
- [x] Visual feedback for snap targets (green=close, blue=endpoint)
- [x] Configurable snap radius (Advanced settings, default 8px)

### v0.6 — Physics-Based Propagation Model (2026-04-16)
- [x] dB-based wall attenuation (ITU-R P.1238 WAF model)
- [x] Signal attenuation applied to value, not interpolation weight
- [x] Industry-standard 5 GHz WAF values per material
- [x] Path loss exponent (default 2.5, renamed from u_power)
- [x] UI shows dB values instead of percentages

## In Progress

### v0.7 — Signal Decay & Opacity
- [ ] Distance-based signal decay from measurement points
- [ ] Improved min-opacity (lower confidence = more transparent)

## Planned

### v0.8 — AP Placement
- [ ] AP editor UI (click to place APs on floor plan)
- [ ] Link APs to BSSID from scan results
- [ ] Optional step — not required for basic heatmap
- [ ] Anisotropic propagation model from AP positions
- [ ] Significantly improved heatmap accuracy when AP positions are known

### Backlog
- [ ] Frequency-band-specific WAF values (2.4 GHz vs 5 GHz vs 6 GHz)
- [ ] Path loss exponent exposed in UI (HeatmapAdvancedConfig)
- [ ] Floor/ceiling attenuation for multi-story buildings
- [ ] Export survey data (PDF report, CSV)
- [ ] Multiple floor plans in one project
- [ ] AP coverage overlap visualization
- [ ] Channel interference heatmap
- [ ] Minimum signal threshold overlay (e.g. "below -67 dBm" zones)

## Technical Notes

### Propagation Model
- Based on ITU-R P.1238 indoor propagation model
- IDW interpolation with dB-based wall attenuation
- Signal conversion: percentage ↔ dBm (-100 to -40 dBm range)
- Fragment shader handles wall ray casting per-pixel in WebGL
- MAX_WALLS = 64 (WebGL uniform limit)

### Target Hardware
- Primary: Raspberry Pi 4 (VideoCore VI, OpenGL ES 3.1)
- Must remain performant on low-end hardware
- No full ray tracing — use measured data + physics-based interpolation

### Repository
- GitHub: BlckIT/RF-Site-Survey
- Branch: dev (active development), main (stable)
- Workflow: Robban pushes to dev, Lukas reviews and merges to main
