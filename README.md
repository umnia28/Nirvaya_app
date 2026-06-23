<div align="center">

# Nirvaya

### AI-Powered Predictive Safety Platform for Women

**Predict Risk · Prevent Incidents · Protect Lives**

<br>

> ### Nirvaya doesn't just help people survive emergencies rather it helps them avoid them altogether.

<br>

![Stack](https://img.shields.io/badge/Stack-PERN-b13a66?style=for-the-badge)
![AI](https://img.shields.io/badge/AI-Risk_Prediction-e11d48?style=for-the-badge)
![Zones](https://img.shields.io/badge/682-Zones_Covered-2a9d6e?style=for-the-badge)
![SOS](https://img.shields.io/badge/Real--Time-SOS-9f1239?style=for-the-badge)
![Police](https://img.shields.io/badge/Police-Integration-8d2a50?style=for-the-badge)

<br>

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-Open_App-b13a66?style=for-the-badge)](https://nirvaya-app.vercel.app)

**Try it live → [nirvaya-app.vercel.app](https://nirvaya-app.vercel.app)**

</div>

<br>

<div align="center">

[Overview](#overview) ·
[Demo](#demo) ·
[Architecture](#system-architecture) ·
[The Problem](#the-problem) ·
[Why It's Different](#why-nirvaya-is-different) ·
[Why AI?](#why-ai) ·
[Features](#key-features) ·
[How It Works](#how-it-works) ·
[Tech Stack](#tech-stack) ·
[Getting Started](#getting-started)

</div>

---

## Overview

Nirvaya transforms **crime intelligence, environmental risk factors, and real-time community reports** into actionable safety guidance for citizens.

Unlike traditional safety applications that respond *after* an emergency begins, Nirvaya works proactively — identifying danger before a user enters it, recommending safer routes and travel times, and automatically escalating emergencies when the user is unable to act.

From route planning to emergency response, Nirvaya creates a continuously evolving **national safety intelligence layer** designed to make everyday movement safer.

> **The safest journey is the one where the emergency never happens.**

---

## Demo

**▶ Live app:** **[nirvaya-app.vercel.app](https://nirvaya-app.vercel.app)** — open in **Google Chrome** to enable Voice SOS (Web Speech API).

> **Note:** The live link hosts the **React frontend** (UI, navigation, and design system). Full emergency functionality — SOS dispatch, community reports, and live AI risk prediction — also requires the Express/PostgreSQL backend and the Python risk model to be running. To experience the complete stack, follow [Getting Started](#getting-started) to run it locally, or point `VITE_API_URL` at a deployed backend.

> Replace the placeholders below with real screenshots / GIFs from your build — judges weight a working visual heavily. Drop files into `docs/screenshots/` and update the paths.

<div align="center">

<table>
  <tr>
    <td align="center" width="50%">
      <b>Live SOS & Risk (Before Trigger)</b><br><br>
      <img src="client/docs/screenshots/SOS1.png" alt="SOS screen before trigger" width="250">
    </td>

    <td align="center" width="50%">
      <b>Live SOS & Risk (After Trigger)</b><br><br>
      <img src="client/docs/screenshots/SOS2.png" alt="SOS screen after trigger" width="250">
    </td>
  </tr>

  <tr>
    <td align="center" width="50%">
      <b>Safe Route Planner</b><br><br>
      <img src="client/docs/screenshots/SafeRoutes.png" alt="Safe routes" width="250">
    </td>

    <td align="center" width="50%">
      <b>National Heatmap</b><br><br>
      <img src="client/docs/screenshots/Safetyheatmap.png" alt="Heatmap" width="250">
    </td>
  </tr>
</table>

</div>

---

## System Architecture

```mermaid
flowchart LR
    subgraph Client["React App (Vite)"]
        UI["SOS · Safe Routes · Heatmap · Reports"]:::client
    end

    subgraph Server["Node.js + Express API"]
        SVC["Risk · SOS · Location · Reports services"]:::api
    end

    subgraph Intelligence["Python Risk Model"]
        MODEL["Trained classifier<br/>low / medium / high / critical"]:::ml
    end

    DB[("PostgreSQL")]:::db
    OSM["OpenStreetMap"]:::ext
    SMS["SMS Gateway"]:::ext
    POLICE["Police Dashboard"]:::ext

    UI -->|x-device-id| SVC
    SVC --> DB
    SVC -->|risk score request| MODEL
    MODEL --> DB
    OSM -->|environmental features| Intelligence
    SVC -->|live location| SMS
    SVC -->|alerts| POLICE

    classDef client fill:#fdeef3,stroke:#b13a66,color:#8d2a50,font-weight:bold;
    classDef api fill:#ffffff,stroke:#b13a66,color:#3c1f2d,font-weight:bold;
    classDef ml fill:#b13a66,stroke:#8d2a50,color:#ffffff,font-weight:bold;
    classDef db fill:#fff4e0,stroke:#e08700,color:#7a4a00,font-weight:bold;
    classDef ext fill:#f4f0f2,stroke:#97707f,color:#3c1f2d;
```

A **no-login**, anonymous architecture: each device is tracked through a generated device ID (`x-device-id`), so safety never requires surrendering identity.

---

## The Problem

Bangladesh lacks a unified system that turns crime intelligence into **actionable safety guidance** for citizens. Existing safety apps only react *after* an emergency has begun — exactly when a victim is least able to call for help, describe their location, or reach the police.

The scale is severe. According to documented human-rights monitoring data from **ASK (Ain o Salish Kendra)**:

- **776 rape cases** recorded over the 13 months up to February 2026 — nearly **two reported cases every day**, with almost half the victims being minors.
- **306 girls and 30 boys** reported raped in the first seven months of 2025 alone — about **1.6 reported child-rape cases per day**.

These reflect only *reported* cases. Social repression, criticism, and fear of judgement mean the real scale is almost certainly higher.

Traditional safety methods share the same fatal flaw — **they depend on the victim acting during the emergency**:

| # | Weakness of existing approaches |
|:--:|---------------------------------|
| 1 | SOS apps trigger *after* an incident — nothing prevents it |
| 2 | The victim may be unable to speak or use their phone |
| 3 | Emergency contacts may not know the victim's exact location |
| 4 | Police may not receive timely information |
| 5 | Navigation apps optimise for distance/traffic, **not personal safety** |
| 6 | Users are unaware when they're entering a high-risk zone |
| 7 | Crime reports are scattered and never converted into usable intelligence |

### From Reactive Safety to Predictive Safety

Current safety systems operate on a single assumption:

```text
Traditional:   Something bad happens  →  User triggers SOS  →  Help arrives
Nirvaya:       Risk Detection  →  Prevention  →  Early Warning  →  Automated Response
```

But during a real emergency, victims may be unable to reach their phone, communicate their location, or call for help. By continuously evaluating **location risk, travel conditions, time-based patterns, environmental factors, and community intelligence**, Nirvaya helps users avoid dangerous situations before they become emergencies.

And when prevention fails, Nirvaya automatically activates a **multi-layer emergency response** — voice-triggered SOS, live location sharing, stationary-risk detection, and police dashboard integration.

---

## Why Nirvaya Is Different

<table>
<tr>
<td width="50%" valign="top">

#### Predictive intelligence, not emergency reaction
Most safety platforms begin working *after* an incident occurs. Nirvaya begins working *before* it happens.

</td>
<td width="50%" valign="top">

#### Safety-aware navigation
Traditional navigation optimises for speed and distance. Nirvaya introduces a new optimisation objective: **personal safety**.

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### Autonomous emergency response
Voice-triggered SOS, inactivity detection, and automated escalation ensure assistance can be requested even when users **cannot interact with their devices**.

</td>
<td width="50%" valign="top">

#### National safety intelligence layer
Crime reports, environmental conditions, temporal patterns, community intelligence, and user reports combine into a unified risk network covering **682 zones** across Bangladesh.

</td>
</tr>
<tr>
<td colspan="2" valign="top">

#### Self-improving risk model
Every validated community report strengthens the platform, enabling the system to become **more accurate as adoption grows**.

</td>
</tr>
</table>

---

## Why AI?

A fair question for any "AI" project: *does this actually need machine learning, or would a few `if` statements do?* For Nirvaya, the answer is structural.

- **Risk is multi-factor and non-linear.** A zone's danger depends on incident counts, incident *types*, child/minor involvement, environmental conditions, the hour of day, and the day of week — all interacting. Hand-tuned thresholds can't capture how these combine, but a trained model learns the weighting from data.
- **It can't be hand-authored at scale.** Nirvaya covers **682 zones**, each expanded across time-of-day and day-of-week. That's tens of thousands of risk states — far beyond what static rules can maintain or keep consistent.
- **Crime data is sparse and under-reported.** A model generalises across similar zones and conditions to estimate risk even where direct reports are thin — something a lookup table simply can't do.
- **Risk shifts with time and context.** The same street can be safe at noon and dangerous at midnight. The model treats time as a first-class feature, so predictions adapt rather than staying fixed.
- **It improves with use.** Each validated community report becomes new training signal, so accuracy compounds as adoption grows — a feedback loop rules don't have.

In short, AI isn't decoration here — it's what turns fragmented, incomplete crime data into a coherent, continuously improving risk map.

---

## Key Features

| Feature | What it does |
|---------|--------------|
| **Emergency SOS** | Shares the victim's **live location** with emergency contacts (via SMS — works even with no app installed) and the nearest police station via dashboard. |
| **AI Safe Routing** | Recommends the *safest* path for a journey — not the shortest — using the risk model. |
| **Voice-Triggered SOS** | Activates hands-free when the user shouts the Bengali phrase **"সাহায্য করো" (Sahajyo koro)**, even with the phone in a bag or pocket. |
| **Live Risk Prediction** | While tracking is on, warns the user the moment they enter a high-risk zone. |
| **Safe-Hour Recommendation** | Suggests the safest hours to travel through a given area. |
| **Stationary-Risk Detection** | Detects when a user is motionless in a danger zone and auto-escalates if they don't respond. |
| **Community Incident Reports** | Anonymous, location-tagged reports (stalking, snatching, poor lighting, …) that continuously enrich the dataset. |
| **National Risk Heatmap** | Visualises the risk of **682 zones** across Bangladesh for better travel decisions. |

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
| **Frontend** | React (Vite) — no-login, anonymous device IDs · deployed on **Vercel** |
| **Backend** | Node.js + Express — microservice-style routes |
| **Database** | PostgreSQL |
| **ML / Risk Model** | Python (training pipeline → deployed risk-scoring API) |
| **Geospatial data** | OpenStreetMap (environmental features) |
| **Voice** | Web Speech API (Bengali keyword matching) |
| **Notifications** | SMS to emergency contacts · police dashboard integration |

> **PERN** = **P**ostgreSQL · **E**xpress · **R**eact · **N**ode.

---

## Getting Started

> **Just want to see it?** The frontend is live at **[nirvaya-app.vercel.app](https://nirvaya-app.vercel.app)** — open it in Chrome. For the full stack (SOS, reports, live AI risk), run it locally with the steps below.

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

> On the Vercel deployment, set `VITE_API_URL` as an environment variable pointing to your hosted backend so the live frontend can reach the API.

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
├── client/                  # React + Vite frontend (deployed on Vercel)
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

## Potential National Impact

- **Citizen-level threat prevention** — predicts and warns users before they enter dangerous zones.
- **Community intelligence collection** — verified public reports continuously improve situational awareness.
- **Faster emergency response** — real-time SOS sharing reduces response latency.
- **Data-driven crime prevention** — aggregated risk intelligence helps authorities identify crime hotspots, recurring patterns, and vulnerable regions, and allocate resources more effectively.
- **A safer public for everyone** — as adoption grows, the national risk map sharpens, compounding the safety benefit for every user.

---

## Roadmap

For this demonstration, Nirvaya was built as a **web application** rather than a native mobile app (mobile permissions introduced complications), which limits continuous background tracking and always-on voice detection to what browsers allow.

**Next steps:**

- **Native mobile apps (Android / iOS)** — unlock fully continuous background tracking and always-on voice detection.
- **Live police dashboard integration** — route SOS alerts directly to the nearest station in real time.
- **Expanded zone coverage** — extend beyond the initial 682 zones to full national coverage.
- **Continuous model retraining** — automated retraining pipelines fed by validated community reports.
- **Offline-resilient SOS** — degraded-mode alerting when connectivity is poor.

---

<div align="center">

**Nirvaya** — turning scattered crime data into a shield for the people who need it most.

**Predict · Prevent · Protect**

**[▶ Open the live app](https://nirvaya-app.vercel.app)**

</div>