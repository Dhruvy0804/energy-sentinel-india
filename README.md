# Energy Sentinel India

AI-driven energy supply chain resilience dashboard for import-dependent economies.

## What It Does

Energy Sentinel India is a browser-based decision system for India's crude oil import resilience. It continuously recomputes:

- Corridor disruption probability for Hormuz, Red Sea/Suez, Russia/Black Sea, Atlantic/Cape, and ASEAN routes.
- 60 day supply-gap, price-pressure, refinery-run, inflation, and GDP-drag projections.
- Executable procurement rerouting recommendations by crude source, route, volume, ETA, premium, and refinery fit.
- Strategic Petroleum Reserve drawdown schedule and remaining cover.
- Exportable decision memo for crisis rooms or hackathon judging.

The app is not a static mockup. Every metric is generated in `engine.js` from the current scenario sliders, pasted intelligence feed, base energy-network data, and optional imported spot-offer CSV.

It is built with vanilla HTML, CSS, and JavaScript. No React, build tooling, or dependency install is required for the demo.

## Run Streamlit Demo

Recommended for hackathon presentation:

```powershell
npm run streamlit
```

Then open:

```text
http://127.0.0.1:8501
```

## Run Vanilla HTML Demo

Open `index.html` in a browser.

No install step is required. The app uses plain HTML, CSS, and JavaScript so it works offline during a hackathon demo.

Recommended local server:

```powershell
npm start
```

Then open:

```text
http://localhost:5173
```

## Verify

```powershell
npm test
```

## Demo Flow

1. Choose `Compound Gulf Shock` from the scenario selector.
2. Move `Hormuz disruption`, `Sanctions pressure`, or `Tanker availability stress`; the map, risk bars, charts, procurement queue, reserve plan, and decision brief update immediately.
3. Paste a fresh headline or click `Demo Shock`; the local intelligence parser extracts risk signals and updates the scenario.
4. Import `sample-offers.csv`; the procurement agent adds those live spot offers and reranks recommendations.
5. Click `Export Memo`; the system generates an actionable text memo with the current decisions and procurement queue.

## Architecture

- `data.js`: Energy network knowledge base with corridors, suppliers, route exposures, crude grades, and refinery compatibility anchors.
- `engine.js`: Agentic computation layer.
  - Risk Intelligence Agent: extracts risk signals from text and scores corridors.
  - Scenario Modeller: simulates 60 days of disruption, mitigation, prices, refinery runs, inflation, and GDP drag.
  - Adaptive Procurement Orchestrator: ranks replacement crude by route risk, premium, ETA, availability, and refinery fit.
  - Strategic Reserve Optimizer: schedules SPR drawdown while preserving an emergency floor.
- `app.js`: UI controller, SVG digital twin rendering, charts, table updates, CSV import, and memo export.
- `styles.css`: Responsive operations-dashboard design.
- `streamlit_app.py`: Streamlit command-center version with Plotly charts, map, tables, controls, and memo export.

## Spot Offer CSV Format

Use this header:

```csv
supplier,country,corridor,volume_mbd,premium_usd,eta_days,api,sulfur,grade,loading_port,india_port
```

Supported corridors:

- `hormuz`
- `redsea`
- `russia`
- `atlantic`
- `asean`

## Hackathon Notes

This project is designed for a live demo without API keys. For production, connect `engine.js` inputs to AIS vessel feeds, sanctions registries, market data APIs, refinery inventory systems, and news/RAG pipelines. The scoring functions are explainable and intentionally modular so those live feeds can replace or augment the current local signal parser.
