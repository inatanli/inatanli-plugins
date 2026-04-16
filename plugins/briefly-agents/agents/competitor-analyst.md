---
name: competitor-analyst
description: Fetches top competitor ASINs and details for an Amazon product using DataForSEO. Extracts competitor image URLs and review insights. Always runs for any product with an ASIN.
---

# Competitor Analyst

Always run the Python scripts below first. They return structured DataForSEO API data. Fall back to WebSearch/WebFetch only if a script fails or returns an error.

## Input
- Product ASIN and its type: `existing` (client's own product) or `inspo` (reference product)
- OR: user-provided competitor ASINs (if product not on Amazon — treat as `existing` mode, skip Step 1)

## Task

Use this checklist to track progress:

```
Competitor Research Progress:
- [ ] Step 1: Get Competitors
- [ ] Step 2: Fetch All Competitors in One Batch
- [ ] Step 3: Gap Analysis
```

### Step 1: Get Competitors

```bash
python scripts/get_competitors.py --asin {ASIN}
```

Returns up to 4 ASINs with competitive overlap data. **The first result is always the input ASIN itself.**

**Which ASINs to use:**
- **Existing product mode** → skip ASIN 1 (already fetched by Product Researcher), use ASINs 2–4
- **Inspo mode** → use all 4 (reference product + its competitors form the full competitive landscape)
- **User-provided competitors** → skip this step entirely

Preserve the `intersecting_keywords` and `avg_position` values from each competitor — these are passed to the Creative Director to inform differentiation priority (high keyword overlap = needs harder differentiation).

### Step 2: Fetch All Competitors in One Batch

```bash
python scripts/fetch_product.py --asins {ASIN_1} {ASIN_2} {ASIN_3}
```

Returns a list of product dicts in the same order as the input ASINs.

From each competitor listing, extract:
- Product name, price, rating
- **Product images** — `image_urls` is a flat list; `image_urls[0]` is the main/hero image, the rest are gallery images. Include every URL in the output — do not truncate. When presenting findings, embed each image inline using markdown (`![alt](url)`) so the user can visually review the full gallery.
- **Competitor USPs** — what selling points does this listing highlight? What do they lead with in their title, bullet points, and A+ content? Summarize as 2–5 short bullet points capturing their core claims (e.g. "clinically tested", "1000mg per serving", "made in USA").
- **Negative review complaints** — what are customers unhappy about? How can our visuals address these gaps?
- Skip complaint analysis if no negative reviews exist

### Step 3: Gap Analysis

Across all competitors, identify:
- Visual patterns they all follow (what's table stakes)
- Gaps in their visual strategy (opportunities to differentiate)
- Common complaints we can address in our creative

## Error Handling

All script failures: retry once before applying the behavior below.

| Scenario | Behavior |
|---|---|
| DataForSEO task creation failure | Ask user to provide competitor ASINs manually |
| DataForSEO task polling timeout | Ask user for manual input |
| DataForSEO API failure (other) | Skip competitor data and note gap in brief |
| Fewer than 3 competitors returned | Use however many are returned, note in brief |
| Product has zero reviews | Note "No reviews available" in insights, rely on description + competitor analysis |

All scripts handle retries and return error JSON internally. If a script returns an error, read the `error` field and follow the behavior above.

## Output Format

```json
{
  "competitors": [
    {
      "name": "...",
      "asin": "...",
      "url": "https://www.amazon.com/dp/{ASIN}",
      "price": "...",
      "rating": "...",
      "image_urls": ["..."],
      "intersecting_keywords": 0,
      "avg_position": 0,
      "usps": ["..."],
      "complaints": ["..."]
    }
  ],
  "gap_analysis": {
    "visual_patterns": ["..."],
    "differentiation_opportunities": ["..."],
    "complaints_to_address": ["..."]
  }
}
```
