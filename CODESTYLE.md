# CODESTYLE.md — RF-Site-Survey Kodstandard

> Denna fil är sanningskällan för kodstil, datastrukturer och arkitekturbeslut.
> Alla sessioner ska läsa denna fil innan kodändringar görs.

---

## Språk

- **UI-text**: Alltid ENGELSKA
- **Kodkommentarer**: Alltid SVENSKA med korrekt å, ä, ö
- **Git commits**: Engelska (conventional commits: `feat:`, `fix:`, `refactor:`)

## Tailwind-standard

| Element | Klass |
|---------|-------|
| Borders | `border-gray-200` (aldrig 100/300) |
| Rounded | `rounded-md` (aldrig lg) |
| Bakgrund | `bg-gray-50` (aldrig gray-100) |
| Text | `text-sm` som default |
| Formulärfält | `w-full max-w-sm` |
| Knappar | shadcn `<Button>` — aldrig raw `<button>` (undantag: toolbar/dropdown-triggers) |
| Tabellrader | Alternating `bg-white` / `bg-gray-50` |
| Focus | `focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400` |

## Signalvärden — dBm genomgående

- **Primärt**: `rssi` (number, dBm, negativt, t.ex. -65)
- **Legacy**: `signalStrength` (0-100%) — behålls för bakåtkompatibilitet
- **Fallback**: `rssi < 0 ? rssi : -100 + (signalStrength / 100) * 60`
- **Normalisering i shader**: `clamp((signal + 100.0) / 60.0, 0.0, 1.0)` → -100 dBm = 0, -40 dBm = 1
- **Visa alltid dBm** i UI (PopupDetails, Toast, annotations)
- **Aldrig procent** i nya komponenter

## Datastruktur

### Site-format (nytt, primärt)
```json
{
  "site": {
    "name": "Projektnamn",
    "floors": [{
      "name": "Floor 1",
      "floorplanImageName": "bild.png",
      "floorplanImagePath": "/media/bild.png",
      "dimensions": { "width": 1024, "height": 768 },
      "walls": [],
      "surveyPoints": [],
      "pixelsPerMeter": 85,
      "nextPointNum": 1,
      "rotation": 0
    }],
    "activeFloorIndex": 0
  },
  "iperfServerAdrs": "",
  "testDuration": 10,
  ...globala settings
}
```

### Flat format (legacy, migreras automatiskt)
```json
{
  "floorplanImageName": "bild.png",
  "surveyPoints": [],
  "walls": [],
  ...
}
```

### Survey Point
```typescript
{
  x: number;           // pixelkoordinat
  y: number;
  id: string;
  isEnabled: boolean;
  timestamp: number;
  wifiData: {
    rssi: number;      // dBm (PRIMÄRT)
    signalStrength: number; // 0-100% (legacy)
    ssid: string;
    bssid: string;
    channel: number;
    band: number;       // 2.4 eller 5
    noiseFloor?: number; // dBm
    snr?: number;        // dB
    channelUtilization?: number; // 0-100%
    ...
  };
  iperfData: { tcpDownload, tcpUpload, udpDownload, udpUpload };
  bandMeasurements?: [{ band: "2.4"|"5", signal: number, tcpDown?, tcpUp?, udpDown?, udpUp? }];
}
```

## API-routes

### Filnamn vs site.name
- Alla endpoints MÅSTE använda `findSurveyFile()` från `src/lib/survey-utils.ts`
- Matchar BÅDE filnamn OCH `site.name` i JSON
- Gäller: `/api/settings`, `/api/settings/poll`

### Error handling
```typescript
try {
  const filePath = await findSurveyFile(name);
  if (!filePath) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }
  // ...
} catch (err: unknown) {
  return NextResponse.json({ error: `Description: ${err}` }, { status: 500 });
}
```

## Heatmap-rendering

### Shader (ÄNDRA INTE utan goda skäl)
- IDW-vikt: `1/pow(distSq, u_pathLossExponent * 0.5)` med exponent 2.5
- Confidence: `clamp(weightTotal * u_radius * u_radius, 0.0, 1.0)`
- Input: dBm direkt (inte procent)
- Väggdämpning: subtraheras direkt i dBm

### Report och Survey MÅSTE spegla varandra
- Samma rssi-fallback
- Samma data-pipeline
- Samma renderer (mainRenderer → heatmapLayerRenderer → shader)

## Komponentmönster

### PopupDetails
- dBm som primärt signalvärde
- Noise floor, SNR, channel utilization om tillgängligt
- Interface visas
- TCP/UDP en gång vardera (bara om > 0)
- Dual-band utan "(connected)" — bara `X.X GHz: -XX dBm`

### Toast (NewToast)
- Ren Tailwind, ingen Radix Toast
- `bg-white border border-gray-200 rounded-md shadow-lg`
- shadcn Button för Cancel

### Settings
- Grupperat: Network, Measurement, Display, System
- shadcn Accordion för sektioner
- Buffered save (Save/Discard-knappar)

## Persistens

- **Senast valt projekt**: `localStorage("rf-survey-current-site")`
- **Globala settings**: `data/settings.json` (har prioritet över projekt-fil)
- **Projekt-data**: `data/surveys/<namn>.json`
- **Media**: `public/media/` (serveras via `/media/[filename]` dynamisk route)

## Filstruktur

```
src/
  app/
    api/           — API-routes (Next.js App Router)
    media/         — Dynamisk media-serving
    webGL/         — Shader, renderers
  components/      — React-komponenter
    ui/            — shadcn primitiver
  hooks/           — Custom hooks (useSyncPolling)
  lib/             — Utilities, types, server-logik
    survey-utils.ts — Delad findSurveyFile (alla API-routes)
    types.ts       — Alla TypeScript-typer
    fileHandler.ts — Klient-side fil-I/O (readSettingsFromFile etc.)
    server-utils.ts — Server-side utilities ("use server")
    iperfRunner.ts — Mätningslogik
data/
  surveys/         — Projekt-JSON-filer
  settings.json    — Globala settings
  media/           — (oanvänd, public/media/ används)
public/
  media/           — Ritningar/bilder
```

## Git

- Remote: `blckit` (INTE `origin` — origin = upstream `hnykda/wifi-heatmapper`)
- Branch: `dev`
- Pusha ALDRIG utan att `npx next lint` och `npm run build` passerar
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`

## RPi-specifikt

- Node: v24.15.0 via nvm (system-Node v18.19.1)
- `package.json` har `"type": "module"` → config-filer måste vara `.cjs`
- `install.sh` använder `su - $SERVICE_USER -c` (inte `sudo -u bash -c`) för nvm
- pm2 för processhantering
- Hotspot: NM dispatcher-script för fallback

---

*Uppdaterad 2026-04-18 av Robban*
