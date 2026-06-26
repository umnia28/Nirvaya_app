import re
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import pandas as pd
from rapidfuzz import fuzz


BASE_DIR = Path("ai")

INPUT_PATH = BASE_DIR / "data" / "raw" / "news_articles.csv"
OUTPUT_PATH = BASE_DIR / "data" / "processed" / "news_articles_deduped.csv"

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def clean_text(text):
    if pd.isna(text):
        return ""

    text = str(text)

    # Remove Daily Star copyright boilerplate
    text = re.sub(
        r"Copyright:\s*Any unauthorized use or reproduction of The Daily Star content.*?legal action\.",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_url(url):
    if pd.isna(url):
        return ""

    parsed = urlparse(str(url).strip())

    # Remove query params and fragments
    cleaned = parsed._replace(query="", fragment="")

    normalized = urlunparse(cleaned).rstrip("/").lower()
    return normalized


def normalize_title(title):
    title = clean_text(title).lower()

    title = title.replace("’", "'")
    title = title.replace("‘", "'")
    title = title.replace("“", '"')
    title = title.replace("”", '"')

    title = re.sub(r"[^a-z0-9\s]", " ", title)
    title = re.sub(r"\s+", " ", title).strip()

    return title


def normalize_body(body):
    body = clean_text(body).lower()

    body = re.sub(r"[^a-z0-9\s]", " ", body)
    body = re.sub(r"\s+", " ", body).strip()

    return body


def body_fingerprint(body, length=900):
    """
    Uses first part of article body as duplicate fingerprint.
    Duplicate articles usually start the same.
    """
    body = normalize_body(body)
    return body[:length]


def get_best_date(row):
    published_at = str(row.get("published_at", "") or "").strip()
    listing_date = str(row.get("published_at_from_listing", "") or "").strip()

    if published_at:
        return published_at

    return listing_date


def make_date_key(date_value):
    parsed = pd.to_datetime(date_value, errors="coerce")

    if pd.isna(parsed):
        return ""

    return str(parsed.date())


def dedupe_exact_url(df):
    before = len(df)

    df["normalized_url"] = df["url"].apply(normalize_url)
    df = df.drop_duplicates(subset=["normalized_url"], keep="first").copy()

    print("URL duplicates removed:", before - len(df))
    return df


def dedupe_exact_title_date(df):
    before = len(df)

    df["title_key"] = df["title"].apply(normalize_title)
    df["published_at_final"] = df.apply(get_best_date, axis=1)
    df["date_key"] = df["published_at_final"].apply(make_date_key)

    df = df.drop_duplicates(
        subset=["title_key", "date_key"],
        keep="first",
    ).copy()

    print("Exact title + date duplicates removed:", before - len(df))
    return df


def dedupe_body_fingerprint(df):
    before = len(df)

    df["body_key"] = df["body"].apply(body_fingerprint)

    # Do not use empty body as duplicate key
    df["body_key"] = df["body_key"].fillna("")

    non_empty = df[df["body_key"].str.len() > 100].copy()
    empty = df[df["body_key"].str.len() <= 100].copy()

    non_empty = non_empty.drop_duplicates(subset=["body_key"], keep="first")

    df = pd.concat([non_empty, empty], ignore_index=True)

    print("Body fingerprint duplicates removed:", before - len(df))
    return df


def dedupe_fuzzy_title_same_date(df, threshold=92):
    """
    Removes titles that are very similar on the same date.
    Example:
    - Man held over murder in Dhaka
    - Man arrested over murder in Dhaka
    """

    before = len(df)

    keep_indices = []
    seen_by_date = {}

    for idx, row in df.iterrows():
        title = row["title_key"]
        date = row["date_key"]

        if not title:
            keep_indices.append(idx)
            continue

        if date not in seen_by_date:
            seen_by_date[date] = []

        duplicate = False

        for old_title in seen_by_date[date]:
            similarity = fuzz.token_sort_ratio(title, old_title)

            if similarity >= threshold:
                duplicate = True
                break

        if not duplicate:
            keep_indices.append(idx)
            seen_by_date[date].append(title)

    df = df.loc[keep_indices].copy()

    print("Fuzzy title duplicates removed:", before - len(df))
    return df


def main():
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Input file not found: {INPUT_PATH}")

    df = pd.read_csv(INPUT_PATH)

    print("Original rows:", len(df))

    required_columns = ["source", "url", "title", "body", "published_at"]

    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    if "published_at_from_listing" not in df.columns:
        df["published_at_from_listing"] = ""

    # Basic cleaning
    df["source"] = df["source"].fillna("").astype(str)
    df["url"] = df["url"].fillna("").astype(str)
    df["title"] = df["title"].apply(clean_text)
    df["body"] = df["body"].apply(clean_text)
    df["published_at"] = df["published_at"].fillna("").astype(str)
    df["published_at_from_listing"] = df["published_at_from_listing"].fillna("").astype(str)

    # Remove rows without URL
    before_no_url = len(df)
    df = df[df["url"].str.len() > 0].copy()
    print("Rows without URL removed:", before_no_url - len(df))

    # Remove short/empty articles
    before_short = len(df)
    df = df[df["body"].str.len() >= 100].copy()
    print("Short body rows removed:", before_short - len(df))

    # Deduplication steps
    df = dedupe_exact_url(df)
    df = dedupe_exact_title_date(df)
    df = dedupe_body_fingerprint(df)
    df = dedupe_fuzzy_title_same_date(df, threshold=92)

    # Final published date
    df["published_at_final"] = df.apply(get_best_date, axis=1)

    final_columns = [
        "source",
        "url",
        "title",
        "body",
        "published_at",
        "published_at_from_listing",
        "published_at_final",
    ]

    df = df[final_columns].copy()

    df.to_csv(OUTPUT_PATH, index=False)

    print("\nDeduplication complete.")
    print("Final rows:", len(df))
    print("Saved to:", OUTPUT_PATH)


if __name__ == "__main__":
    main()