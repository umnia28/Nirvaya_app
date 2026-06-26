from pathlib import Path
import time
import math
import requests
import pandas as pd
from tqdm import tqdm


BASE_DIR = Path(__file__).resolve().parent.parent

ZONES_PATH = BASE_DIR / "data" / "seed" / "zones_seed.csv"
OUT_PATH = BASE_DIR / "data" / "processed" / "environmental_features.csv"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

RADIUS_SMALL = 500      # for roads, lamps, markets, bus stops
RADIUS_POLICE = 3000    # for nearest police search

SLEEP_SECONDS = 1.0     # be polite to Overpass API
MAX_RETRIES = 3


def haversine_km(lat1, lon1, lat2, lon2):
    """
    Calculate distance between two lat/lon points in kilometers.
    """
    r = 6371.0

    lat1 = math.radians(float(lat1))
    lon1 = math.radians(float(lon1))
    lat2 = math.radians(float(lat2))
    lon2 = math.radians(float(lon2))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return r * c


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def run_overpass_query(query):
    """
    Runs one Overpass query with retry.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=90,
                headers={
                    "User-Agent": "NirvayaSafetyResearch/1.0"
                },
            )

            if response.status_code == 200:
                return response.json()

            print(f"Overpass status {response.status_code}. Attempt {attempt}/{MAX_RETRIES}")

        except Exception as error:
            print(f"Overpass error: {error}. Attempt {attempt}/{MAX_RETRIES}")

        time.sleep(3)

    return {"elements": []}


def get_osm_features(lat, lon):
    """
    Gets real OSM environmental features around one zone coordinate.
    """

    query = f"""
    [out:json][timeout:60];

    (
      node(around:{RADIUS_SMALL},{lat},{lon})["highway"="street_lamp"];

      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="primary"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="secondary"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="tertiary"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="residential"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="service"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="footway"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="path"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="pedestrian"];
      way(around:{RADIUS_SMALL},{lat},{lon})["highway"="unclassified"];

      node(around:{RADIUS_SMALL},{lat},{lon})["amenity"="bus_station"];
      way(around:{RADIUS_SMALL},{lat},{lon})["amenity"="bus_station"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["amenity"="bus_station"];

      node(around:{RADIUS_SMALL},{lat},{lon})["public_transport"="station"];
      way(around:{RADIUS_SMALL},{lat},{lon})["public_transport"="station"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["public_transport"="station"];

      node(around:{RADIUS_SMALL},{lat},{lon})["railway"="station"];
      way(around:{RADIUS_SMALL},{lat},{lon})["railway"="station"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["railway"="station"];

      node(around:{RADIUS_SMALL},{lat},{lon})["amenity"="marketplace"];
      way(around:{RADIUS_SMALL},{lat},{lon})["amenity"="marketplace"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["amenity"="marketplace"];

      node(around:{RADIUS_SMALL},{lat},{lon})["shop"];
      way(around:{RADIUS_SMALL},{lat},{lon})["shop"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["shop"];

      node(around:{RADIUS_SMALL},{lat},{lon})["amenity"="school"];
      way(around:{RADIUS_SMALL},{lat},{lon})["amenity"="school"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["amenity"="school"];

      node(around:{RADIUS_SMALL},{lat},{lon})["amenity"="college"];
      way(around:{RADIUS_SMALL},{lat},{lon})["amenity"="college"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["amenity"="college"];

      node(around:{RADIUS_SMALL},{lat},{lon})["amenity"="university"];
      way(around:{RADIUS_SMALL},{lat},{lon})["amenity"="university"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["amenity"="university"];

      node(around:{RADIUS_SMALL},{lat},{lon})["amenity"="hospital"];
      way(around:{RADIUS_SMALL},{lat},{lon})["amenity"="hospital"];
      relation(around:{RADIUS_SMALL},{lat},{lon})["amenity"="hospital"];

      node(around:{RADIUS_POLICE},{lat},{lon})["amenity"="police"];
      way(around:{RADIUS_POLICE},{lat},{lon})["amenity"="police"];
      relation(around:{RADIUS_POLICE},{lat},{lon})["amenity"="police"];
    );

    out center tags;
    """

    data = run_overpass_query(query)
    elements = data.get("elements", [])

    counts = {
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
        "nearest_police_distance_km": None,
    }

    police_distances = []

    for element in elements:
        tags = element.get("tags", {})

        highway = tags.get("highway")
        amenity = tags.get("amenity")
        public_transport = tags.get("public_transport")
        railway = tags.get("railway")

        if highway == "street_lamp":
            counts["street_lamp_count_500m"] += 1

        elif highway == "primary":
            counts["primary_road_count_500m"] += 1

        elif highway == "secondary":
            counts["secondary_road_count_500m"] += 1

        elif highway == "tertiary":
            counts["tertiary_road_count_500m"] += 1

        elif highway == "residential":
            counts["residential_road_count_500m"] += 1

        elif highway == "service":
            counts["service_road_count_500m"] += 1

        elif highway in ["footway", "path"]:
            counts["footway_path_count_500m"] += 1

        elif highway == "pedestrian":
            counts["pedestrian_road_count_500m"] += 1

        elif highway == "unclassified":
            counts["unclassified_road_count_500m"] += 1

        if amenity == "bus_station" or public_transport == "station":
            counts["bus_station_count_500m"] += 1

        if railway == "station":
            counts["rail_station_count_500m"] += 1

        if amenity == "marketplace":
            counts["market_count_500m"] += 1

        if "shop" in tags:
            counts["shop_count_500m"] += 1

        if amenity in ["school", "college", "university"]:
            counts["school_college_count_500m"] += 1

        if amenity == "hospital":
            counts["hospital_count_500m"] += 1

        if amenity == "police":
            counts["police_count_3km"] += 1

            if "lat" in element and "lon" in element:
                police_lat = element["lat"]
                police_lon = element["lon"]
            elif "center" in element:
                police_lat = element["center"]["lat"]
                police_lon = element["center"]["lon"]
            else:
                continue

            distance = haversine_km(lat, lon, police_lat, police_lon)
            police_distances.append(distance)

    if police_distances:
        counts["nearest_police_distance_km"] = round(min(police_distances), 3)
    else:
        counts["nearest_police_distance_km"] = 3.0

    return counts


def make_scores(features):
    """
    Converts raw OSM counts into ML-friendly 0-1 environmental scores.
    """

    street_lamps = features["street_lamp_count_500m"]

    primary = features["primary_road_count_500m"]
    secondary = features["secondary_road_count_500m"]
    tertiary = features["tertiary_road_count_500m"]
    residential = features["residential_road_count_500m"]
    service = features["service_road_count_500m"]
    footway_path = features["footway_path_count_500m"]
    pedestrian = features["pedestrian_road_count_500m"]
    unclassified = features["unclassified_road_count_500m"]

    bus = features["bus_station_count_500m"]
    rail = features["rail_station_count_500m"]
    market = features["market_count_500m"]
    shops = features["shop_count_500m"]
    schools = features["school_college_count_500m"]
    hospitals = features["hospital_count_500m"]

    police_distance = features["nearest_police_distance_km"]

    main_road_count = primary + secondary + tertiary
    small_road_count = service + footway_path + pedestrian + unclassified

    # More mapped lamps means better light score.
    # But OSM lamp data may be incomplete, so keep baseline at 0.45.
    light_score = clamp(0.45 + min(street_lamps, 20) / 20 * 0.45)

    # More primary/secondary/tertiary roads means better road quality.
    road_quality = clamp(0.35 + min(main_road_count, 12) / 12 * 0.50)

    # More service/path/footway roads means more alley/narrow-path density.
    alley_density = clamp(min(small_road_count, 20) / 20)

    # More transport hubs means higher movement/risk.
    transport_hub_score = clamp((bus + rail) / 5)

    # More shops/markets/schools/hospitals means public/crowded area.
    public_place_density = clamp((market * 2 + shops + schools + hospitals) / 30)

    # Farther police = higher risk.
    police_distance_risk = clamp(police_distance / 3.0)

    environmental_risk_score = (
        (1 - light_score) * 20
        + alley_density * 20
        + (1 - road_quality) * 15
        + transport_hub_score * 20
        + public_place_density * 15
        + police_distance_risk * 10
    )

    return {
        "light_score": round(light_score, 3),
        "road_quality": round(road_quality, 3),
        "alley_density": round(alley_density, 3),
        "transport_hub_score": round(transport_hub_score, 3),
        "public_place_density": round(public_place_density, 3),
        "police_distance_risk": round(police_distance_risk, 3),
        "environmental_risk_score": round(environmental_risk_score, 2),
    }


def main():
    if not ZONES_PATH.exists():
        raise FileNotFoundError(f"Missing file: {ZONES_PATH}")

    zones = pd.read_csv(ZONES_PATH)

    required_cols = ["district", "zone_name", "latitude", "longitude"]
    missing_cols = [col for col in required_cols if col not in zones.columns]

    if missing_cols:
        raise ValueError(f"zones_seed.csv missing columns: {missing_cols}")

    zones["latitude"] = pd.to_numeric(zones["latitude"], errors="coerce")
    zones["longitude"] = pd.to_numeric(zones["longitude"], errors="coerce")
    zones = zones.dropna(subset=["latitude", "longitude"]).copy()

    results = []

    for _, row in tqdm(zones.iterrows(), total=len(zones), desc="Fetching OSM environmental features"):
        district = row["district"]
        zone_name = row["zone_name"]
        lat = float(row["latitude"])
        lon = float(row["longitude"])

        raw_features = get_osm_features(lat, lon)
        scores = make_scores(raw_features)

        result = {
            "district": district,
            "zone_name": zone_name,
            "latitude": lat,
            "longitude": lon,
            **raw_features,
            **scores,
        }

        results.append(result)

        # Save progress after every zone, so you do not lose everything if it stops.
        pd.DataFrame(results).to_csv(OUT_PATH, index=False)

        time.sleep(SLEEP_SECONDS)

    out_df = pd.DataFrame(results)
    out_df.to_csv(OUT_PATH, index=False)

    print("\nSaved environmental features to:")
    print(OUT_PATH)
    print("\nRows:", len(out_df))
    print("\nColumns:")
    print(list(out_df.columns))
    print("\nPreview:")
    print(out_df.head())


if __name__ == "__main__":
    main()