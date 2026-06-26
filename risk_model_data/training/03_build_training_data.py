from pathlib import Path

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent

CLEAN_INCIDENTS_PATH = BASE_DIR / "data" / "processed" / "clean_incidents.csv"
ZONES_PATH = BASE_DIR / "data" / "seed" / "zones_seed.csv"
ENV_PATH = BASE_DIR / "data" / "processed" / "environmental_features.csv"
OUTPUT_PATH = BASE_DIR / "data" / "processed" / "area_risk_training_data.csv"

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


INCIDENT_WEIGHT = 0.70
ENVIRONMENT_WEIGHT = 0.30


INCIDENT_WEIGHTS = {
    "sexual_violence": 5,
    "murder": 5,
    "kidnapping": 5,
    "violence": 4,
    "robbery": 3,
    "harassment": 3,
    "suspicious_activity": 2,
}


ENV_FEATURE_COLS = [
    "street_lamp_count_500m",
    "primary_road_count_500m",
    "secondary_road_count_500m",
    "tertiary_road_count_500m",
    "residential_road_count_500m",
    "service_road_count_500m",
    "footway_path_count_500m",
    "pedestrian_road_count_500m",
    "unclassified_road_count_500m",
    "bus_station_count_500m",
    "rail_station_count_500m",
    "market_count_500m",
    "shop_count_500m",
    "school_college_count_500m",
    "hospital_count_500m",
    "police_count_3km",
    "nearest_police_distance_km",
    "light_score",
    "road_quality",
    "alley_density",
    "transport_hub_score",
    "public_place_density",
    "police_distance_risk",
    "environmental_risk_score",
]


def risk_level_from_score(score):
    score = float(score)

    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"

    return "low"


def parse_bool(value):
    value = str(value).strip().lower()
    return value in ["true", "t", "1", "yes"]


def clean_key(value):
    return str(value).strip().lower()


def clean_incidents(df):
    df = df.copy()

    required_cols = [
        "url",
        "district",
        "zone_name",
        "latitude",
        "longitude",
        "incident_type",
        "victim_age",
        "severity",
        "match_score",
        "match_type",
    ]

    missing = [col for col in required_cols if col not in df.columns]

    if missing:
        raise ValueError(f"clean_incidents.csv missing columns: {missing}")

    df["url"] = df["url"].astype(str).str.strip()
    df["district"] = df["district"].astype(str).str.strip()
    df["zone_name"] = df["zone_name"].astype(str).str.strip()
    df["incident_type"] = df["incident_type"].astype(str).str.strip()
    df["match_type"] = df["match_type"].astype(str).str.strip()

    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["severity"] = pd.to_numeric(df["severity"], errors="coerce").fillna(1)
    df["victim_age"] = pd.to_numeric(df["victim_age"], errors="coerce")
    df["match_score"] = pd.to_numeric(df["match_score"], errors="coerce").fillna(0)

    df = df.dropna(subset=["district", "zone_name", "latitude", "longitude"])

    df = df[
        df["latitude"].between(-90, 90)
        & df["longitude"].between(-180, 180)
    ].copy()

    df = df.drop_duplicates(
        subset=["url", "district", "zone_name", "incident_type"]
    ).copy()

    return df


def remove_bad_matches(df):
    df = df.copy()

    before = len(df)

    district_counts = df.groupby("url")["district"].nunique()
    good_urls = district_counts[district_counts <= 3].index
    df = df[df["url"].isin(good_urls)].copy()

    selected_groups = []

    for url, group in df.groupby("url"):
        zone_alias_rows = group[group["match_type"] == "zone_alias"].copy()

        if len(zone_alias_rows) > 0:
            selected = zone_alias_rows.sort_values(
                by="match_score",
                ascending=False,
            ).head(2)
        else:
            selected = group.sort_values(
                by="match_score",
                ascending=False,
            ).head(1)

        selected_groups.append(selected)

    if selected_groups:
        df = pd.concat(selected_groups, ignore_index=True)
    else:
        df = pd.DataFrame(columns=df.columns)

    after = len(df)

    print("Rows before bad-match cleanup:", before)
    print("Rows after bad-match cleanup:", after)

    return df


def make_incident_risk_score(row):
    """
    Historical incident-only score.
    Environmental score and time bonus are added later.
    """

    score = 0

    score += min(row["incident_count"] * 3, 15)
    score += min(row["unique_article_count"] * 4, 10)

    score += row["avg_severity"] * 4
    score += row["max_severity"] * 3

    score += min(row["sexual_violence_count"] * 4, 9)
    score += min(row["murder_count"] * 5, 10)
    score += min(row["kidnapping_count"] * 3, 8)
    score += min(row["violence_count"] * 2, 8)
    score += min(row["robbery_count"] * 2, 5)
    score += min(row["harassment_count"] * 1, 4)
    score += min(row["suspicious_activity_count"] * 0.5, 3)

    return round(min(float(score), 100), 2)


def build_zone_summary(df):
    df = df.copy()

    df["incident_weight"] = df["incident_type"].map(INCIDENT_WEIGHTS).fillna(2)

    df["minor_victim_boost"] = np.where(
        df["victim_age"].notna() & (df["victim_age"] < 18),
        1.3,
        1.0,
    )

    df["incident_score"] = (
        df["severity"]
        * df["incident_weight"]
        * df["minor_victim_boost"]
    )

    zone_df = (
        df.groupby(["district", "zone_name", "latitude", "longitude"])
        .agg(
            incident_count=("url", "count"),
            unique_article_count=("url", "nunique"),
            avg_severity=("severity", "mean"),
            max_severity=("severity", "max"),
            total_incident_score=("incident_score", "sum"),
            sexual_violence_count=(
                "incident_type",
                lambda x: (x == "sexual_violence").sum(),
            ),
            murder_count=(
                "incident_type",
                lambda x: (x == "murder").sum(),
            ),
            kidnapping_count=(
                "incident_type",
                lambda x: (x == "kidnapping").sum(),
            ),
            violence_count=(
                "incident_type",
                lambda x: (x == "violence").sum(),
            ),
            robbery_count=(
                "incident_type",
                lambda x: (x == "robbery").sum(),
            ),
            harassment_count=(
                "incident_type",
                lambda x: (x == "harassment").sum(),
            ),
            suspicious_activity_count=(
                "incident_type",
                lambda x: (x == "suspicious_activity").sum(),
            ),
        )
        .reset_index()
    )

    zone_df["incident_risk_score"] = zone_df.apply(
        make_incident_risk_score,
        axis=1,
    )

    return zone_df


def load_all_seed_zones():
    if not ZONES_PATH.exists():
        raise FileNotFoundError(f"Missing zones seed file: {ZONES_PATH}")

    zones = pd.read_csv(ZONES_PATH)

    required_cols = ["district", "zone_name", "latitude", "longitude"]
    missing = [col for col in required_cols if col not in zones.columns]

    if missing:
        raise ValueError(f"zones_seed.csv missing columns: {missing}")

    zones = zones.copy()

    zones["district"] = zones["district"].astype(str).str.strip()
    zones["zone_name"] = zones["zone_name"].astype(str).str.strip()
    zones["latitude"] = pd.to_numeric(zones["latitude"], errors="coerce")
    zones["longitude"] = pd.to_numeric(zones["longitude"], errors="coerce")

    zones = zones.dropna(subset=["latitude", "longitude"]).copy()

    zones = zones[
        zones["latitude"].between(-90, 90)
        & zones["longitude"].between(-180, 180)
    ].copy()

    if "geocoded" in zones.columns:
        zones["geocoded_bool"] = zones["geocoded"].apply(parse_bool)
        zones = zones[zones["geocoded_bool"] == True].copy()

    zones = zones[
        ["district", "zone_name", "latitude", "longitude"]
    ].drop_duplicates()

    return zones


def add_no_incident_low_zones(zone_summary):
    all_zones = load_all_seed_zones()

    used = set(zip(zone_summary["district"], zone_summary["zone_name"]))

    low_rows = []

    for _, zone in all_zones.iterrows():
        key = (zone["district"], zone["zone_name"])

        if key in used:
            continue

        low_rows.append(
            {
                "district": zone["district"],
                "zone_name": zone["zone_name"],
                "latitude": zone["latitude"],
                "longitude": zone["longitude"],

                "incident_count": 0,
                "unique_article_count": 0,
                "avg_severity": 0,
                "max_severity": 0,
                "total_incident_score": 0,

                "sexual_violence_count": 0,
                "murder_count": 0,
                "kidnapping_count": 0,
                "violence_count": 0,
                "robbery_count": 0,
                "harassment_count": 0,
                "suspicious_activity_count": 0,

                # No reports does not mean zero risk.
                # Keep small baseline.
                "incident_risk_score": 10,
            }
        )

    low_df = pd.DataFrame(low_rows)

    print("No-incident low zones added:", len(low_df))

    if len(low_df) == 0:
        return zone_summary

    return pd.concat([zone_summary, low_df], ignore_index=True)


def load_environmental_features():
    if not ENV_PATH.exists():
        raise FileNotFoundError(
            f"Missing environmental features file: {ENV_PATH}\n"
            "Run 03_get_osm_environmental_features.py first."
        )

    env = pd.read_csv(ENV_PATH)

    required_cols = ["district", "zone_name", "latitude", "longitude", "environmental_risk_score"]
    missing = [col for col in required_cols if col not in env.columns]

    if missing:
        raise ValueError(f"environmental_features.csv missing columns: {missing}")

    env = env.copy()

    env["district"] = env["district"].astype(str).str.strip()
    env["zone_name"] = env["zone_name"].astype(str).str.strip()
    env["district_key"] = env["district"].apply(clean_key)
    env["zone_key"] = env["zone_name"].apply(clean_key)

    for col in ENV_FEATURE_COLS:
        if col not in env.columns:
            env[col] = np.nan

        env[col] = pd.to_numeric(env[col], errors="coerce")

    env = env[
        ["district_key", "zone_key"] + ENV_FEATURE_COLS
    ].drop_duplicates(subset=["district_key", "zone_key"])

    return env


def add_environmental_features(zone_summary):
    zone_summary = zone_summary.copy()

    env = load_environmental_features()

    zone_summary["district_key"] = zone_summary["district"].apply(clean_key)
    zone_summary["zone_key"] = zone_summary["zone_name"].apply(clean_key)

    merged = zone_summary.merge(
        env,
        on=["district_key", "zone_key"],
        how="left",
    )

    missing_env_count = merged["environmental_risk_score"].isna().sum()

    print("\nEnvironmental feature merge:")
    print("Rows:", len(merged))
    print("Rows missing environmental features:", missing_env_count)

    # Safe defaults if some zones are missing from environmental_features.csv.
    fill_defaults = {
        "street_lamp_count_500m": 0,
        "primary_road_count_500m": 0,
        "secondary_road_count_500m": 0,
        "tertiary_road_count_500m": 0,
        "residential_road_count_500m": 0,
        "service_road_count_500m": 0,
        "footway_path_count_500m": 0,
        "pedestrian_road_count_500m": 0,
        "unclassified_road_count_500m": 0,
        "bus_station_count_500m": 0,
        "rail_station_count_500m": 0,
        "market_count_500m": 0,
        "shop_count_500m": 0,
        "school_college_count_500m": 0,
        "hospital_count_500m": 0,
        "police_count_3km": 0,
        "nearest_police_distance_km": 3.0,
        "light_score": 0.45,
        "road_quality": 0.50,
        "alley_density": 0.30,
        "transport_hub_score": 0.15,
        "public_place_density": 0.25,
        "police_distance_risk": 0.50,
        "environmental_risk_score": 30.0,
    }

    for col, default_value in fill_defaults.items():
        merged[col] = merged[col].fillna(default_value)

    merged["base_risk_score"] = (
        merged["incident_risk_score"] * INCIDENT_WEIGHT
        + merged["environmental_risk_score"] * ENVIRONMENT_WEIGHT
    ).clip(0, 100).round(2)

    merged["base_risk_level"] = merged["base_risk_score"].apply(
        risk_level_from_score
    )

    merged = merged.drop(columns=["district_key", "zone_key"])

    print("\nRisk score after combining incident + environment:")
    print(merged["base_risk_score"].describe())

    print("\nBase class counts before time expansion:")
    print(merged["base_risk_level"].value_counts())

    return merged


def apply_time_bonus(base_score, hour, day_of_week):
    """
    Adds rule-based time risk.

    hour:
      0-4   = late night / early morning
      18-23 = evening/night movement period

    day_of_week:
      Monday = 0
      Friday = 4
      Saturday = 5
    """

    score = float(base_score)

    if 0 <= hour <= 4:
        score += 12
    elif 18 <= hour <= 23:
        score += 8

    if day_of_week in [4, 5]:
        score += 4

    return round(min(score, 100), 2)


def expand_with_time_features(df):
    """
    Expands each zone into multiple time/day examples.

    This keeps your FastAPI compatible because your API already sends:
      latitude, longitude, district, hour, day_of_week
    """

    hours = [2, 8, 14, 19, 22]
    days = [0, 2, 4, 5]

    rows = []

    for _, row in df.iterrows():
        for hour in hours:
            for day_of_week in days:
                new_row = row.copy()

                new_score = apply_time_bonus(
                    row["base_risk_score"],
                    hour,
                    day_of_week,
                )

                new_row["hour"] = hour
                new_row["day_of_week"] = day_of_week
                new_row["risk_score"] = new_score
                new_row["risk_level"] = risk_level_from_score(new_score)

                rows.append(new_row)

    expanded = pd.DataFrame(rows)

    print("\nAfter time expansion:")
    print("Rows:", len(expanded))
    print(expanded["risk_level"].value_counts())

    return expanded


def add_sample_weights(df):
    df = df.copy()

    df["sample_weight"] = (
        1
        + df["incident_count"] * 0.25
        + df["total_incident_score"] * 0.05
        + df["sexual_violence_count"] * 0.8
        + df["murder_count"] * 0.8
        + df["kidnapping_count"] * 0.8
        + df["violence_count"] * 0.4
    )

    # Environmental danger should slightly increase learning importance,
    # but not dominate incident-based evidence.
    df["sample_weight"] += df["environmental_risk_score"] / 100 * 0.5

    if "hour" in df.columns:
        df["sample_weight"] += np.where(df["hour"].between(0, 4), 0.6, 0)
        df["sample_weight"] += np.where(df["hour"].between(18, 23), 0.4, 0)

    if "day_of_week" in df.columns:
        df["sample_weight"] += np.where(df["day_of_week"].isin([4, 5]), 0.3, 0)

    df["sample_weight"] = df["sample_weight"].clip(1, 10).round(3)

    return df


def main():
    if not CLEAN_INCIDENTS_PATH.exists():
        raise FileNotFoundError(f"Missing clean incidents: {CLEAN_INCIDENTS_PATH}")

    incidents = pd.read_csv(CLEAN_INCIDENTS_PATH)

    print("Raw incident rows:", len(incidents))

    incidents = clean_incidents(incidents)
    incidents = remove_bad_matches(incidents)

    print("Final incident rows used:", len(incidents))
    print("Unique URLs used:", incidents["url"].nunique())
    print("Unique districts used:", incidents["district"].nunique())
    print("Unique zones used:", incidents["zone_name"].nunique())

    print("\nMatch types used:")
    print(incidents["match_type"].value_counts())

    zone_summary = build_zone_summary(incidents)

    zone_summary = add_no_incident_low_zones(zone_summary)

    # Main new step:
    # merge OSM environmental features and combine:
    # 70% incident risk + 30% environmental risk
    zone_summary = add_environmental_features(zone_summary)

    training_df = zone_summary.copy()

    training_df["risk_score"] = training_df["base_risk_score"]
    training_df["risk_level"] = training_df["base_risk_level"]

    # Create hour/day rows.
    training_df = expand_with_time_features(training_df)

    training_df = add_sample_weights(training_df)

    final_cols = [
        "district",
        "zone_name",
        "latitude",
        "longitude",
        "hour",
        "day_of_week",

        "incident_count",
        "unique_article_count",
        "avg_severity",
        "max_severity",
        "total_incident_score",

        "sexual_violence_count",
        "murder_count",
        "kidnapping_count",
        "violence_count",
        "robbery_count",
        "harassment_count",
        "suspicious_activity_count",

        "incident_risk_score",

        "street_lamp_count_500m",
        "primary_road_count_500m",
        "secondary_road_count_500m",
        "tertiary_road_count_500m",
        "residential_road_count_500m",
        "service_road_count_500m",
        "footway_path_count_500m",
        "pedestrian_road_count_500m",
        "unclassified_road_count_500m",
        "bus_station_count_500m",
        "rail_station_count_500m",
        "market_count_500m",
        "shop_count_500m",
        "school_college_count_500m",
        "hospital_count_500m",
        "police_count_3km",
        "nearest_police_distance_km",
        "light_score",
        "road_quality",
        "alley_density",
        "transport_hub_score",
        "public_place_density",
        "police_distance_risk",
        "environmental_risk_score",

        "base_risk_score",
        "base_risk_level",
        "risk_score",
        "risk_level",
        "sample_weight",
    ]

    training_df = training_df[final_cols].copy()

    training_df.to_csv(OUTPUT_PATH, index=False)

    print("\nTraining rows:", len(training_df))

    print("\nTraining class counts:")
    print(training_df["risk_level"].value_counts())

    print("\nTime distribution:")
    print(training_df["hour"].value_counts().sort_index())

    print("\nDay distribution:")
    print(training_df["day_of_week"].value_counts().sort_index())

    print("\nIncident risk summary:")
    print(training_df["incident_risk_score"].describe())

    print("\nEnvironmental risk summary:")
    print(training_df["environmental_risk_score"].describe())

    print("\nFinal risk score summary:")
    print(training_df["risk_score"].describe())

    print("\nSample weight summary:")
    print(training_df["sample_weight"].describe())

    print("\nSaved training data to:")
    print(OUTPUT_PATH)

    print("\nPreview:")
    print(training_df.head(20))


if __name__ == "__main__":
    main()