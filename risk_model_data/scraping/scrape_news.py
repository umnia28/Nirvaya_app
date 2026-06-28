import os
import re
import time
import requests
import pandas as pd

from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from datetime import datetime


RAW_DIR = "ai/data/raw"
OUTPUT_PATH = f"{RAW_DIR}/news_articles.csv"

os.makedirs(RAW_DIR, exist_ok=True)


SOURCES = [
    {
        "source": "Daily Star",
        "base_url": "https://www.thedailystar.net",
        "page_urls": [
            f"https://www.thedailystar.net/news/crime-justice?page={i}"
            for i in range(0, 50)
        ],
    },
]


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def normalize_url(url: str) -> str:
    if not url:
        return ""

    parsed = urlparse(str(url).strip())
    cleaned = parsed._replace(query="", fragment="")
    return urlunparse(cleaned).rstrip("/")


def normalize_daily_star_date(date_text: str) -> str:
    """
    Converts Daily Star date text into ISO format if possible.

    Handles:
    - 3 June 2026, 21:50 PM
    - 3 June 2026, 9:50 PM
    - 3 June 2026, 21:50
    - 2026-06-03T21:50:00+06:00

    If parsing fails, returns original cleaned text.
    """

    date_text = clean_text(date_text)

    if not date_text:
        return ""

    # If already ISO-like, keep it
    if re.match(r"^\d{4}-\d{2}-\d{2}", date_text):
        return date_text

    # Fix weird Daily Star format: 21:50 PM -> 21:50
    weird_match = re.search(
        r"(\d{1,2}\s+[A-Za-z]+\s+\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)",
        date_text,
        flags=re.IGNORECASE,
    )

    if weird_match:
        date_part = weird_match.group(1)
        hour = int(weird_match.group(2))
        minute = weird_match.group(3)
        am_pm = weird_match.group(4).upper()

        if hour > 12:
            date_text = f"{date_part}, {hour:02d}:{minute}"
        else:
            date_text = f"{date_part}, {hour}:{minute} {am_pm}"

    formats = [
        "%d %B %Y, %I:%M %p",
        "%d %B %Y, %H:%M",
        "%d %B %Y",
        "%B %d, %Y, %I:%M %p",
        "%B %d, %Y, %H:%M",
        "%B %d, %Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_text, fmt)
            return dt.isoformat()
        except Exception:
            pass

    return date_text


def get_html(url: str, retries: int = 3, timeout: int = 60) -> str | None:
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(
                url,
                headers=HEADERS,
                timeout=timeout,
            )

            response.raise_for_status()
            return response.text

        except Exception as error:
            print(f"Attempt {attempt} failed: {url}")
            print("Reason:", error)

            if attempt < retries:
                time.sleep(5)

    print("Skipping permanently:", url)
    return None


def is_valid_article_url(url: str, base_url: str) -> bool:
    parsed = urlparse(url)
    base_parsed = urlparse(base_url)

    if parsed.netloc != base_parsed.netloc:
        return False

    path = parsed.path.lower()

    blocked_parts = [
        "/tags/",
        "/author/",
        "/video/",
        "/videos/",
        "/photo/",
        "/photos/",
        "/search",
        "/opinion",
        "/sports",
        "/entertainment",
        "/business",
        "/lifestyle",
    ]

    for blocked in blocked_parts:
        if blocked in path:
            return False

    # Daily Star article URLs usually end with article id
    has_digit = any(char.isdigit() for char in path)

    if not has_digit:
        return False

    return True


def looks_like_daily_star_date(text: str) -> bool:
    text = clean_text(text)

    return bool(
        re.search(
            r"\b\d{1,2}\s+[A-Za-z]+\s+\d{4}",
            text,
            flags=re.IGNORECASE,
        )
    )


def find_listing_date_from_anchor(a) -> str:
    """
    Finds date from surrounding Daily Star listing card.

    Daily Star listing often has:
    <div class="card-info">
      <span>3 June 2026, 21:50 PM</span>
    </div>
    """

    possible_cards = []

    for parent in a.parents:
        if not getattr(parent, "get", None):
            continue

        class_text = " ".join(parent.get("class", []))

        if any(
            key in class_text
            for key in [
                "card",
                "views-row",
                "view-content",
                "columns",
                "row",
                "flex",
                "order",
            ]
        ):
            possible_cards.append(parent)

        if len(possible_cards) >= 8:
            break

    for card in possible_cards:
        # Best selector from your screenshot
        date_tag = card.select_one(".card-info span")

        if date_tag:
            date_text = date_tag.get_text(" ", strip=True)

            if looks_like_daily_star_date(date_text):
                return normalize_daily_star_date(date_text)

        # Fallback: search all spans inside card
        for span in card.find_all("span"):
            date_text = span.get_text(" ", strip=True)

            if looks_like_daily_star_date(date_text):
                return normalize_daily_star_date(date_text)

        # Extra fallback: search full card text
        card_text = card.get_text(" ", strip=True)

        match = re.search(
            r"\b\d{1,2}\s+[A-Za-z]+\s+\d{4},?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\b",
            card_text,
            flags=re.IGNORECASE,
        )

        if match:
            return normalize_daily_star_date(match.group(0))

    return ""


def extract_publication_date(soup: BeautifulSoup) -> str:
    """
    Extracts date from article page.
    If article page date fails, listing date fallback will be used later.
    """

    meta_candidates = [
        {"property": "article:published_time"},
        {"property": "og:article:published_time"},
        {"name": "publish-date"},
        {"name": "pubdate"},
        {"name": "date"},
        {"name": "datePublished"},
        {"itemprop": "datePublished"},
    ]

    for attrs in meta_candidates:
        tag = soup.find("meta", attrs=attrs)

        if tag and tag.get("content"):
            return normalize_daily_star_date(tag["content"].strip())

    time_tag = soup.find("time")

    if time_tag:
        if time_tag.get("datetime"):
            return normalize_daily_star_date(time_tag["datetime"].strip())

        text = time_tag.get_text(" ", strip=True)

        if text:
            return normalize_daily_star_date(text)

    selectors = [
        ".card-info span",
        ".date",
        ".published-date",
        ".article-date",
        ".date-time",
        ".news-date",
        ".byline-date",
        ".author-date",
    ]

    for selector in selectors:
        tag = soup.select_one(selector)

        if tag:
            text = tag.get_text(" ", strip=True)

            if looks_like_daily_star_date(text):
                return normalize_daily_star_date(text)

    page_text = soup.get_text(" ", strip=True)

    match = re.search(
        r"\b\d{1,2}\s+[A-Za-z]+\s+\d{4},?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\b",
        page_text,
        flags=re.IGNORECASE,
    )

    if match:
        return normalize_daily_star_date(match.group(0))

    return ""


def scrape_article_links(source_config: dict, max_links: int = 1000) -> list[dict]:
    links = []
    seen = set()

    for page_url in source_config["page_urls"]:
        print("Scraping listing page:", page_url)

        html = get_html(page_url)

        if html is None:
            continue

        soup = BeautifulSoup(html, "html.parser")

        page_new_links = 0

        for a in soup.find_all("a", href=True):
            title = clean_text(a.get_text(" ", strip=True))
            href = a["href"]

            if len(title) < 15:
                continue

            full_url = urljoin(source_config["base_url"], href)
            full_url = normalize_url(full_url)

            if not is_valid_article_url(full_url, source_config["base_url"]):
                continue

            if full_url in seen:
                continue

            published_at_from_listing = find_listing_date_from_anchor(a)

            seen.add(full_url)

            links.append(
                {
                    "source": source_config["source"],
                    "title_from_listing": title,
                    "url": full_url,
                    "published_at_from_listing": published_at_from_listing,
                }
            )

            page_new_links += 1

            if published_at_from_listing:
                print("Found listing date:", published_at_from_listing)

            if len(links) >= max_links:
                break

        print(f"New article links from this page: {page_new_links}")
        print(f"Total unique links so far: {len(links)}")

        

        time.sleep(1)

    print(f"Collected total unique links: {len(links)}")

    return links


def scrape_article_body(url: str) -> tuple[str, str, str] | None:
    html = get_html(url)

    if html is None:
        return None

    soup = BeautifulSoup(html, "html.parser")

    title = ""

    title_tag = soup.find("h1")

    if title_tag:
        title = clean_text(title_tag.get_text(" ", strip=True))

    published_at = extract_publication_date(soup)

    paragraphs = soup.find_all("p")

    body_parts = []

    for p in paragraphs:
        text = clean_text(p.get_text(" ", strip=True))

        if not text:
            continue

        lower_text = text.lower()

        unwanted_phrases = [
            "follow the daily star",
            "for all latest news",
            "click here",
            "download the daily star app",
            "subscribe to our newsletter",
            "read more",
            "advertisement",
        ]

        if any(phrase in lower_text for phrase in unwanted_phrases):
            continue

        body_parts.append(text)

    body = " ".join(body_parts)

    return title, body, published_at 


def load_existing_urls() -> set:
    if not os.path.exists(OUTPUT_PATH):
        return set()

    try:
        old_df = pd.read_csv(OUTPUT_PATH)

        if "url" not in old_df.columns:
            return set()

        return set(old_df["url"].dropna().astype(str).map(normalize_url).tolist())

    except Exception as error:
        print("Could not read existing CSV.")
        print("Reason:", error)
        return set()


def append_to_csv(rows: list[dict]) -> None:
    if not rows:
        print("No new rows to save.")
        return

    new_df = pd.DataFrame(rows)

    if os.path.exists(OUTPUT_PATH):
        old_df = pd.read_csv(OUTPUT_PATH)
        final_df = pd.concat([old_df, new_df], ignore_index=True)
    else:
        final_df = new_df

    final_df["url"] = final_df["url"].astype(str).map(normalize_url)
    final_df = final_df.drop_duplicates(subset=["url"], keep="first")

    final_df.to_csv(OUTPUT_PATH, index=False)

    print("\nSaved:", OUTPUT_PATH)
    print("Total rows now:", len(final_df))


def scrape_all(max_links_per_source: int = 1000) -> pd.DataFrame:
    existing_urls = load_existing_urls()
    print("Already scraped URLs:", len(existing_urls))

    rows = []

    for source_config in SOURCES:
        print(f"\nScraping links from {source_config['source']}...")

        links = scrape_article_links(
            source_config=source_config,
            max_links=max_links_per_source,
        )

        print(f"Found {len(links)} usable links from {source_config['source']}")

        for index, item in enumerate(links, start=1):
            url = normalize_url(item["url"])

            if url in existing_urls:
                print(f"[{index}/{len(links)}] Already scraped, skipping:")
                print(url)
                continue

            print(f"[{index}/{len(links)}] Scraping article:")
            print(url)

            result = scrape_article_body(url)

            if result is None:
                continue

            title, body, published_at = result

            if not title:
                title = item["title_from_listing"]

            # Important fallback: use date from listing page if article page has no date
            if not published_at:
                published_at = item.get("published_at_from_listing", "")

            if len(body) < 100:
                print("Skipping short article:", url)
                continue

            rows.append(
                {
                    "source": item["source"],
                    "url": url,
                    "title": title,
                    "body": body,
                    "published_at": published_at,
                    "published_at_from_listing": item.get(
                        "published_at_from_listing", ""
                    ),
                }
            )

            existing_urls.add(url)

            time.sleep(1)

    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = scrape_all(max_links_per_source=1000)

    if len(df) == 0:
        print("\nNo new articles scraped.")
    else:
        append_to_csv(df.to_dict(orient="records"))

        print("\nNew rows scraped:", len(df))
        print(df.head())