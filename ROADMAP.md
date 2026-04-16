# RF-Site-Survey — Roadmap & Feature Tracker

---

## Target Application Flow

The application follows a three-step wizard flow. Each step builds on the previous.

### Step 1: Site Setup

The entry point. Users manage their survey projects here.

**Project overview**
- List of sites (projects), each with a name and description
- Each site contains one or more floor plans (multi-floor support)
- Create, rename, delete sites

**Floor plan import**
- Import from image (PNG, JPG) or PDF
- PDF import: extract embedded images, let user pick the actual floor plan drawing
- Support multiple floors per site — user can add/remove floors

**Scale calibration**
- After importing a floor plan, user places two points on the drawing and enters the real-world distance (meters)
- Many drawings already have a printed scale; otherwise user can measure a known feature (door opening, corridor)
- Scale is stored per floor and used for all physics calculations

**Wall definition**
- Manual wall drawing (existing chain-draw tool with snap, materials, etc.)
- Auto-detection option: analyze the floor plan image to identify walls automatically (edge detection)
  - Not expected to be perfect — provides a starting point for the user to adjust
- Wall materials with dB attenuation values (ITU-R P.1238)

### Step 2: Survey

The measurement phase. Requires a completed site setup (floor plan + scale at minimum).

**Configuration**
- Select WiFi interface
- Select target SSID (from scan dropdown)
- iperf3 server address and test duration
- Sudo password (Linux)

**Measurement**
- Click on floor plan to place measurement points (same as today)
- Switch between floors easily
- Real-time feedback during measurement (signal strength, throughput progress)

**Survey points panel (sidebar)**
- Overview of all measurement points across all floors
- Enable/disable individual points
- Delete points
- Shows key metrics per point (signal, throughput)

### Step 3: Report

Visualization and output. Requires at least some measurement points.

**Heatmap visualization**
- Signal strength heatmap (current implementation)
- Throughput heatmaps (TCP/UDP up/down)
- Gaussian blur for smooth visual appearance
- Wall overlay on heatmap
- Color scale and legend

**Visual adjustments**
- Radius, opacity, blur controls
- Gradient customization
- Toggle metrics and properties

**Report generation** (future)
- Export as PDF with heatmaps, floor plans, and summary statistics
- Include site info, measurement metadata, recommendations

---

## Completed Features

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

### v0.7 — Gaussian Blur + Cleanup (2026-04-16)
- [x] Gaussian blur post-processing (two-pass separable, WebGL 1.0 compatible)
- [x] Wired up existing `blur` setting (default 0.99) to WebGL pipeline
- [x] Removed distance decay (not useful without proper scale calibration)
- [x] Confidence-based opacity (edges fade out)

## Planned

### v0.8 — Scale Calibration
- [ ] Two-point scale tool (click two points, enter distance in meters)
- [ ] Store scale per floor plan
- [ ] Re-enable distance decay once scale is known

### v0.9 — AP Placement
- [ ] AP editor UI (click to place APs on floor plan)
- [ ] Link APs to BSSID from scan results
- [ ] Optional step — not required for basic heatmap
- [ ] Anisotropic propagation model from AP positions
- [ ] Significantly improved heatmap accuracy when AP positions are known

### Backlog / Future
- [ ] Multi-floor support (multiple floor plans per site)
- [ ] Site/project management (create, rename, delete sites)
- [ ] PDF import with image extraction (pdf.js)
- [ ] Auto wall detection from floor plan image (edge detection)
- [ ] Floor switching during survey
- [ ] Report generation (PDF export with heatmaps + summary)
- [ ] Frequency-band-specific WAF values (2.4 GHz vs 5 GHz vs 6 GHz)
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
