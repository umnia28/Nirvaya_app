<div align="center">

# Nirvaya

### Bangladesh's first *predictive* personal safety intelligence platform

**Crime intelligence · Environmental risk analysis · Real-time emergency response**

*Avoiding risk before an incident can scar a life forever.*

<br>

![Stack](https://img.shields.io/badge/stack-PERN-b13a66?style=for-the-badge)
![AI](https://img.shields.io/badge/AI-risk_prediction-e11d48?style=for-the-badge)
![Coverage](https://img.shields.io/badge/coverage-682_zones-2a9d6e?style=for-the-badge)
![Status](https://img.shields.io/badge/status-prototype-e08700?style=for-the-badge)

</div>

<br>

<div align="center">

[The Problem](#the-problem) ·
[What It Does](#what-nirvaya-does) ·
[Features](#key-features) ·
[Innovations](#what-makes-it-different) ·
[How It Works](#how-it-works) ·
[Tech Stack](#tech-stack) ·
[Getting Started](#getting-started) ·
[Results](#results)

</div>

---

## The Problem

Bangladesh lacks a unified system that turns crime intelligence into **actionable safety guidance** for citizens. Existing safety apps only react *after* an emergency has already begun — exactly when a victim is least able to call for help, describe their location, or reach the police.

The scale of the problem is severe. According to documented human-rights monitoring data from **ASK (Ain o Salish Kendra)**:

- **776 rape cases** were recorded over the 13 months up to February 2026 — nearly **two reported cases every day**, with almost half the victims being minors.
- **306 girls and 30 boys** were reported raped in the first seven months of 2025 alone — about **1.6 reported child-rape cases per day**.

These figures only reflect *reported* cases. Social repression, criticism, and fear of judgement mean the real scale is almost certainly higher.

Traditional safety methods all share the same fatal flaw — **they depend on the victim acting during the emergency**:

| # | Weakness of existing approaches |
|:--:|---------------------------------|
| 1 | SOS apps trigger *after* an incident — nothing prevents it |
| 2 | The victim may be unable to speak or use their phone |
| 3 | Emergency contacts may not know the victim's exact location |
| 4 | Police may not receive timely information |
| 5 | Navigation apps optimise for distance/traffic, **not personal safety** |
| 6 | Users are unaware when they're entering a high-risk zone |
| 7 | Crime reports are scattered and never converted into usable intelligence |

> **There is a clear need for a digital safety system that provides both preventive guidance *and* emergency response — not one or the other.**

---

## What Nirvaya Does

Nirvaya is a predictive safety platform built around a single idea: **stop the incident before it happens, and respond instantly if it does.**

It continuously evaluates the risk level of locations across Bangladesh, recommends safer routes and travel times, warns users before they enter dangerous zones, and automatically escalates to an emergency when a user becomes unresponsive — transforming fragmented crime reports and environmental data into a living **national safety intelligence layer**.

```text
Traditional apps:   Incident  ──►  SOS  ──►  Help
Nirvaya:            Risk Detection  ──►  Prevention  ──►  SOS  (only if necessary)
```

---

## Key Features

| Feature | What it does |
|---------|--------------|
| **Emergency SOS** | Shares the victim's **live location** with emergency contacts (via SMS — works even if they have no app installed) and the nearest police station via dashboard. |
| **AI Safe Routing** | Recommends the *safest* path for a journey — not the shortest — using the risk model. |
| **Voice-Triggered SOS** | Activates hands-free when the user shouts the Bengali phrase **"সাহায্য করো" (Sahajyo koro)**, even with the phone in a bag or pocket. |
| **Live Risk Prediction** | While tracking is on, warns the user the moment they enter a high-risk zone. |
| **Safe-Hour Recommendation** | Suggests the safest hours to travel through a given area. |
| **Stationary-Risk Detection** | Detects when a user is motionless in a danger zone and auto-escalates if they don't respond. |
| **Community Incident Reports** | Anonymous, location-tagged reports (stalking, snatching, poor lighting, …) that continuously enrich the dataset. |
| **National Risk Heatmap** | Visualises the risk of **682 zones** across Bangladesh for better travel decisions. |

---

## What Makes It Different

<table>
<tr>
<td width="50%" valign="top">

#### 1 · Predictive, not reactive
Most apps wait for an incident. Nirvaya works to prevent it from happening in the first place.

</td>
<td width="50%" valign="top">

#### 2 · AI-powered safe routing
Navigation systems optimise for distance or traffic. Nirvaya optimises for **personal safety** — turning *transportation intelligence* into *safety intelligence*.

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### 3 · Autonomous emergency detection
Voice-triggered SOS, stationary-risk detection, and automated escalation mean help can arrive even when the victim **cannot touch their device**.

</td>
<td width="50%" valign="top">

#### 4 · National risk intelligence layer
Crime data, environmental conditions, community reports, and temporal factors fuse into a single, continuously evolving national risk map.

</td>
</tr>
</table>

---

## How It Works

### AI Risk Prediction & Safe-Route Pipeline

The risk model is built in four phases, from raw news to a deployable classifier.

```mermaid
flowchart TD
    A[News scraping &amp; deduping]:::step --> B[news_articles.csv]:::data
    B --> C[Match with 682 predefined zones]:::step
    C --> D[clean_incidents.csv]:::data
    D --> E[Environmental data from OpenStreetMap]:::step
    E --> F[environmental_features.csv]:::data
    F --> G[Combine risk from both sources]:::step
    G --> H[area_risk_training_data.csv]:::data
    H --> I[Train ML model]:::accent

    classDef step fill:#ffffff,stroke:#e4b9cb,color:#3c1f2d;
    classDef data fill:#fdeef3,stroke:#b13a66,color:#8d2a50,font-weight:bold;
    classDef accent fill:#b13a66,stroke:#8d2a50,color:#ffffff,font-weight:bold;
```

**Phase 1 — Training data preparation.** News articles are scraped and de-duplicated, matched against 682 predefined zones, and merged with environmental features pulled from OpenStreetMap.

**Phase 2 — Risk score generation.** For each zone, an incident-based risk score is computed from the number of incidents, number of unique reports, incident-type weight, a **child/minor victim boost**, and counts of severe incidents (murder, kidnapping, sexual violence, robbery, harassment). The incident risk is then blended with the environmental risk:

```text
Final Base Risk  =  65% × Incident Risk   +   35% × Environmental Risk
```

**Phase 3 — Time-based risk expansion.** Risk isn't constant through the day. Each zone is expanded into time-based examples using **hour** and **day of week**, with risk rising after nightfall.

**Phase 4 — Model training.** A classifier learns to label zones **low / medium / high**, and the deployed API promotes highly confident high-risk predictions to **critical**. Input features are kept simple and API-compatible for fast inference.

### Stationary Risk Monitoring Pipeline

```mermaid
flowchart TD
    A[Track user location continuously]:::step --> B[Predict risk periodically]:::step
    B --> C[Calculate movement radius]:::step
    C --> D[Measure stationary duration]:::step
    D --> E{Stationary &gt; 10 min<br/>in High/Critical zone?}:::decision
    E -- No --> A
    E -- Yes --> F[Request safety confirmation]:::step
    F --> G{Response within 120s?}:::decision
    G -- Yes, I'm safe --> A
    G -- No response --> H[Trigger automatic SOS]:::danger

    classDef step fill:#ffffff,stroke:#e4b9cb,color:#3c1f2d;
    classDef decision fill:#fff4e0,stroke:#e08700,color:#7a4a00,font-weight:bold;
    classDef danger fill:#fde5ec,stroke:#e11d48,color:#9f1239,font-weight:bold;
```

If the user stays still for more than **10 minutes** in a high/critical zone, a safety confirmation is requested. If there is **no response within 120 seconds**, an SOS is triggered automatically.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React (Vite) — no-login, anonymous device IDs |
| **Backend** | Node.js + Express — microservice-style routes |
| **Database** | PostgreSQL |
| **ML / Risk Model** | Python (training pipeline → deployed risk-scoring API) |
| **Geospatial data** | OpenStreetMap (environmental features) |
| **Voice** | Web Speech API (Bengali keyword matching) |
| **Notifications** | SMS to emergency contacts · police dashboard integration |

> **PERN** = **P**ostgreSQL · **E**xpress · **R**eact · **N**ode.
> Nirvaya is fully **anonymous** — there is no user login. Each device is tracked through a generated device ID, so safety never requires surrendering identity.

---

## Getting Started

**Prerequisites:** Node.js 18+ · PostgreSQL 14+ · Python 3.11 (for the ML pipeline) · Google Chrome (Voice SOS uses the Web Speech API).

**1. Clone & install**

```bash
git clone https://github.com/<your-username>/nirvaya.git
cd nirvaya

cd server  && npm install      # backend
cd ../client && npm install    # frontend
```

**2. Configure environment**

```bash
# server/.env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/nirvaya
PORT=5000

# client/.env
VITE_API_URL=http://localhost:5000/api
```

**3. Set up the database**

```bash
createdb nirvaya
psql "$DATABASE_URL" -f server/migrations/schema.sql
psql "$DATABASE_URL" -f server/migrations/add_incident_reports.sql
psql "$DATABASE_URL" -f server/migrations/add_user_reports.sql
```

**4. (Optional) Train the risk model**

```bash
cd server/ml
python3.11 -m venv venv_tflite
source venv_tflite/bin/activate      # Windows: venv_tflite\Scripts\activate
pip install -r requirements.txt
python train_risk_model.py
```

**5. Run it**

```bash
cd server && node index.js     # Terminal 1 — backend
cd client && npm run dev       # Terminal 2 — frontend
```

Open the printed local URL (Vite defaults to `http://localhost:5173`) **in Chrome** to enable Voice SOS.

---

## Project Structure

```text
nirvaya/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── pages/           # SosPage, HeatmapPage, SafeRoutesPage, SetupPage
│       ├── services/        # deviceService, localProfileService, config
│       └── ...
├── server/                  # Express backend
│   ├── routes/              # sos, location, reports, ...
│   ├── migrations/          # SQL schema + migrations
│   ├── ml/                  # risk-model training pipeline
│   └── index.js
└── README.md
```

---

## Results

Nirvaya demonstrates an end-to-end predictive safety system:

| | |
|---|---|
| AI-based **area risk prediction** | Voice-triggered SOS via *"Sahajyo Koro"* |
| **Risk-aware route** recommendation | Automatic **stationary-risk detection** & escalation |
| **Safe travel-hour** recommendation | AI-assisted **evidence preservation** |
| Real-time **SOS tracking** | **Police dashboard** integration |
| Time-aware **dynamic risk levels** | Scalable **microservice** architecture |

> **Routing example — Bashundhara R/A → Malibagh**
> The model recommends the route via the **Dhaka Elevated Expressway** over the shorter **Badda route**, because the shorter path has poor road conditions, low lighting at night, and higher historical evidence of crime.
> *The shortest path is not always the safest — and Nirvaya knows the difference.*

---

## Contribution to National Security

- **Citizen-level threat prevention** — predicts and warns users before they enter dangerous zones.
- **Community intelligence collection** — verified public reports continuously improve situational awareness.
- **Faster emergency response** — real-time SOS sharing reduces response latency.
- **Data-driven crime prevention** — aggregated risk intelligence helps law enforcement identify crime hotspots, recurring patterns, and vulnerable regions, and allocate resources more effectively.

---

## Limitations & Future Work

For this demonstration, Nirvaya was built as a **web application** rather than a native mobile app (mobile permissions introduced complications). As a result, continuous background tracking and always-on voice detection are limited by what browsers allow.

**The fix is clear:** a native mobile build. Mobile operating systems are far more generous with background activity, which would unlock fully continuous tracking and voice detection — the natural next step for Nirvaya.

---

<div align="center">

**Nirvaya** — turning scattered crime data into a shield for the people who need it most.

**Predict · Prevent · Protect**

</div>
