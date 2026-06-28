# training/01_match_zones_with_articles.py

from pathlib import Path
import ast
import re
import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent

NEWS_PATH = BASE_DIR / "data" / "processed" / "news_articles_deduped.csv"
ZONES_PATH = BASE_DIR / "data" / "seed" / "zones_seed.csv"
OUTPUT_PATH = BASE_DIR / "data" / "processed" / "clean_incidents.csv"

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


# ----------------------------
# District names and aliases
# ----------------------------

DISTRICT_ALIASES = {
    "Chapai Nawabganj": ["chapai nawabganj", "chapainawabganj", "nawabganj"],
    "Cox's Bazar": ["cox's bazar", "coxs bazar", "cox bazar"],
    "Jashore": ["jashore", "jessore"],
    "Barishal": ["barishal", "barisal"],
    "Cumilla": ["cumilla", "comilla"],
    "Chattogram": ["chattogram", "chittagong"],
    "Bogura": ["bogura", "bogra"],
    "Jhalokathi": ["jhalokathi", "jhalokati"],
}

ALL_DISTRICTS = [
    "Bagerhat",
    "Bandarban",
    "Barguna",
    "Barishal",
    "Bhola",
    "Bogura",
    "Brahmanbaria",
    "Chandpur",
    "Chapai Nawabganj",
    "Chattogram",
    "Chuadanga",
    "Cox's Bazar",
    "Cumilla",
    "Dhaka",
    "Dinajpur",
    "Faridpur",
    "Feni",
    "Gaibandha",
    "Gazipur",
    "Gopalganj",
    "Habiganj",
    "Jamalpur",
    "Jashore",
    "Jhalokathi",
    "Jhenaidah",
    "Joypurhat",
    "Khagrachhari",
    "Khulna",
    "Kishoreganj",
    "Kurigram",
    "Kushtia",
    "Lakshmipur",
    "Lalmonirhat",
    "Madaripur",
    "Magura",
    "Manikganj",
    "Meherpur",
    "Moulvibazar",
    "Munshiganj",
    "Mymensingh",
    "Naogaon",
    "Narail",
    "Narayanganj",
    "Narsingdi",
    "Natore",
    "Netrokona",
    "Nilphamari",
    "Noakhali",
    "Pabna",
    "Panchagarh",
    "Patuakhali",
    "Pirojpur",
    "Rajbari",
    "Rajshahi",
    "Rangamati",
    "Rangpur",
    "Satkhira",
    "Shariatpur",
    "Sherpur",
    "Sirajganj",
    "Sunamganj",
    "Sylhet",
    "Tangail",
    "Thakurgaon",
]


# ----------------------------
# Incident detection
# ----------------------------

INCIDENT_KEYWORDS = {
    "sexual_violence": [
        "rape",
        "raped",
        "gang rape",
        "sexual assault",
        "molestation",
        "sexually assaulted",
        "violated",
    ],
    "murder": [
        "murder",
        "murdered",
        "killed",
        "dead body",
        "body recovered",
        "stabbed to death",
        "shot dead",
    ],
    "kidnapping": [
        "kidnap",
        "kidnapped",
        "abduct",
        "abducted",
        "missing",
    ],
    "violence": [
        "attack",
        "attacked",
        "knife attack",
        "stabbed",
        "beaten",
        "assault",
        "clash",
        "torture",
        "injured",
    ],
    "robbery": [
        "robbery",
        "robbed",
        "snatched",
        "mugged",
        "theft",
        "stolen",
        "looted",
    ],
    "harassment": [
        "harass",
        "harassed",
        "stalking",
        "stalked",
        "eve teasing",
    ],
    "suspicious_activity": [
        "suspicious",
        "gang",
        "threat",
        "threatened",
    ],
}

SEVERITY_BY_INCIDENT = {
    "sexual_violence": 5,
    "murder": 5,
    "kidnapping": 5,
    "violence": 4,
    "robbery": 3,
    "harassment": 3,
    "suspicious_activity": 2,
}


# ----------------------------
# Text helpers
# ----------------------------

def normalize_text(text):
    if pd.isna(text):
        return ""

    text = str(text).lower()

    # Remove repeated Daily Star copyright block
    text = re.sub(
        r"copyright:.*?legal action\.?",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    # Normalize punctuation
    text = re.sub(r"[^a-z0-9\s'\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def contains_phrase(text, phrase):
    phrase = normalize_text(phrase)

    if not phrase:
        return False

    pattern = r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])"

    return re.search(pattern, text) is not None


def get_district_aliases(district):
    aliases = [district.lower()]

    if district in DISTRICT_ALIASES:
        aliases.extend(DISTRICT_ALIASES[district])

    return list(dict.fromkeys(aliases))


def detect_districts(article_text):
    found = []

    for district in ALL_DISTRICTS:
        for alias in get_district_aliases(district):
            if contains_phrase(article_text, alias):
                found.append(district)
                break

    return list(dict.fromkeys(found))


# ----------------------------
# Postgres array alias parser
# ----------------------------

def parse_postgres_array(value):
    """
    Supports Neon/Postgres CSV alias format:

    {"Mirpur 10","Mirpur","Mirpur Circle"}

    Also supports pipe format:

    Mirpur 10|Mirpur|Mirpur Circle
    """

    if pd.isna(value):
        return []

    value = str(value).strip()

    if not value:
        return []

    # Pipe-separated aliases
    if "|" in value and not value.startswith("{"):
        return [item.strip() for item in value.split("|") if item.strip()]

    # Postgres array format
    if value.startswith("{") and value.endswith("}"):
        inner = value[1:-1].strip()

        if not inner:
            return []

        # Convert {"a","b"} to ["a","b"]
        python_list_text = "[" + inner + "]"

        try:
            parsed = ast.literal_eval(python_list_text)
            return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            return [
                item.strip().strip('"')
                for item in inner.split(",")
                if item.strip().strip('"')
            ]

    return [value]


# ----------------------------
# Load zones
# ----------------------------

def load_zones():
    zones = pd.read_csv(ZONES_PATH)

    required_cols = [
        "district",
        "zone_name",
        "aliases",
        "latitude",
        "longitude",
    ]

    missing = [col for col in required_cols if col not in zones.columns]

    if missing:
        raise ValueError(f"zones_seed.csv missing columns: {missing}")

    zones = zones.copy()

    zones["district"] = zones["district"].astype(str).str.strip()
    zones["zone_name"] = zones["zone_name"].astype(str).str.strip()
    zones["aliases"] = zones["aliases"].fillna("").astype(str)

    zones["latitude"] = pd.to_numeric(zones["latitude"], errors="coerce")
    zones["longitude"] = pd.to_numeric(zones["longitude"], errors="coerce")

    # If exported from Neon, geocoded may be t/true/1
    if "geocoded" in zones.columns:
        zones["geocoded"] = zones["geocoded"].astype(str).str.lower()
        zones = zones[zones["geocoded"].isin(["t", "true", "1", "yes"])]

    zones = zones.dropna(subset=["latitude", "longitude"])

    zones["alias_list"] = zones["aliases"].apply(parse_postgres_array)

    print("Loaded zones:", len(zones))
    print("\nSample loaded zones:")
    print(zones[["district", "zone_name", "alias_list", "latitude", "longitude"]].head())

    return zones


def get_zone_aliases(zone_row):
    aliases = []

    aliases.append(zone_row["zone_name"])

    if "alias_list" in zone_row:
        aliases.extend(zone_row["alias_list"])

    cleaned = []

    bad_aliases = {
        "road",
        "area",
        "bazar",
        "bazaar",
        "market",
        "college",
        "school",
        "medical college",
        "police station",
        "hospital",
        "bus stand",
        "bus terminal",
        "railway station",
        "launch terminal",
        "launch ghat",
    }

    for alias in aliases:
        alias = normalize_text(alias)

        if not alias:
            continue

        if alias in bad_aliases:
            continue

        if len(alias) < 3:
            continue

        if alias not in cleaned:
            cleaned.append(alias)

    return cleaned


# ----------------------------
# Incident feature extraction
# ----------------------------

def detect_incident_type(article_text):
    best_type = "suspicious_activity"
    best_score = 0

    for incident_type, keywords in INCIDENT_KEYWORDS.items():
        score = 0

        for keyword in keywords:
            if contains_phrase(article_text, keyword):
                score += 1

        if score > best_score:
            best_score = score
            best_type = incident_type

    return best_type


def extract_victim_age(article_text):
    patterns = [
        r"(\d{1,2})-year-old",
        r"aged\s+(\d{1,2})",
        r"age\s+(\d{1,2})",
    ]

    for pattern in patterns:
        match = re.search(pattern, article_text)

        if match:
            age = int(match.group(1))

            if 1 <= age <= 100:
                return age

    if "teenage" in article_text or "teenager" in article_text:
        return 16

    if "minor" in article_text or "child" in article_text or "girl" in article_text:
        return 15

    return np.nan


def detect_severity(article_text, incident_type, victim_age):
    severity = SEVERITY_BY_INCIDENT.get(incident_type, 2)

    if not pd.isna(victim_age) and victim_age < 18:
        severity += 1

    severe_words = [
        "knife",
        "stabbed",
        "shot",
        "murder",
        "killed",
        "gang rape",
        "critical",
        "hospital",
        "medical examination",
        "dead",
    ]

    for word in severe_words:
        if contains_phrase(article_text, word):
            severity += 1
            break

    return min(severity, 5)


def parse_published_time(value):
    dt = pd.to_datetime(value, errors="coerce")

    if pd.isna(dt):
        return np.nan, np.nan

    return int(dt.hour), int(dt.dayofweek)


# ----------------------------
# Zone matching logic
# ----------------------------

def score_zone_match(article_text, zone_row):
    aliases = get_zone_aliases(zone_row)

    best_score = 0
    best_alias = None

    for alias in aliases:
        if contains_phrase(article_text, alias):
            # Longer aliases are more specific and safer.
            score = len(alias.split())

            # Strong boost for exact multi-word place names
            if score >= 2:
                score += 2

            # Slight boost if alias is the actual zone name
            if alias == normalize_text(zone_row["zone_name"]):
                score += 1

            if score > best_score:
                best_score = score
                best_alias = alias

    if best_alias is None:
        return None

    return {
        "zone": zone_row,
        "matched_alias": best_alias,
        "match_score": best_score,
        "match_type": "zone_alias",
    }


def match_zones_for_article(article_text, zones, detected_districts):
    """
    Important:
    Only search zones from detected districts.
    This prevents one article from being matched to all BD zones.
    """

    candidate_zones = zones[zones["district"].isin(detected_districts)].copy()

    matches = []

    for _, zone in candidate_zones.iterrows():
        scored = score_zone_match(article_text, zone)

        if scored:
            matches.append(scored)

    matches = sorted(
        matches,
        key=lambda item: item["match_score"],
        reverse=True,
    )

    return matches


def get_fallback_zone(zones, district):
    """
    If the article says only district, e.g. 'Jashore',
    but no exact zone alias is found, use Sadar/first zone of that district.
    """

    district_zones = zones[zones["district"] == district].copy()

    if len(district_zones) == 0:
        return None

    sadar = district_zones[
        district_zones["zone_name"].str.lower().str.contains("sadar", na=False)
    ]

    if len(sadar) > 0:
        return sadar.iloc[0]

    return district_zones.iloc[0]


# ----------------------------
# Main
# ----------------------------

def main():
    if not NEWS_PATH.exists():
        raise FileNotFoundError(f"Missing news file: {NEWS_PATH}")

    if not ZONES_PATH.exists():
        raise FileNotFoundError(f"Missing zones file: {ZONES_PATH}")

    articles = pd.read_csv(NEWS_PATH)
    zones = load_zones()

    required_article_cols = ["source", "url", "title", "body", "published_at"]
    missing = [col for col in required_article_cols if col not in articles.columns]

    if missing:
        raise ValueError(f"news_articles.csv missing columns: {missing}")

    clean_rows = []
    skipped_no_district = 0
    skipped_no_zone = 0

    for _, article in articles.iterrows():
        source = article.get("source", "")
        url = article.get("url", "")
        title = article.get("title", "")
        body = article.get("body", "")
        published_at = article.get("published_at", "")

        article_text = normalize_text(f"{title} {body}")

        detected_districts = detect_districts(article_text)

        if not detected_districts:
            skipped_no_district += 1
            continue

        incident_type = detect_incident_type(article_text)
        victim_age = extract_victim_age(article_text)
        severity = detect_severity(article_text, incident_type, victim_age)
        article_hour, article_day_of_week = parse_published_time(published_at)

        zone_matches = match_zones_for_article(
            article_text=article_text,
            zones=zones,
            detected_districts=detected_districts,
        )

        selected_matches = []

        if zone_matches:
            # Keep maximum 3 best zone matches from the detected district(s)
            selected_matches = zone_matches[:3]
        else:
            # Use district fallback only.
            # Max 2 districts prevents bad expansion.
            for district in detected_districts[:2]:
                fallback = get_fallback_zone(zones, district)

                if fallback is not None:
                    selected_matches.append({
                        "zone": fallback,
                        "matched_alias": district,
                        "match_score": 0,
                        "match_type": "district_fallback",
                    })

        if not selected_matches:
            skipped_no_zone += 1
            continue

        for item in selected_matches:
            zone = item["zone"]

            clean_rows.append({
                "source": source,
                "url": url,
                "title": title,
                "published_at": published_at,

                "district": zone["district"],
                "zone_name": zone["zone_name"],
                "latitude": zone["latitude"],
                "longitude": zone["longitude"],

                "incident_type": incident_type,
                "victim_age": victim_age,
                "severity": severity,

                "article_hour": article_hour,
                "article_day_of_week": article_day_of_week,

                "matched_alias": item["matched_alias"],
                "match_score": item["match_score"],
                "match_type": item["match_type"],
            })

    clean_df = pd.DataFrame(clean_rows)

    if len(clean_df) == 0:
        raise ValueError(
            "No article-zone matches found. Check district names, zone aliases, and coordinates."
        )

    clean_df = clean_df.drop_duplicates(
        subset=["url", "district", "zone_name", "incident_type"]
    )

    clean_df.to_csv(OUTPUT_PATH, index=False)

    print("\nSaved:", OUTPUT_PATH)
    print("Clean incident rows:", len(clean_df))
    print("Unique article URLs:", clean_df["url"].nunique())
    print("Unique districts:", clean_df["district"].nunique())
    print("Unique zones:", clean_df["zone_name"].nunique())
    print("Skipped articles with no district:", skipped_no_district)
    print("Skipped articles with no zone/fallback:", skipped_no_zone)

    print("\nMatch types:")
    print(clean_df["match_type"].value_counts())

    print("\nTop URL district counts. Good: 1-2. Bad: 10+ or 64.")
    print(
        clean_df.groupby("url")["district"]
        .nunique()
        .sort_values(ascending=False)
        .head(20)
    )

    print("\nTop matched zones:")
    print(
        clean_df.groupby(["district", "zone_name"])
        .size()
        .sort_values(ascending=False)
        .head(30)
    )

    print("\nPreview:")
    print(clean_df.head(20))


if __name__ == "__main__":
    main()