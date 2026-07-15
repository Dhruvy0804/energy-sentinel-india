# Energy Sentinel India

AI-powered energy supply chain resilience system for import-dependent economies.

## Problem

India imports most of its crude oil, and a large share of that supply passes through high-risk maritime corridors such as the Strait of Hormuz and the Red Sea/Suez route. A geopolitical shock, sanctions escalation, tanker shortage, or corridor disruption can quickly affect refinery run rates, domestic fuel prices, strategic reserves, and the wider economy.

Traditional supply-chain tools are usually reactive. They do not continuously combine geopolitical signals, shipping risk, crude compatibility, procurement options, and reserve drawdown planning into one executable response.

## Solution

Energy Sentinel India is an AI-driven command center that turns a crisis response into a managed, anticipatory workflow.

The system lets users:

- Monitor geopolitical and logistics risk signals.
- Score crude-import corridors by disruption probability.
- Simulate 60-day supply, price, refinery, and reserve impacts.
- Rank alternative crude suppliers and routes.
- Optimize Strategic Petroleum Reserve drawdown.
- Generate a decision memo for policymakers or procurement teams.

This is not a static UI. Metrics, charts, procurement rankings, and the memo are recomputed from scenario controls, intelligence text, supply-chain data, and optional spot-offer CSV uploads.

## Live Demo Mode

Recommended demo:

```powershell
npm run streamlit
```

Open:

```text
http://127.0.0.1:8501
```

## Streamlit Cloud Deployment

When deploying on Streamlit Cloud, select:

```text
streamlit_app.py
```

The required Python packages are listed in:

```text
requirements.txt
```

If the app shows a `ModuleNotFoundError`, reboot the app from Streamlit Cloud after pushing the latest `requirements.txt`.

Alternative vanilla HTML demo:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:5173
```

## Key Features

### 1. Geopolitical Risk Intelligence

The app parses an intelligence feed for terms related to:

- Strait of Hormuz disruption
- Red Sea and Houthi attacks
- Sanctions pressure
- OPEC+ production cuts
- Tanker and insurance stress
- Brent crude price shocks

These extracted signals modify the scenario risk model in real time.

### 2. Corridor Risk Scoring

The system scores major crude-import corridors:

- Hormuz Gulf
- Red Sea / Suez
- Russia / Black Sea
- Atlantic / Cape
- ASEAN East

Each corridor receives a disruption probability, at-risk volume, transit delay, and premium estimate.

### 3. Disruption Scenario Modelling

The model simulates a 60-day shock horizon and estimates:

- Supply gap in million barrels per day
- Alternative supply ramp-up
- Strategic reserve drawdown
- Remaining SPR cover days
- Pump price pressure
- Refinery run percentage

### 4. Adaptive Procurement Orchestrator

The procurement engine ranks replacement crude options using:

- Route risk
- ETA
- Spot premium
- Available volume
- Sanctions and OPEC exposure
- Tanker tightness
- Refinery crude-grade compatibility

Users can upload `sample-offers.csv` or their own spot-offer file to rerank the queue.

### 5. Strategic Reserve Optimizer

The reserve planner calculates drawdown schedules while preserving an emergency floor. It shows how long reserves can support the system under the selected disruption scenario.

### 6. Decision Memo Export

The Streamlit app generates a downloadable memo summarizing:

- Top risk corridor
- Recommended procurement action
- SPR drawdown plan
- Price and refinery impact
- Stabilization estimate

## Tech Stack

- Python
- Streamlit
- Pandas
- Plotly
- HTML/CSS/JavaScript fallback version
- Local CSV ingestion
- Explainable scenario and scoring engine

## Project Structure

```text
energy-sentinel-india/
├── streamlit_app.py       # Main Streamlit dashboard
├── sample-offers.csv      # Sample spot crude offer book
├── index.html             # Vanilla HTML fallback UI
├── styles.css             # Fallback UI styling
├── app.js                 # Fallback UI controller
├── data.js                # Local energy network data
├── engine.js              # JavaScript scenario engine
├── smoke-test.js          # Browser-path smoke test
├── package.json           # Run and test scripts
└── README.md              # Project documentation
```

## Run Tests

```powershell
npm test
```

This checks:

- JavaScript syntax
- Dashboard render smoke test
- Streamlit Python compile check

## CSV Upload Format

Use this header:

```csv
supplier,country,corridor,volume_mbd,premium_usd,eta_days,api,sulfur,grade,loading_port,india_port
```

Supported corridor values:

```text
hormuz
redsea
russia
atlantic
asean
```

## Demo Script for Judges

1. Open the Streamlit dashboard at `http://127.0.0.1:8501`.
2. Select `Compound Gulf Shock`.
3. Show how national import risk, supply gap, SPR cover, and executable reroute volume update.
4. Open the `Digital Twin` tab to show corridor risk on the map.
5. Open the `Procurement Orchestrator` tab to show ranked crude replacement options.
6. Upload `sample-offers.csv` to demonstrate dynamic market-offer ingestion.
7. Open the `Reserve Optimizer` tab to show the 60-day shock simulation.
8. Open the `Decision Memo` tab and download the generated memo.

## Production Extension

This hackathon prototype runs locally without API keys. For a real deployment, the same architecture can connect to:

- AIS vessel tracking APIs
- Commodity price APIs
- Sanctions registries
- News and geopolitical intelligence feeds
- Port congestion and tanker availability feeds
- Refinery ERP/inventory systems
- Government strategic reserve data

## Why It Matters

Energy security is not only about having reserves. It is about knowing when to draw them down, where replacement barrels can come from, whether refineries can process those grades, and how quickly procurement teams can act.

Energy Sentinel India provides that intelligence layer in one operational dashboard.
