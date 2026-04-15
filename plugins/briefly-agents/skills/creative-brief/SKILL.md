---
name: generating-creative-briefs
description: >
  Generates research-backed creative briefs for Amazon product graphics.
  Orchestrates brand analysis, product research, competitor analysis,
  and creative strategy across multiple products and deliverables
  (main image, listing images, A+ basic, A+ premium). Outputs a
  branded PowerPoint (.pptx) styled with the brand's color palette
  and typography, featuring research insights, creative direction,
  text-to-image prompts, product/competitor images, and inline
  wireframes for each deliverable. Use when the user wants to create a
  creative brief, Amazon listing strategy, product photography direction,
  or A+ content plan. Also use when the user mentions ASINs, Amazon
  graphics, listing images, or creative direction for e-commerce.
---

# Creative Brief Generator

Generates research-backed creative briefs for Amazon product graphics. Produces a branded PowerPoint deck (.pptx) styled with the brand's colors and typography, containing research insights, creative direction, text-to-image prompts, product/competitor images, and wireframes for each deliverable.

**Critical rule: You MUST ask the user for confirmation before proceeding to the next phase. Never auto-advance between phases.**

**Critical rule: For product data, competitor data, and keyword data — ALWAYS try the Python scripts in `scripts/` (via Bash) FIRST. The scripts use the DataForSEO API and return structured, complete data. Only fall back to WebSearch/WebFetch if a script fails or returns an error. Never skip the scripts and go straight to web search.**

## Workflow

Copy this checklist and track progress:

```
Brief Progress:
- [ ] Phase 1: Intake — collect project details
- [ ] Phase 2: Brand Analysis — extract brand guidelines (if website provided)
- [ ] Phase 3: Research — product scraping + competitor analysis (per product)
- [ ] Phase 4: Creative Strategy — narrative + specialist deliverables (per product)
- [ ] Phase 5: Assemble + Validate — build JSON, generate PowerPoint deck
```

## Phase 1: Intake

Read [intake.md](${CLAUDE_PLUGIN_ROOT}/skills/creative-brief/intake.md) for the full conversation flow.

Collect brand info, products, and deliverables scope. Present as a batch, then follow up on missing items. End with a recap for user confirmation.

**Before moving on:** Present a summary of everything collected and ask the user to confirm before proceeding to Phase 2.

## Phase 2: Brand Analysis

Read [brand-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/brand-analyst.md) when this phase begins.

Only runs if a website is provided and the user wants brand guidelines extracted from it. Uses WebFetch to scrape the website (no external scraping service needed for brand sites). Outputs a brand profile with colors, typography, and tone.

**Before moving on:** Present the extracted brand profile (colors, fonts, tone) to the user and ask them to confirm or adjust before proceeding to Phase 3.

## Phase 3: Research (per product, sequential)

**CRITICAL: You MUST use the Python scripts (`fetch_product.py`, `get_competitors.py`, `get_keywords.py`) as your PRIMARY method for ALL product data, competitor data, and keyword data. Always run the script first. Only fall back to WebSearch/WebFetch if the script fails or returns an error. Never skip the scripts and go straight to web search.**

**If a script returns `"DataForSEO credentials not configured"`: inform the user immediately — tell them the brief will use web search as a fallback (lower data quality, no structured keyword volumes or competitor ASINs), and that they can add credentials via plugin settings to unlock full research capabilities. Then proceed with WebSearch/WebFetch.**

**Rule: If the user provides an ASIN or Amazon URL, you MUST always run the Competitor Analyst using `get_competitors.py`. Competitor analysis is not optional for Amazon products.**

For each product, run the two agents sequentially in this order:

**Product Researcher** — Read [product-researcher.md](${CLAUDE_PLUGIN_ROOT}/agents/product-researcher.md)
- **Existing product mode:** fetches the client's listing via DataForSEO + pulls ranked keywords
- **Inspo mode:** skips the product scrape (handled by Competitor Analyst) — runs keywords only on the inspo ASIN

**Competitor Analyst** — Read [competitor-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/competitor-analyst.md)
- Gets competitors from DataForSEO via `get_competitors.py`
- **Existing product mode:** skips first result (same as client product), batch-fetches ASINs 2–4
- **Inspo mode:** batch-fetches ALL results (inspo product + its competitors form the full competitive landscape)
- Extracts competitor image URLs + review insights

If the product is NOT on Amazon and no inspo ASIN is provided, ask the user to provide product details and competitor ASINs manually.

**Before moving on:** Present a summary of research findings (product details, competitor landscape, keywords) to the user and ask them to confirm or adjust before proceeding to Phase 4. **Always embed product and competitor images inline using markdown (`![alt](url)`) so the user can visually review the listings.**

## Phase 4: Creative Strategy (per product)

**Creative Director** — Always runs first. Read [creative-director.md](${CLAUDE_PLUGIN_ROOT}/agents/creative-director.md)
- Receives all research + brand guidelines
- Outputs unified product narrative and positioning strategy
- Contains shared creative rules all specialists follow

**Then run ONLY the specialists matching the project scope:**

| Deliverable requested | File to read |
|---|---|
| Main Image | [specialist-main-image.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-main-image.md) |
| Listing Images | [specialist-listing-images.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-listing-images.md) |
| A+ Basic | [specialist-aplus-basic.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-aplus-basic.md) |
| A+ Premium | [specialist-aplus-premium.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-aplus-premium.md) |

Each specialist MUST include a `wireframe_description` field in their output — a plain-text description of the wireframe layout (e.g., "Product centered at 85% frame, soft shadow beneath, white background, no text"). This will be used to generate the SVG wireframe in Phase 5.

**Before moving on:** Present the creative strategy (positioning, key messages, visual direction, deliverable concepts) to the user and ask them to confirm or adjust before proceeding to Phase 5.

## Phase 5: Assemble + Validate

1. Assemble all agent outputs into a single JSON object following [brief-schema.json](${CLAUDE_PLUGIN_ROOT}/templates/brief-schema.json)
2. Validate: `python ${CLAUDE_PLUGIN_ROOT}/scripts/validate_brief.py --input brief.json`
3. Fix any validation errors before proceeding
4. **Run the pre-render checklist below** — do NOT proceed to generation until every item passes
5. Generate the branded PowerPoint deck: `node ${CLAUDE_PLUGIN_ROOT}/scripts/generate_pptx.mjs --input brief.json --output brief.pptx`

**Before moving on:** Share the output file path with the user and ask them to review the deck.

### Pre-Render Checklist (MANDATORY)

Before rendering the visualization, verify every item below. If any item fails, go back and fix the brief JSON before rendering. Do NOT skip items — each one addresses a gap that has been observed in past outputs.

**Research completeness:**
- [ ] Product `image_urls` array is populated (not empty)
- [ ] Each competitor has `image_urls`, `intersecting_keywords`, `avg_position`, and `usps` (complaints are optional — skip if no negative reviews)
- [ ] Each keyword has `search_volume`; `research.visual_implication` is set (one summary for all keywords)
- [ ] `gap_analysis` exists with `visual_patterns`, `differentiation_opportunities`, `complaints_to_address`
- [ ] Product `usps` array is populated (complaints are optional — skip if no negative reviews)


**Deliverable completeness:**
- [ ] Listing images array has exactly 7 items (not fewer, not more)
- [ ] Each deliverable has ALL of: `visual_concept`, `copy`, `prompt`, `strategic_why`, `wireframe_description`
- [ ] `prompt` fields are full text-to-image prompts (natural language paragraphs with aspect ratio, resolution, scene, lighting, brand colors, negative constraints) — NOT just a visual description
- [ ] `strategic_why` is a distinct field per deliverable, tied to a specific research insight, keyword, or competitor gap
- [ ] Listing images include a `sequence_strategy` explaining the 7-image narrative arc
- [ ] Each `wireframe_description` describes spatial layout (product placement, text zones, composition areas)

**PowerPoint generation:**
- [ ] `brief.json` file exists and passes validation
- [ ] `node creative-brief/scripts/generate_pptx.mjs --input brief.json --output brief.pptx` runs without errors
- [ ] Output .pptx file is created successfully

### PowerPoint Generation Details

The `generate_pptx.mjs` script reads the brief JSON and produces a branded .pptx deck automatically. You do NOT need to build slides manually — just run the script. The script handles:

**Branding:**
- Brand colors applied throughout (section headers, accents, table headers, text) using the palette from the brief JSON
- Brand heading + body fonts used with universal fallbacks (Calibri) for compatibility
- Clean, professional layout with clear section hierarchy — each slide focuses on one topic, with content presented in structured blocks rather than walls of text (this is a layout description, not a content instruction — all JSON fields must be fully detailed and rich)

**Wireframes (auto-generated per deliverable):**
- Rendered using PptxGenJS shapes (rectangles, circles, lines) — simple and clean
- Image placeholders shown as box-with-X
- Copy text placed directly on the wireframe
- Layout inferred from `wireframe_description` keywords (product, headline, lifestyle, features, comparison, grid, etc.)

**Images:**
- Product and competitor images loaded from URLs and embedded directly into the .pptx
- Displayed in grids alongside their respective sections

**Competitor links:**
- Each competitor ASIN is hyperlinked to `https://www.amazon.com/dp/[ASIN]`

**Slide structure (generated automatically):**
1. Cover slide — brand name, date, product names
2. Brand Guidelines — colors (inline chips), typography (rendered in brand typefaces), tone of voice, audience, brand descriptors, do's & don'ts (single slide, no separate title slide)
3. Per product:
   a. Product Overview — description, price, rating, Key USPs, product image grid (top), + 3-column bottom section: Top Keywords | Visual Patterns + Differentiation Opportunities | Complaints to Address
   b. Competitor Landscape — all competitors on one slide; each row shows: name/ASIN link + metrics | Key USPs they highlight | Customer reviews/complaints
   c. Creative Direction — positioning, key messages, visual direction, differentiation
   d. Deliverables — each on its own slide with: wireframe + visual concept + strategic why + text-to-image prompt

## Script Reference

```bash
# Fetch Amazon product listing(s) — returns product details + image URLs
# Single ASIN (returns a product dict):
python ${CLAUDE_PLUGIN_ROOT}/scripts/fetch_product.py --asin B0XXXXXXXX
# Multiple ASINs (returns a list of product dicts):
python ${CLAUDE_PLUGIN_ROOT}/scripts/fetch_product.py --asins B0XXXXXXXX B0YYYYYYYY B0ZZZZZZZZ

# Get ranked keywords + search volumes
python ${CLAUDE_PLUGIN_ROOT}/scripts/get_keywords.py --asin B0XXXXXXXX

# Get top competitor ASINs + details
python ${CLAUDE_PLUGIN_ROOT}/scripts/get_competitors.py --asin B0XXXXXXXX

# Validate assembled brief JSON against schema
python ${CLAUDE_PLUGIN_ROOT}/scripts/validate_brief.py --input brief.json

# Generate branded PowerPoint deck from brief JSON
node ${CLAUDE_PLUGIN_ROOT}/scripts/generate_pptx.mjs --input brief.json --output brief.pptx
```

All scripts: retry API calls once on failure, return error JSON (not exceptions) on persistent failure, pre-process scraped HTML to stay within token limits.

## Error Handling

See [error-handling.md](${CLAUDE_PLUGIN_ROOT}/reference/error-handling.md) for API failure behaviors and fallback strategies.

## Asset Dimensions

See [asset-dimensions.md](${CLAUDE_PLUGIN_ROOT}/reference/asset-dimensions.md) for Amazon asset specs (only needed when writing text-to-image prompts).