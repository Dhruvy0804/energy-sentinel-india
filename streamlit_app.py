from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import StringIO
import math
import re

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st


px.defaults.template = "plotly_white"


st.set_page_config(
    page_title="Energy Sentinel India",
    page_icon="ES",
    layout="wide",
    initial_sidebar_state="expanded",
)


CONSTANTS = {
    "import_demand_mbd": 4.85,
    "national_consumption_mbd": 5.32,
    "spr_cover_days": 9.5,
    "max_drawdown_mbd": 0.72,
    "emergency_stock_floor_days": 2.2,
    "refinery_run_baseline": 92,
}

PRESETS = {
    "Baseline Watch": {
        "hormuz": 22,
        "redsea": 18,
        "sanctions": 24,
        "opec": 3,
        "tanker": 18,
        "brent": 2,
        "text": "Routine maritime security warnings in the Persian Gulf. Tanker availability is adequate, Brent is range-bound, and Indian refiners continue term lifting with small spot adjustments.",
    },
    "Hormuz Partial Closure": {
        "hormuz": 72,
        "redsea": 25,
        "sanctions": 50,
        "opec": 5,
        "tanker": 56,
        "brent": 13,
        "text": "Naval alert and insurance notices indicate a partial closure risk around the Strait of Hormuz. Several Gulf cargoes are delayed, war-risk premiums are rising, and refiners are seeking replacement barrels.",
    },
    "Red Sea Shipping Suspension": {
        "hormuz": 28,
        "redsea": 78,
        "sanctions": 30,
        "opec": 2,
        "tanker": 49,
        "brent": 9,
        "text": "Houthi attacks force more tankers away from Red Sea and Suez lanes. India-bound West African and Atlantic Basin flows face longer Cape routing, higher freight, and port bunching.",
    },
    "Sanctions Shock": {
        "hormuz": 38,
        "redsea": 22,
        "sanctions": 82,
        "opec": 4,
        "tanker": 44,
        "brent": 11,
        "text": "Renewed sanctions enforcement targets shadow fleet activity and Iranian-linked shipments. Middle East sour crude availability tightens and spot sour premiums rise.",
    },
    "Compound Gulf Shock": {
        "hormuz": 86,
        "redsea": 70,
        "sanctions": 77,
        "opec": 12,
        "tanker": 82,
        "brent": 21,
        "text": "Compound Gulf shock: US-Iran standoff escalates, Hormuz transits slow, sanctions enforcement increases, Houthi Red Sea attacks continue, and OPEC+ signals an emergency supply cut.",
    },
}

CORRIDORS = [
    {
        "id": "hormuz",
        "name": "Hormuz Gulf",
        "import_share": 0.43,
        "base_risk": 0.29,
        "base_days": 7,
        "congestion": 0.31,
        "reroute_penalty_days": 14,
        "lon1": 51,
        "lat1": 27,
        "lon2": 72,
        "lat2": 22,
        "exposure": {"hormuz": 0.94, "redsea": 0.08, "sanctions": 0.48, "opec": 0.43, "tanker": 0.35, "brent": 0.18},
    },
    {
        "id": "redsea",
        "name": "Red Sea / Suez",
        "import_share": 0.11,
        "base_risk": 0.24,
        "base_days": 18,
        "congestion": 0.38,
        "reroute_penalty_days": 10,
        "lon1": 34,
        "lat1": 22,
        "lon2": 72,
        "lat2": 22,
        "exposure": {"hormuz": 0.08, "redsea": 0.92, "sanctions": 0.17, "opec": 0.08, "tanker": 0.46, "brent": 0.16},
    },
    {
        "id": "russia",
        "name": "Russia / Black Sea",
        "import_share": 0.31,
        "base_risk": 0.36,
        "base_days": 23,
        "congestion": 0.29,
        "reroute_penalty_days": 8,
        "lon1": 37,
        "lat1": 45,
        "lon2": 72,
        "lat2": 22,
        "exposure": {"hormuz": 0.04, "redsea": 0.26, "sanctions": 0.72, "opec": 0.12, "tanker": 0.38, "brent": 0.21},
    },
    {
        "id": "atlantic",
        "name": "Atlantic / Cape",
        "import_share": 0.10,
        "base_risk": 0.18,
        "base_days": 31,
        "congestion": 0.24,
        "reroute_penalty_days": 4,
        "lon1": 8,
        "lat1": -6,
        "lon2": 72,
        "lat2": 22,
        "exposure": {"hormuz": 0.02, "redsea": 0.34, "sanctions": 0.08, "opec": 0.04, "tanker": 0.44, "brent": 0.19},
    },
    {
        "id": "asean",
        "name": "ASEAN East",
        "import_share": 0.05,
        "base_risk": 0.16,
        "base_days": 10,
        "congestion": 0.21,
        "reroute_penalty_days": 3,
        "lon1": 103,
        "lat1": 4,
        "lon2": 80,
        "lat2": 13,
        "exposure": {"hormuz": 0.05, "redsea": 0.03, "sanctions": 0.05, "opec": 0.08, "tanker": 0.29, "brent": 0.12},
    },
]

SUPPLIERS = [
    ("Iraq Basra Medium", "Iraq", "hormuz", 0.96, 0.18, 29, 3.1, "medium sour", 1.4, 0.68, 0.76, 0.18, "Basra", "Mundra / Vadinar"),
    ("Saudi Arab Light", "Saudi Arabia", "hormuz", 0.72, 0.24, 33, 1.8, "light sour", 2.1, 0.79, 0.88, 0.12, "Ras Tanura", "Jamnagar / Mangalore"),
    ("UAE Murban", "UAE", "hormuz", 0.46, 0.22, 40, 0.8, "light sweet", 3.7, 0.82, 0.66, 0.08, "Fujairah", "Mangalore / Kochi"),
    ("Kuwait Export", "Kuwait", "hormuz", 0.31, 0.09, 31, 2.5, "medium sour", 1.8, 0.72, 0.80, 0.10, "Mina Al Ahmadi", "Paradip / Chennai"),
    ("Russia Urals", "Russia", "russia", 1.34, 0.27, 31, 1.6, "medium sour", -3.2, 0.58, 0.05, 0.82, "Primorsk / Novorossiysk", "Sikka / Paradip"),
    ("Nigeria Bonny Light", "Nigeria", "atlantic", 0.16, 0.18, 35, 0.2, "light sweet", 4.6, 0.54, 0.44, 0.04, "Bonny", "Mundra / Kochi"),
    ("Angola Girassol", "Angola", "atlantic", 0.11, 0.14, 31, 0.3, "medium sweet", 3.2, 0.61, 0.34, 0.02, "Luanda", "Mangalore / Vadinar"),
    ("Brazil Lula", "Brazil", "atlantic", 0.08, 0.21, 29, 0.3, "medium sweet", 2.6, 0.70, 0.00, 0.00, "Santos", "Mundra / Kochi"),
    ("Guyana Liza", "Guyana", "atlantic", 0.04, 0.16, 32, 0.6, "medium sweet", 4.0, 0.74, 0.00, 0.00, "Liza FPSO", "Sikka / Mangalore"),
    ("US Mars / WTI Blend", "United States", "atlantic", 0.12, 0.24, 31, 1.9, "medium sour", 5.4, 0.82, 0.00, 0.00, "US Gulf", "Mundra / Paradip"),
    ("Malaysia Tapis Blend", "Malaysia", "asean", 0.05, 0.05, 43, 0.1, "light sweet", 6.8, 0.78, 0.00, 0.00, "Kerteh", "Chennai / Kochi"),
]

REFINERIES = [
    ("Jamnagar", 1.36, 0.94, 0.91, 0.20, 70.1, 22.4),
    ("Vadinar", 0.41, 0.86, 0.82, 0.24, 69.7, 22.5),
    ("Mangalore", 0.31, 0.70, 0.64, 0.38, 74.8, 12.9),
    ("Kochi", 0.31, 0.73, 0.59, 0.42, 76.3, 9.9),
    ("Paradip", 0.30, 0.79, 0.76, 0.26, 86.7, 20.3),
    ("Panipat", 0.30, 0.72, 0.66, 0.34, 76.9, 29.4),
    ("Chennai", 0.21, 0.61, 0.52, 0.48, 80.2, 13.1),
    ("Visakhapatnam", 0.30, 0.68, 0.60, 0.38, 83.3, 17.7),
]


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def contains(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def extract_signals(text: str) -> dict:
    text = (text or "").lower()
    signal = {"hormuz": 0, "redsea": 0, "sanctions": 0, "opec": 0, "tanker": 0, "brent": 0, "labels": []}

    def add(key: str, amount: float, label: str) -> None:
        signal[key] += amount
        if label not in signal["labels"]:
            signal["labels"].append(label)

    if contains(text, ["hormuz", "persian gulf", "iran", "iranian", "gulf of oman"]):
        add("hormuz", 12, "Gulf corridor alert")
        if contains(text, ["closure", "blocked", "naval alert", "missile", "drone", "standoff", "escalat"]):
            add("hormuz", 18, "Hormuz transit stress")
            add("tanker", 7, "War-risk insurance")
    if contains(text, ["houthi", "red sea", "bab el", "suez", "yemen"]):
        add("redsea", 16, "Red Sea disruption")
        if contains(text, ["attack", "missile", "drone", "suspended", "reroute", "convoy", "delayed"]):
            add("redsea", 20, "Suez reroute pressure")
            add("tanker", 6, "Longer voyage time")
    if contains(text, ["sanction", "waiver", "shadow fleet", "enforcement", "secondary sanction"]):
        add("sanctions", 24, "Sanctions pressure")
        add("tanker", 4, "Compliance drag")
    if contains(text, ["opec", "opec+", "production cut", "emergency cut", "output cut"]):
        add("opec", 4, "OPEC+ supply action")
    if contains(text, ["war-risk", "war risk", "insurance", "premium", "tanker", "vlcc", "freight", "charter"]):
        add("tanker", 15, "Tanker market tightness")
    for match in re.finditer(r"[-+]?\d+(\.\d+)?\s*%", text):
        value = float(match.group(0).replace("%", ""))
        context = text[max(0, match.start() - 45) : match.end() + 45]
        if contains(context, ["brent", "crude", "oil", "price", "futures"]):
            add("brent", clamp(value, -15, 35), "Price shock")
        elif contains(context, ["cut", "opec", "output", "production"]):
            add("opec", clamp(value / 2, 0, 10), "Supply cut magnitude")
    if not signal["labels"]:
        signal["labels"].append("Low signal density")
    confidence = clamp(0.2 + len(signal["labels"]) * 0.13, 0.2, 0.9)
    signal["confidence"] = confidence
    return signal


def build_scenario(base: dict, text: str) -> dict:
    signal = extract_signals(text)
    return {
        "hormuz": clamp(base["hormuz"] + signal["hormuz"] * signal["confidence"], 0, 100),
        "redsea": clamp(base["redsea"] + signal["redsea"] * signal["confidence"], 0, 100),
        "sanctions": clamp(base["sanctions"] + signal["sanctions"] * signal["confidence"], 0, 100),
        "opec": clamp(base["opec"] + signal["opec"] * signal["confidence"], 0, 20),
        "tanker": clamp(base["tanker"] + signal["tanker"] * signal["confidence"], 0, 100),
        "brent": clamp(base["brent"] + signal["brent"] * signal["confidence"], -10, 35),
        "signal": signal,
    }


def score_corridors(scenario: dict) -> pd.DataFrame:
    rows = []
    for corridor in CORRIDORS:
        ex = corridor["exposure"]
        stress = (
            ex["hormuz"] * scenario["hormuz"] * 0.008
            + ex["redsea"] * scenario["redsea"] * 0.008
            + ex["sanctions"] * scenario["sanctions"] * 0.006
            + ex["opec"] * scenario["opec"] * 0.026
            + ex["tanker"] * scenario["tanker"] * 0.005
            + ex["brent"] * max(0, scenario["brent"]) * 0.01
        )
        risk = clamp((corridor["base_risk"] + stress + corridor["congestion"] * 0.08) * 100, 4, 98)
        rows.append(
            {
                **corridor,
                "risk": round(risk, 1),
                "status": "Critical" if risk >= 76 else "High" if risk >= 58 else "Guarded" if risk >= 38 else "Stable",
                "at_risk_mbd": round(CONSTANTS["import_demand_mbd"] * corridor["import_share"] * risk / 100, 2),
                "delay_days": round(corridor["base_days"] + corridor["reroute_penalty_days"] * risk / 100 + scenario["tanker"] * 0.055, 1),
                "premium": round(max(0, scenario["brent"]) * 0.18 + risk * 0.045 + scenario["tanker"] * 0.035, 1),
            }
        )
    return pd.DataFrame(rows).sort_values("risk", ascending=False)


def suppliers_df(offers: pd.DataFrame | None) -> pd.DataFrame:
    columns = [
        "source",
        "country",
        "corridor",
        "normal_mbd",
        "spare_mbd",
        "api",
        "sulfur",
        "grade",
        "base_premium",
        "reliability",
        "opec_exposure",
        "sanctions_exposure",
        "loading_port",
        "india_port",
    ]
    base = pd.DataFrame(SUPPLIERS, columns=columns)
    base["external_offer"] = False
    if offers is None or offers.empty:
        return base
    renamed = offers.rename(
        columns={
            "supplier": "source",
            "volume_mbd": "spare_mbd",
            "premium_usd": "base_premium",
            "loading_port": "loading_port",
            "india_port": "india_port",
        }
    ).copy()
    for column, default in {
        "normal_mbd": 0,
        "reliability": 0.64,
        "opec_exposure": 0.08,
        "sanctions_exposure": 0.05,
        "grade": "medium sweet",
        "api": 32,
        "sulfur": 1.1,
        "loading_port": "Spot loading",
        "india_port": "Flexible Indian coast",
    }.items():
        if column not in renamed:
            renamed[column] = default
    renamed["external_offer"] = True
    return pd.concat([base, renamed[base.columns]], ignore_index=True)


def refinery_fit(row: pd.Series) -> float:
    total_capacity = sum(item[1] for item in REFINERIES)
    weighted = 0
    sweetness = 1 if "sweet" in str(row.grade).lower() else 0 if "sour" in str(row.grade).lower() else 0.5
    sourness = clamp(float(row.sulfur) / 3.5, 0, 1)
    lightness = clamp((float(row.api) - 24) / 20, 0, 1)
    for _, capacity, complexity, sour_tolerance, light_need, _, _ in REFINERIES:
        sour_fit = 1 - abs(sour_tolerance - sourness)
        light_fit = 1 - abs(light_need - lightness * sweetness)
        complexity_fit = complexity * (0.65 + sourness * 0.35)
        fit = clamp(sour_fit * 0.42 + light_fit * 0.29 + complexity_fit * 0.21 + sweetness * 0.13 + (0.06 if row.api > 37 else 0), 0, 1)
        weighted += fit * capacity
    return weighted / total_capacity


def rank_procurement(scenario: dict, corridors: pd.DataFrame, offers: pd.DataFrame | None) -> pd.DataFrame:
    corridor_lookup = corridors.set_index("id").to_dict("index")
    rows = []
    for _, supplier in suppliers_df(offers).iterrows():
        corridor = corridor_lookup.get(supplier.corridor, corridor_lookup["atlantic"])
        route_risk = corridor["risk"] / 100
        sanctions_drag = supplier.sanctions_exposure * scenario["sanctions"] / 100
        opec_drag = supplier.opec_exposure * scenario["opec"] / 20
        tanker_drag = scenario["tanker"] / 100
        availability = clamp(1 - route_risk * 0.42 - sanctions_drag * 0.32 - opec_drag * 0.22 - tanker_drag * 0.14, 0.08, 1)
        if route_risk > 0.82 and not supplier.external_offer:
            availability *= 0.32 if supplier.country == "UAE" else 0.18
        available = clamp((supplier.spare_mbd + supplier.normal_mbd * (0 if supplier.external_offer else 0.1)) * availability, 0, 1.4)
        fit = refinery_fit(supplier)
        eta = corridor["delay_days"] + route_risk * 4 + tanker_drag * 5
        premium = supplier.base_premium + corridor["premium"] + max(0, scenario["brent"]) * 0.16 + tanker_drag * 3.1
        closure_penalty = 34 if route_risk > 0.9 else 22 if route_risk > 0.78 else 10 if route_risk > 0.68 else 0
        score = fit * 29 + supplier.reliability * 24 + available * 15 - route_risk * 28 - closure_penalty - max(0, premium) * 1.35 - eta * 0.36 + (5 if supplier.external_offer else 0)
        action = "Issue RFQ"
        if available >= 0.18 and fit > 0.73 and route_risk < 0.55:
            action = "Award spot cargo"
        if route_risk > 0.72:
            action = "Hold term lift"
        if supplier.external_offer:
            action = "Validate offer"
        if supplier.external_offer and route_risk < 0.75 and available >= 0.07:
            action = "Award spot cargo"
        rows.append(
            {
                "Source": supplier.source,
                "Country": supplier.country,
                "Corridor": corridor["name"],
                "Route": f"{supplier.loading_port} → {supplier.india_port}",
                "Available mbd": round(available, 2),
                "ETA days": round(eta, 1),
                "Premium $/bbl": round(premium, 1),
                "Refinery fit": round(fit * 100),
                "Score": round(clamp(score + 45, 0, 100), 1),
                "Action": action,
            }
        )
    ranked = pd.DataFrame(rows).query("`Available mbd` > 0.02").sort_values("Score", ascending=False).head(10).reset_index(drop=True)
    target = clamp(sum(corridors.at_risk_mbd * corridors.risk / 100) * 0.55 + scenario["tanker"] * 0.004, 0.18, 1.9)
    remaining = target
    allocations = []
    for _, row in ranked.iterrows():
        can_allocate = row.Action != "Hold term lift" and row.Score >= 10
        allocation = min(row["Available mbd"], max(0, remaining)) if can_allocate else 0
        remaining -= allocation
        allocations.append(round(allocation, 2))
    ranked.insert(0, "Rank", range(1, len(ranked) + 1))
    ranked["Allocated mbd"] = allocations
    return ranked


def simulate(scenario: dict, corridors: pd.DataFrame, procurement: pd.DataFrame) -> pd.DataFrame:
    gross = clamp(sum(corridors.at_risk_mbd * (0.28 + corridors.risk / 100 * 0.58)), 0, 3.1)
    reserve = CONSTANTS["spr_cover_days"] * CONSTANTS["national_consumption_mbd"]
    floor = CONSTANTS["emergency_stock_floor_days"] * CONSTANTS["national_consumption_mbd"]
    rows = []
    for day in range(1, 61):
        alternative = 0
        for _, p in procurement.iterrows():
            ramp = clamp((day - p["ETA days"] + 6) / 18, 0, 1)
            alternative += p["Allocated mbd"] * ramp
        raw_gap = max(0, gross * clamp(day / 9, 0.35, 1) * (1 + clamp((day - 25) / 80, 0, 0.2)) - alternative - clamp((day - 10) / 80, 0, 0.28) * gross)
        draw = min(CONSTANTS["max_drawdown_mbd"], raw_gap * 0.72) if raw_gap > 0.18 and reserve > floor else 0
        draw = min(draw, max(0, reserve - floor))
        reserve -= draw
        net_gap = max(0, raw_gap - draw)
        pump = max(0, scenario["brent"]) + net_gap / CONSTANTS["import_demand_mbd"] * 42 + scenario["opec"] * 0.85 + scenario["tanker"] * 0.08
        rows.append(
            {
                "Day": day,
                "Supply gap mbd": round(net_gap, 2),
                "Alternative supply mbd": round(alternative, 2),
                "SPR draw mbd": round(draw, 2),
                "SPR cover days": round(reserve / CONSTANTS["national_consumption_mbd"], 2),
                "Pump price pressure %": round(pump * 0.56, 1),
                "Refinery run %": round(clamp(CONSTANTS["refinery_run_baseline"] - net_gap / CONSTANTS["national_consumption_mbd"] * 55 - corridors.risk.mean() * 0.03, 58, 96), 1),
            }
        )
    return pd.DataFrame(rows)


def make_map(corridors: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    color_map = {"Critical": "#c2412d", "High": "#d97706", "Guarded": "#b58a00", "Stable": "#13856f"}
    for _, row in corridors.iterrows():
        fig.add_trace(
            go.Scattergeo(
                lon=[row.lon1, row.lon2],
                lat=[row.lat1, row.lat2],
                mode="lines+markers+text",
                text=[None, f"{row['name']} {row.risk:.0f}%"],
                textposition="top center",
                line={"width": 3 + row.risk / 18, "color": color_map[row.status]},
                marker={"size": [7, 12], "color": color_map[row.status], "line": {"width": 1, "color": "white"}},
                name=row["name"],
                hovertemplate=f"<b>{row['name']}</b><br>Risk {row.risk:.1f}%<br>At risk {row.at_risk_mbd:.2f} mbd<br>Delay {row.delay_days:.1f} days<extra></extra>",
            )
        )
    ref_df = pd.DataFrame(REFINERIES, columns=["Refinery", "capacity", "complexity", "sour", "light", "lon", "lat"])
    fig.add_trace(
        go.Scattergeo(
            lon=ref_df.lon,
            lat=ref_df.lat,
            mode="markers+text",
            text=ref_df.Refinery,
            textposition="bottom center",
            marker={"size": 8 + ref_df.capacity * 10, "color": "#246b9b", "line": {"width": 1.5, "color": "white"}},
            name="Indian refineries",
            hovertemplate="<b>%{text}</b><br>Capacity %{customdata:.2f} mbd<extra></extra>",
            customdata=ref_df.capacity,
        )
    )
    fig.update_geos(
        projection_type="natural earth",
        showcountries=True,
        countrycolor="#cad6dc",
        showland=True,
        landcolor="#edf3f0",
        showocean=True,
        oceancolor="#f7fbfc",
        lataxis_range=[-12, 52],
        lonaxis_range=[0, 112],
    )
    fig.update_layout(
        height=520,
        margin={"l": 0, "r": 0, "t": 0, "b": 0},
        showlegend=False,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return fig


def load_offer_file(uploaded) -> pd.DataFrame | None:
    if uploaded is None:
        return None
    return pd.read_csv(uploaded)


st.markdown(
    """
    <style>
    :root {
        color-scheme: light !important;
    }
    html, body, [data-testid="stAppViewContainer"], .stApp {
        color: #111b22 !important;
    }
    .stApp {
        background: linear-gradient(180deg, #f7fbfc 0%, #eef3f6 42%, #edf2f5 100%);
    }
    h1, h2, h3, h4, h5, h6, p, label, span, div[data-testid="stMarkdownContainer"] {
        color: #111b22;
    }
    div[data-testid="stMetric"] {
        background: #ffffff;
        border: 1px solid #d5e1e7;
        border-radius: 16px;
        padding: 18px 18px 14px;
        box-shadow: 0 14px 34px rgba(20, 33, 42, .08);
    }
    div[data-testid="stMetricValue"] {
        color: #0d1b22;
        font-weight: 800;
    }
    div[data-testid="stMetricLabel"],
    div[data-testid="stMetricDelta"] {
        color: #42505a !important;
    }
    section[data-testid="stSidebar"] {
        background: #ffffff !important;
        border-right: 1px solid #d9e4e9;
    }
    section[data-testid="stSidebar"] * {
        color: #111b22 !important;
    }
    section[data-testid="stSidebar"] textarea,
    section[data-testid="stSidebar"] input,
    section[data-testid="stSidebar"] div[data-baseweb="select"] > div,
    section[data-testid="stSidebar"] div[data-testid="stFileUploader"] section {
        background: #ffffff !important;
        color: #111b22 !important;
        border-color: #c9d7df !important;
    }
    div[data-baseweb="tab-list"] button p {
        color: #42505a !important;
    }
    div[data-baseweb="tab-list"] button[aria-selected="true"] p {
        color: #087264 !important;
    }
    .hero {
        padding: 22px 24px;
        border-radius: 20px;
        background: linear-gradient(135deg, #073f3a, #0b7567 48%, #1f6f97);
        color: white;
        box-shadow: 0 20px 50px rgba(7, 63, 58, .22);
        margin-bottom: 18px;
    }
    .hero h1, .hero p {
        color: #ffffff !important;
    }
    .hero h1 {
        margin: 0;
        font-size: 44px;
        letter-spacing: -0.03em;
    }
    .hero p {
        margin: 8px 0 0;
        color: rgba(255, 255, 255, .82);
        font-size: 16px;
    }
    .chip {
        display: inline-flex;
        margin: 0 8px 8px 0;
        padding: 6px 11px;
        border-radius: 999px;
        background: #e7f4f1;
        border: 1px solid #b9ded4;
        color: #0b5e52;
        font-weight: 700;
        font-size: 13px;
    }
    .brief {
        background: #ffffff;
        border: 1px solid #d5e1e7;
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 10px;
        box-shadow: 0 8px 22px rgba(20, 33, 42, .06);
    }
    </style>
    """,
    unsafe_allow_html=True,
)


st.markdown(
    """
    <div class="hero">
      <h1>Energy Sentinel India</h1>
      <p>AI command center for crude import risk, rerouting, refinery impact, and strategic reserve response.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("Signal Console")
    preset_name = st.selectbox("Scenario", list(PRESETS), index=4)
    preset = PRESETS[preset_name]
    text = st.text_area("Intelligence feed", value=preset["text"], height=150)
    uploaded = st.file_uploader("Spot offer book CSV", type=["csv"])
    offers = load_offer_file(uploaded)

    st.divider()
    st.caption("Scenario controls")
    base = {
        "hormuz": st.slider("Hormuz disruption", 0, 100, int(preset["hormuz"])),
        "redsea": st.slider("Red Sea disruption", 0, 100, int(preset["redsea"])),
        "sanctions": st.slider("Sanctions pressure", 0, 100, int(preset["sanctions"])),
        "opec": st.slider("OPEC+ emergency cut", 0, 20, int(preset["opec"])),
        "tanker": st.slider("Tanker availability stress", 0, 100, int(preset["tanker"])),
        "brent": st.slider("Brent one-session move", -10, 35, int(preset["brent"])),
    }

scenario = build_scenario(base, text)
corridors = score_corridors(scenario)
procurement = rank_procurement(scenario, corridors, offers)
timeline = simulate(scenario, corridors, procurement)

national_risk = round(float((corridors.risk * corridors.import_share).sum()), 1)
peak_gap = float(timeline["Supply gap mbd"].max())
final_cover = float(timeline["SPR cover days"].iloc[-1])
stabilization_candidates = timeline[(timeline["Day"] > 12) & (timeline["Supply gap mbd"] < 0.16)]
stabilization_day = int(stabilization_candidates.Day.iloc[0]) if not stabilization_candidates.empty else int(60 + math.ceil(peak_gap * 12))
allocated_volume = round(float(procurement["Allocated mbd"].sum()), 2)

metric_cols = st.columns(4)
metric_cols[0].metric("National Import Risk", f"{national_risk:.1f}%", corridors.status.iloc[0])
metric_cols[1].metric("Peak Supply Gap", f"{peak_gap:.2f} mbd", "60 day simulation")
metric_cols[2].metric("SPR Cover Day 60", f"{final_cover:.1f} days", "Optimized drawdown")
metric_cols[3].metric("Executable Reroute", f"{allocated_volume:.2f} mbd", f"Stabilize day {stabilization_day}")

st.markdown("#### Intelligence Signals")
st.markdown("".join(f"<span class='chip'>{label}</span>" for label in scenario["signal"]["labels"]), unsafe_allow_html=True)

tab_overview, tab_procurement, tab_reserves, tab_memo = st.tabs(
    ["Digital Twin", "Procurement Orchestrator", "Reserve Optimizer", "Decision Memo"]
)

with tab_overview:
    left, right = st.columns([1.45, 1])
    with left:
        st.plotly_chart(make_map(corridors), use_container_width=True)
    with right:
        st.subheader("Corridor Risk")
        fig = px.bar(
            corridors.sort_values("risk"),
            x="risk",
            y="name",
            orientation="h",
            color="status",
            color_discrete_map={"Critical": "#c2412d", "High": "#d97706", "Guarded": "#b58a00", "Stable": "#13856f"},
            labels={"risk": "Risk probability %", "name": ""},
            hover_data=["at_risk_mbd", "delay_days", "premium"],
        )
        fig.update_layout(height=360, margin={"l": 8, "r": 8, "t": 10, "b": 8}, showlegend=False)
        st.plotly_chart(fig, use_container_width=True)
        st.dataframe(
            corridors[["name", "status", "risk", "at_risk_mbd", "delay_days", "premium"]].rename(
                columns={"name": "Corridor", "risk": "Risk %", "at_risk_mbd": "At risk mbd", "delay_days": "Delay days", "premium": "Premium $/bbl"}
            ),
            use_container_width=True,
            hide_index=True,
        )

with tab_procurement:
    st.subheader("Adaptive Procurement Queue")
    st.dataframe(
        procurement[
            ["Rank", "Source", "Country", "Corridor", "Allocated mbd", "ETA days", "Premium $/bbl", "Refinery fit", "Score", "Action"]
        ],
        use_container_width=True,
        hide_index=True,
    )
    fig = px.scatter(
        procurement,
        x="ETA days",
        y="Premium $/bbl",
        size="Allocated mbd",
        color="Action",
        hover_name="Source",
        hover_data=["Corridor", "Refinery fit", "Score"],
        color_discrete_map={"Award spot cargo": "#087264", "Validate offer": "#246b9b", "Issue RFQ": "#d97706", "Hold term lift": "#c2412d"},
    )
    fig.update_layout(height=430, margin={"l": 8, "r": 8, "t": 10, "b": 8})
    st.plotly_chart(fig, use_container_width=True)

with tab_reserves:
    st.subheader("60 Day Impact and SPR Drawdown")
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=timeline.Day, y=timeline["Supply gap mbd"], name="Supply gap mbd", fill="tozeroy", line={"color": "#c2412d", "width": 3}))
    fig.add_trace(go.Scatter(x=timeline.Day, y=timeline["Alternative supply mbd"], name="Alternative supply mbd", line={"color": "#087264", "width": 3}))
    fig.add_trace(go.Scatter(x=timeline.Day, y=timeline["SPR cover days"], name="SPR cover days", yaxis="y2", line={"color": "#246b9b", "width": 3}))
    fig.update_layout(
        height=460,
        margin={"l": 8, "r": 8, "t": 10, "b": 8},
        yaxis={"title": "mbd"},
        yaxis2={"title": "SPR cover days", "overlaying": "y", "side": "right"},
        legend={"orientation": "h", "y": 1.08},
    )
    st.plotly_chart(fig, use_container_width=True)
    c1, c2 = st.columns(2)
    line_fig = go.Figure()
    line_fig.add_trace(go.Scatter(x=timeline.Day, y=timeline["Pump price pressure %"], name="Pump price pressure %", line={"color": "#9c6b00", "width": 3}))
    line_fig.add_trace(go.Scatter(x=timeline.Day, y=timeline["Refinery run %"], name="Refinery run %", line={"color": "#246b9b", "width": 3}))
    line_fig.update_layout(height=360, margin={"l": 8, "r": 8, "t": 10, "b": 8}, legend={"orientation": "h", "y": 1.08})
    c1.plotly_chart(line_fig, use_container_width=True)
    c2.dataframe(timeline.head(15), use_container_width=True, hide_index=True)

with tab_memo:
    top = corridors.iloc[0]
    first = procurement.iloc[0]
    brief = [
        f"Risk posture: {top['name']} is the binding corridor at {top.risk:.1f}% disruption probability, putting {top.at_risk_mbd:.2f} mbd at risk.",
        f"Procurement: allocate {allocated_volume:.2f} mbd across executable alternatives, led by {first.Source} via {first.Route}.",
        f"SPR: draw up to {timeline['SPR draw mbd'].max():.2f} mbd during the early shock while preserving {final_cover:.1f} days of cover by day 60.",
        f"Macroeconomic watch: peak pump-price pressure reaches {timeline['Pump price pressure %'].max():.1f}% and average refinery run is {timeline['Refinery run %'].head(30).mean():.1f}% in the first 30 days.",
        f"Stabilization: integrated rerouting closes the material gap around day {stabilization_day}; manual response benchmark would be around day {stabilization_day + 47}.",
    ]
    for line in brief:
        st.markdown(f"<div class='brief'>{line}</div>", unsafe_allow_html=True)

    memo = "\n".join(
        [
            "Energy Sentinel India Decision Memo",
            f"Generated: {datetime.now():%Y-%m-%d %H:%M:%S}",
            "",
            *[f"{idx + 1}. {line}" for idx, line in enumerate(brief)],
            "",
            procurement.to_csv(index=False),
        ]
    )
    st.download_button("Download decision memo", memo, "energy-sentinel-decision-memo.txt", "text/plain", use_container_width=True)
