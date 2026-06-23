<div align="center">

# 🌸 Nirvaya

### Bangladesh's first *predictive* personal safety intelligence platform

**Crime intelligence · Environmental risk analysis · Real-time emergency response**

*Avoiding risk **before** an incident can scar a life forever.*

![Stack](https://img.shields.io/badge/stack-PERN-b13a66)
![ML](https://img.shields.io/badge/AI-risk%20prediction-e11d48)
![Zones](https://img.shields.io/badge/coverage-682%20zones-2a9d6e)
![Status](https://img.shields.io/badge/status-prototype-e08700)

</div>

---

## 📖 Table of Contents

- [The Problem](#-the-problem)
- [What Nirvaya Does](#-what-nirvaya-does)
- [Key Features](#-key-features)
- [What Makes It Different](#-what-makes-it-different-key-innovations)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Results](#-results)
- [Contribution to National Security](#-contribution-to-national-security)
- [Limitations & Future Work](#-limitations--future-work)

---

## 🚨 The Problem

Bangladesh lacks a unified system that turns crime intelligence into **actionable safety guidance** for citizens. Existing safety apps only react *after* an emergency has already begun — exactly when a victim is least able to call for help, describe their location, or reach the police.

The scale of the problem is severe. According to documented human-rights monitoring data from ASK (Ain o Salish Kendra):

- **776 rape cases** were recorded over the 13 months up to February 2026 — nearly **two reported cases every day**, with almost half the victims being minors.
- Child rape data shows a sharp rise: **306 girls and 30 boys** were reported raped in the first seven months of 2025 alone — about **1.6 reported child-rape cases per day**.

These figures only reflect *reported* cases. Social repression, criticism, and fear of judgement mean the real scale is almost certainly higher.

Traditional safety methods all share the same fatal flaw — **they depend on the victim acting during the emergency**:

| # | Weakness of existing approaches |
|---|---------------------------------|
| 1 | SOS apps trigger *after* an incident — nothing prevents it |
| 2 | The victim may be unable to speak or use their phone |
| 3 | Emergency contacts may not know the victim's exact location |
| 4 | Police may not receive timely information |
| 5 | Navigation apps optimise for distance/traffic, **not personal safety** |
| 6 | Users are unaware when they're entering a high-risk zone |
| 7 | Crime reports are scattered and never converted into usable intelligence |

> There is a clear need for a digital safety system that provides **both preventive guidance and emergency response** — not one or the other.

---

##  What Nirvaya Does

Nirvaya is a predictive safety platform built around a single idea: **stop the incident before it happens, and respond instantly if it does.**

It continuously evaluates the risk level of locations across Bangladesh, recommends safer routes and travel times, warns users before they enter dangerous zones, and automatically escalates to an emergency when a user becomes unresponsive — transforming fragmented crime reports and environmental data into a living **national safety intelligence layer**.

```
Traditional apps:   Incident  →  SOS  →  Help
Nirvaya:            Risk Detection  →  Prevention  →  SOS (only if necessary)
```

---

## ✨ Key Features

| Feature | What it does |
|--------|--------------|
| 🆘 **Emergency SOS** | Shares the victim's **live location** with emergency contacts (via SMS — works even if they have no app installed) and the nearest police station (via dashboard). |
| 🗺️ **AI Safe Routing** | Recommends the *safest* path for a journey — not the shortest — using the risk model. |
| 🎙️ **Voice-Triggered SOS** | Activates hands-free when the user shouts the Bengali phrase **"সাহায্য করো" (Sahajyo koro)**, even with the phone in a bag or pocket. |
| 📍 **Live Risk Prediction** | While tracking is on, warns the user the moment they enter a high-risk zone. |
| ⏰ **Safe-Hour Recommendation** | Suggests the safest hours to travel through a given area. |
| 🧍 **Stationary-Risk Detection** | Detects when a user is motionless in a danger zone and auto-escalates if they don't respond. |
| 🧾 **Community Incident Reports** | Anonymous, location-tagged reports (stalking, snatching, poor lighting, etc.) that continuously enrich the dataset. |
| 🔥 **National Risk Heatmap** | Visualises the risk of **682 zones** across Bangladesh for better travel decisions. |

---

## 🚀 What Makes It Different (Key Innovations)

**1. Predictive safety instead of reactive safety**
Most apps wait for an incident. Nirvaya works to prevent it from happening in the first place.

**2. AI-powered safe routing**
Navigation systems optimise for shortest distance or fastest route. Nirvaya optimises for **personal safety** — turning navigation from *transportation intelligence* into *safety intelligence*.

**3. Autonomous emergency detection**
Most SOS systems depend entirely on human interaction. Nirvaya adds voice-triggered SOS, stationary-risk detection, and automated escalation — so help can arrive even when the victim **cannot touch their device**.

**4. National risk intelligence layer**
Crime data, environmental conditions, community reports, and temporal factors are fused into a single, continuously evolving national risk map.

---

## 🛠 How It Works

### AI Risk Prediction & Safe-Route Pipeline

The risk model is built in four phases, from raw news to a deployable classifier.

```mermaid
flowchart LR
    A[News scraping<br/>& deduping] --> B[news_articles.csv]
    B --> C[Match with 682<br/>predefined zones]
    C --> D[clean_incidents.csv]
    D --> E[Environmental data<br/>from OpenStreetMap]
    E --> F[environmental_features.csv]
    F --> G[Combine risk<br/>from both sources]
    D --> G
    G --> H[area_risk_training_data.csv]
    H --> I[Train ML model]
```

**Phase 1 — Training data preparation.** News articles are scraped and de-duplicated, matched against 682 predefined zones, and merged with environmental features pulled from OpenStreetMap.

**Phase 2 — Risk score generation.** For each zone, an incident-based risk score is computed from:
- number of incidents
- number of unique reports
- incident-type weight
- a **child/minor victim boost**
- counts of severe incidents (murder, kidnapping, sexual violence, robbery, harassment)

The incident risk is then blended with the environmental risk:

```
Final Base Risk  =  65% × Incident Risk  +  35% × Environmental Risk
```

**Phase 3 — Time-based risk expansion.** Risk isn't constant through the day. Each zone is expanded into time-based examples using **hour** and **day of week**, with risk rising after nightfall.

**Phase 4 — Model training.** A classifier learns to label zones **low / medium / high**, and the deployed API promotes highly confident high-risk predictions to **critical**. Input features are kept simple and API-compatible for fast inference.

### Stationary Risk Monitoring Pipeline

```mermaid
flowchart TD
    A[Track user location continuously] --> B[Predict risk periodically]
    B --> C[Calculate movement radius]
    C --> D[Measure stationary duration]
    D --> E{Stationary > 10 min<br/>in High/Critical zone?}
    E -- No --> A
    E -- Yes --> F[Request safety confirmation]
    F --> G{Response within 120s?}
    G -- Yes, I'm safe --> A
    G -- No response --> H[🆘 Trigger automatic SOS]
```

1. User location is tracked continuously.
2. Risk is predicted periodically.
3. Movement radius and stationary duration are measured.
4. If the user stays still for **> 10 minutes in a high/critical zone**, a safety confirmation is requested.
5. If there's **no response within 120 seconds**, an SOS is triggered automatically.

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React (Vite) — no-login, anonymous device IDs |
| **Backend** | Node.js + Express — microservice-style routes |
| **Database** | PostgreSQL |
| **ML / Risk Model** | Python (training pipeline → deployed risk-scoring API) |
| **Geospatial data** | OpenStreetMap (environmental features) |
| **Voice** | Web Speech API (Bengali keyword matching) |
| **Notifications** | SMS to emergency contacts · police dashboard integration |

> **PERN** = **P**ostgreSQL · **E**xpress · **R**eact · **N**ode

Nirvaya is fully **anonymous** — there is no user login. Each device is tracked through a generated device ID, so safety never requires surrendering identity.

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+
- **Python 3.11** (for the ML training pipeline)
- **Google Chrome** (Voice SOS uses the Web Speech API)

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/nirvaya.git
cd nirvaya

# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 2. Configure environment

Create `server/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/nirvaya
PORT=5000
```

Create `client/.env` (point the app at your API):

```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Set up the database

```bash
# create the database
createdb nirvaya

# run the schema + migrations
psql "$DATABASE_URL" -f server/migrations/schema.sql
psql "$DATABASE_URL" -f server/migrations/add_incident_reports.sql
psql "$DATABASE_URL" -f server/migrations/add_user_reports.sql
```

### 4. (Optional) Train / refresh the risk model

```bash
cd server/ml
python3.11 -m venv venv_tflite
source venv_tflite/bin/activate    # Windows: venv_tflite\Scripts\activate
pip install -r requirements.txt
python train_risk_model.py         # produces area_risk_training_data.csv + model
```

### 5. Run it

```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend
cd client && npm run dev
```

Open the printed local URL (Vite defaults to `http://localhost:5173`) **in Chrome** to enable Voice SOS.

---

## 🗂 Project Structure

```
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

## 📊 Results

Nirvaya successfully demonstrates an end-to-end predictive safety system:

- ✅ AI-based **area risk prediction**
- ✅ **Risk-aware route recommendation**
- ✅ **Safe travel-hour** recommendation
- ✅ Real-time **SOS tracking**
- ✅ Voice-triggered SOS via *"Sahajyo Koro"*
- ✅ Automatic **stationary-risk detection** and SOS escalation
- ✅ AI-assisted **evidence preservation**
- ✅ **Police dashboard** integration
- ✅ Time-aware **dynamic risk levels**
- ✅ Environmental + historical crime features
- ✅ Scalable, microservice-based architecture

**Routing example — Bashundhara R/A → Malibagh:**
The model recommends the route via the **Dhaka Elevated Expressway** over the shorter **Badda route**, because the shorter path has poor road conditions, low lighting at night, and higher historical evidence of crime. The shortest path is not always the safest — and Nirvaya knows the difference.

---

## 🛡 Contribution to National Security

Nirvaya strengthens national safety in four ways:

- **Citizen-level threat prevention** — predicts and warns users before they enter dangerous zones.
- **Community intelligence collection** — verified public reports continuously improve situational awareness.
- **Faster emergency response** — real-time SOS sharing reduces response latency.
- **Data-driven crime prevention** — aggregated risk intelligence helps law enforcement identify crime hotspots, recurring patterns, and vulnerable regions, and allocate resources more effectively.

---

## ⚠️ Limitations & Future Work

For this demonstration, Nirvaya was built as a **web application** rather than a native mobile app (mobile permissions introduced complications). As a result, continuous background tracking and always-on voice detection are limited by what browsers allow.

**The fix is clear:** a native mobile build. Mobile operating systems are far more generous with background activity, which would unlock fully continuous tracking and voice detection — the natural next step for Nirvaya.

---

<div align="center">

**Nirvaya** — turning scattered crime data into a shield for the people who need it most.

*Predict · Prevent · Protect*

</div>