#!/usr/bin/env python3
"""Get top product competitors for an Amazon ASIN via DataforSEO. Returns structured JSON."""

import argparse
import base64
import json
import os
import sys

try:
    import requests
except ImportError:
    print(json.dumps({"error": "requests not installed. Run: pip install requests"}))
    sys.exit(1)


API_URL = "https://api.dataforseo.com/v3/dataforseo_labs/amazon/product_competitors/live"
MAX_RETRIES = 2


def get_competitors(asin: str) -> dict:
    login = (
        os.environ.get("CLAUDE_PLUGIN_OPTION_DATAFORSEO_LOGIN")
        or os.environ.get("DATAFORSEO_LOGIN")
    )
    password = (
        os.environ.get("CLAUDE_PLUGIN_OPTION_DATAFORSEO_PASSWORD")
        or os.environ.get("DATAFORSEO_PASSWORD")
    )
    if not login or not password:
        return {"error": "DataForSEO credentials not configured. Set your login and password in the creative-brief plugin settings."}

    credentials = base64.b64encode(f"{login}:{password}".encode()).decode()
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/json",
    }
    payload = [
        {
            "asin": asin,
            "location_name": "United States",
            "language_code": "en",
            "limit": 4,
            "order_by": ["intersections,desc"]
        }
    ]

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
            if resp.status_code == 200:
                break
            if attempt < MAX_RETRIES - 1:
                continue
            return {
                "error": f"DataforSEO returned status {resp.status_code}",
                "status_code": resp.status_code,
            }
        except requests.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                continue
            return {"error": f"Request failed: {str(e)}"}

    data = resp.json()

    # Extract competitor ASINs from response
    competitors = []
    try:
        tasks = data.get("tasks", [])
        if tasks and tasks[0].get("result"):
            items = tasks[0]["result"][0].get("items", [])
            for item in items:
                competitors.append(
                    {
                        "asin": item.get("asin", ""),
                        "intersecting_keywords": item.get("intersections"),
                        "average_position_intersecting_keywords": item.get("avg_position"),
                    }
                )
    except (IndexError, KeyError, TypeError):
        if not competitors:
            return {
                "asin": asin,
                "competitors": [],
                "note": "No competitors returned by API",
            }

    return {"asin": asin, "competitors": competitors}


def main():
    parser = argparse.ArgumentParser(
        description="Get product competitors for Amazon ASIN"
    )
    parser.add_argument("--asin", required=True, help="Amazon ASIN")
    args = parser.parse_args()

    result = get_competitors(args.asin)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()