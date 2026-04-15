#!/usr/bin/env python3
"""Get ranked keywords for an Amazon ASIN via DataforSEO. Returns structured JSON."""

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


API_URL = "https://api.dataforseo.com/v3/dataforseo_labs/amazon/ranked_keywords/live"
MAX_RETRIES = 2


def get_keywords(asin: str) -> dict:
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
            "limit": 5,
            "order_by": ["keyword_data.keyword_info.search_volume,desc"]
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

    # Extract keywords from response
    keywords = []
    try:
        tasks = data.get("tasks", [])
        if tasks and tasks[0].get("result"):
            items = tasks[0]["result"][0].get("items", [])
            for item in items:
                keyword_data = item.get("keyword_data", {})
                keywords.append(
                    {
                        "keyword": keyword_data.get("keyword", ""),
                        "average_monthly_search_volume": keyword_data.get("keyword_info", {}).get(
                            "search_volume", 0
                        ),
                        "serp_rank": item.get("ranked_serp_element", {}).get("serp_item", {}).get("rank_absolute"),
                    }
                )
    except (IndexError, KeyError, TypeError):
        if not keywords:
            return {"asin": asin, "keywords": [], "note": "No keywords returned by API"}

    return {"asin": asin, "keywords": keywords}


def main():
    parser = argparse.ArgumentParser(description="Get ranked keywords for Amazon ASIN")
    parser.add_argument("--asin", required=True, help="Amazon ASIN")
    args = parser.parse_args()

    result = get_keywords(args.asin)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
