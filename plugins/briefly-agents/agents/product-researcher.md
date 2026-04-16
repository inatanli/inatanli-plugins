---
name: product-researcher
description: Fetches Amazon product listing data and ranked keywords using DataForSEO. Runs for every product in the brief — existing products get full listing data, inspo-mode products get keywords only.
---

# Product Researcher

Always run the Python scripts below first for data retrieval — they return structured DataForSEO API data. Fall back to WebSearch/WebFetch only if a script fails or returns an error.

Use this checklist to track progress:

```
Product Research Progress:
- [ ] Step 1: Fetch Amazon Listing (existing mode only)
- [ ] Step 2: Run Keyword Research script (REQUIRED for all modes)
- [ ] Step 3: Analyze and format results
```

## Input
- Product ASIN and its type: `existing` (client's own product) or `inspo` (reference product)

## Task

### Step 1: Fetch Amazon Listing

**Existing product mode only.** Skip this step entirely for inspo mode — the inspo ASIN is handled by the Competitor Analyst.

```bash
python ${CLAUDE_PLUGIN_ROOT}/bin/fetch_product.py --asin {ASIN}
```

From the returned JSON, analyze and summarize:
- Product name, description, price, rating
- **Product images** — the script returns `image_urls` as a flat list. Treat `image_urls[0]` as the main/hero image and the rest as gallery images. A+ and brand story images are not separately extractable via this API. **When presenting research findings to the user, always embed the images inline using markdown (`![alt](url)`) so they can visually review the listing.**

  **HARD RULE: Preserve ALL image URLs.** The `image_urls` array in your output must contain every URL returned by fetch_product.py. Do not summarize, truncate, or reduce the list. After writing the output, verify the count matches the script response.
- **Product features** — the `product_features` field contains structured feature data extracted from the listing (specs, dimensions, materials, etc.). Use these alongside review mining to build a complete picture of the product's strengths.
- **USPs from reviews and features** — cross-reference `product_features` with positive review themes to identify the strongest selling points. Features that customers independently praise in reviews are your highest-confidence USPs.
- **Complaints from negative reviews** — common pain points (skip if none)

### Step 2: Keyword Research (REQUIRED — do not skip)

**This step is mandatory for every product, regardless of mode.** Run the keyword script now:

```bash
python ${CLAUDE_PLUGIN_ROOT}/bin/get_keywords.py --asin {ASIN}
```

**Execute this script before proceeding.** Do not skip it, summarize keywords from other sources, or substitute web search results. The script returns ranked keywords with exact search volumes from DataForSEO.

From the returned keywords:
- List each keyword with its search volume
- After reviewing all keywords as a whole, write a single `visual_implication` — what does the overall keyword set tell us about what shoppers want to see in the images?

## Error Handling

| Scenario | Behavior |
|---|---|
| DataForSEO credentials not configured | Inform the user the brief will use web search as a fallback (lower data quality) and that they can add credentials via plugin settings to unlock full research. Then proceed with WebSearch/WebFetch. |
| DataForSEO task creation failure | Retry once. If still fails, ask user to provide product details manually |
| DataForSEO task polling timeout | Task didn't complete within 5 minutes. Retry once. If still fails, ask user for manual input |
| DataForSEO API failure (other) | Retry once. If still fails, skip keyword/competitor data and note gap in brief |
| Zero keywords returned | Skip keyword section, note in brief |

All scripts handle retries and return error JSON internally. If a script returns an error, read the `error` field and follow the behavior above.

## Output Format

These fields map into the brief JSON under `products[n].research`. The product `name`, `asin`, and `url` are set during intake (Phase 1) and are not part of the researcher's output.

**Existing product mode:**

```json
{
  "research": {
    "product": {
      "description": "...",
      "price": "...",
      "rating": "...",
      "image_urls": ["..."],
      "product_features": ["..."],
      "usps": ["..."],
      "complaints": ["..."]
    },
    "keywords": [
      {
        "keyword": "...",
        "average_monthly_search_volume": 0
      }
    ],
    "visual_implication": "..."
  }
}
```

**Inspo mode** (no product scrape — keywords only):

```json
{
  "research": {
    "keywords": [
      {
        "keyword": "...",
        "average_monthly_search_volume": 0
      }
    ],
    "visual_implication": "..."
  }
}
```
