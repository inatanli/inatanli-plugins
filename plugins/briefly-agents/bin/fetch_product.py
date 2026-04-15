#!/usr/bin/env python3
"""Fetch Amazon product data via DataForSEO Merchant API. Accepts one or more ASINs. Returns a list of structured product dicts."""

import argparse
import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print(json.dumps({"error": "requests not installed. Run: pip install requests"}))
    sys.exit(1)


TASK_POST_URL = "https://api.dataforseo.com/v3/merchant/amazon/asin/task_post"
TASK_GET_URL = "https://api.dataforseo.com/v3/merchant/amazon/asin/task_get/advanced"
POLL_INTERVAL = 3  # seconds between polling attempts
MAX_POLL_ATTEMPTS = 120  # up to 6 minutes of polling


def get_auth():
    """Return (login, password) tuple for DataForSEO Basic Auth."""
    login = (
        os.environ.get("CLAUDE_PLUGIN_OPTION_DATAFORSEO_LOGIN")
        or os.environ.get("DATAFORSEO_LOGIN")
    )
    password = (
        os.environ.get("CLAUDE_PLUGIN_OPTION_DATAFORSEO_PASSWORD")
        or os.environ.get("DATAFORSEO_PASSWORD")
    )
    if not login or not password:
        return None  # caller will surface a helpful error
    return (login, password)


def extract_product_data(task: dict) -> dict:
    """Transform DataForSEO task result into our standard product format."""
    result = task["result"][0]
    items = result.get("items", [])

    product = items[0] if items else {}

    # Rating
    rating_obj = product.get("rating") or {}
    rating_value = str(rating_obj.get("value", "")) if rating_obj.get("value") else ""

    # Price
    price_from = product.get("price_from")
    price_to = product.get("price_to")
    currency = product.get("currency", "USD")
    if price_from is not None:
        price = f"{currency} {price_from}"
        if price_to and price_to != price_from:
            price = f"{currency} {price_from} - {price_to}"
    else:
        price = ""

    # Images
    image_urls = product.get("product_images_list") or []

    # Description
    description = product.get("description", "") or ""

    # Product information / features
    product_info = product.get("product_information") or []
    features = []
    for section in product_info:
        if section.get("type") == "product_information_details_item":
            body = section.get("body") or {}
            for key, val in body.items():
                features.append(f"{key}: {val}")
        elif section.get("type") == "product_information_extended_item":
            contents = section.get("contents") or []
            for content in contents:
                rows = content.get("rows") or []
                for row in rows:
                    if row.get("type") == "product_information_text_row":
                        features.append(row.get("text", ""))

    # Reviews (minimal fields only)
    reviews = []
    for review in (product.get("top_local_reviews") or []) + (product.get("top_global_reviews") or []):
        review_rating = review.get("rating", {})
        reviews.append({
            "rating": str(review_rating.get("value", "unknown")),
            "text": review.get("review_text", ""),
            "title": review.get("title", ""),
        })

    # Categories
    categories = [c.get("category", "") for c in (product.get("categories") or [])]

    return {
        "asin": result.get("asin", ""),
        "url": result.get("check_url", ""),
        "title": product.get("title", ""),
        "price": price,
        "rating": rating_value,
        "description": description,
        "image_urls": image_urls,
        "reviews": reviews[:20],  # Cap at 20 reviews for token limits
        "author": product.get("author", ""),
        "is_amazon_choice": product.get("is_amazon_choice", False),
        "categories": categories,
        "product_features": features,
    }


def fetch_products(asins: list) -> list:
    """Fetch product data for one or more ASINs. Returns a list of product dicts in input order."""
    auth = get_auth()
    if not auth:
        error = {"error": "DataForSEO credentials not configured. Set your login and password in the creative-brief plugin settings."}
        return [error] * len(asins)

    # Step 1: Submit all tasks in a single batch POST
    payload = [
        {
            "asin": asin,
            "language_code": "en_US",
            "location_code": 2840,  # United States
            "priority": 2,
        }
        for asin in asins
    ]
    try:
        resp = requests.post(TASK_POST_URL, json=payload, auth=auth, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        error = {"error": f"Failed to create tasks: {str(e)}"}
        return [error] * len(asins)

    data = resp.json()
    tasks_created = data.get("tasks", [])

    # Map original index → task_id; pre-fill errors for tasks that failed to create
    results = [None] * len(asins)
    index_to_task_id = {}

    for i, task in enumerate(tasks_created):
        if task.get("status_code") == 20100:
            index_to_task_id[i] = task["id"]
        else:
            msg = task.get("status_message", "unknown error")
            results[i] = {"error": f"Task creation failed: {msg}", "asin": asins[i] if i < len(asins) else ""}

    # Step 2: Poll all pending task IDs until complete or timeout
    pending = dict(index_to_task_id)  # index → task_id

    for _ in range(MAX_POLL_ATTEMPTS):
        if not pending:
            break

        completed = []
        for idx, tid in list(pending.items()):
            url = f"{TASK_GET_URL}/{tid}"
            try:
                resp = requests.get(url, auth=auth, timeout=30)
                resp.raise_for_status()
                task_data = resp.json()

                if task_data.get("tasks"):
                    task = task_data["tasks"][0]
                    status = task.get("status_code")
                    if status == 20000 and task.get("result"):
                        results[idx] = extract_product_data(task)
                        completed.append(idx)
                    elif status in (40602, 40603):
                        pass  # still processing, retry next cycle
                    elif status and status >= 40000:
                        results[idx] = {"error": f"Task failed: {task.get('status_message', 'unknown')}", "asin": asins[idx]}
                        completed.append(idx)
            except requests.RequestException:
                pass  # transient error, retry next cycle

        for idx in completed:
            del pending[idx]

        if pending:
            time.sleep(POLL_INTERVAL)

    # Mark anything still pending as timed out
    for idx in pending:
        results[idx] = {"error": "Timed out waiting for DataForSEO results", "asin": asins[idx]}

    # Ensure no None gaps (shouldn't happen, but be safe)
    for i in range(len(results)):
        if results[i] is None:
            results[i] = {"error": "No result returned", "asin": asins[i]}

    return results


def main():
    parser = argparse.ArgumentParser(description="Fetch Amazon product data via DataForSEO")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--asin", help="Single Amazon ASIN")
    group.add_argument("--asins", nargs="+", metavar="ASIN", help="One or more Amazon ASINs")
    args = parser.parse_args()

    asins = [args.asin] if args.asin else args.asins
    results = fetch_products(asins)

    # Single ASIN: unwrap for backward compatibility
    if args.asin:
        print(json.dumps(results[0], indent=2))
    else:
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
