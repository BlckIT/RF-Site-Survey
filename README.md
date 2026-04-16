# RF-Site-Survey

Professional RF site survey tool for wireless network planning and analysis. Upload floor plans, collect signal strength and throughput measurements, and generate detailed coverage heatmaps — all locally, no cloud required.

- Signal strength and throughput heatmaps with WebGL rendering
- Material-aware wall attenuation modeling for realistic propagation
- Chain-drawing wall editor with shift-snap and drag-to-adjust
- Multi-floor and multi-AP support
- Cross-platform: Windows, macOS, Linux
- All data stored locally in JSON — your data never leaves your machine

![heatmap example](docs/images/Heatmap.jpg)

## Quick Start

```bash
git clone https://github.com/BlckIT/RF-Site-Survey.git
cd RF-Site-Survey
npm install
npm run dev
```

Browse to [http://localhost:3000](http://localhost:3000).

## Requirements

- Node.js 20+ with npm
- Linux: `iw` and `nmcli` must be installed and in PATH
- Optional: `iperf3` client and server for throughput testing

## Usage

1. Upload a floor plan image or use the default
2. Click locations on the floor plan to measure signal strength
3. Optionally draw walls with material types for attenuation modeling
4. View the heatmap tab for coverage visualization
5. Export or review survey points in the data tab

## Wall Attenuation

RF-Site-Survey supports drawing walls on the floor plan with configurable material types (concrete, wood, glass, etc.). The heatmap algorithm accounts for signal attenuation through walls, giving a more realistic coverage picture than simple distance-based interpolation.

## Docker

```bash
docker build -t rf-site-survey .
docker run --net="host" --privileged \
  -v ./data:/app/data \
  -v ./media:/app/public/media \
  -v /var/run/dbus:/var/run/dbus \
  rf-site-survey
```

## iperf3 Throughput Testing

Install `iperf3` on both the survey laptop and a server machine. Start the server with `iperf3 -s`, then configure the server address in the Settings pane.

## Documentation

- [User Interface](docs/User_Interface.md)
- [Theory of Operation](docs/Theory_of_Operation.md)
- [FAQ](docs/FAQ.md)
- [Changelog](CHANGELOG.md)

## Credits

Fork of [wifi-heatmapper](https://github.com/hnykda/wifi-heatmapper) by @hnykda, inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap).

## License

See [LICENSE](LICENSE).
