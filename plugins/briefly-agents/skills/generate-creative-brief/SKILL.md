---
name: generate-creative-brief
description: >
  Generates research-backed creative briefs for Amazon product graphics.
  Outputs a branded PowerPoint (.pptx) with research insights, creative
  direction, text-to-image prompts, and wireframes. Use when the user
  wants a creative brief, Amazon listing strategy, or A+ content plan,
  or mentions ASINs, Amazon graphics, or listing images.
---

# Creative Brief Generator

Ask the user for confirmation before proceeding to the next phase. Do not auto-advance between phases.

## Workflow

Use this checklist to track progress:

```
Brief Progress:
- [ ] Phase 1: Intake — collect project details
- [ ] Phase 2: Brand Analysis — analyze brand from website, images, or provided guidelines
- [ ] Phase 3: Research — product scraping + competitor analysis (per product)
- [ ] Phase 4: Creative Strategy — narrative + specialist deliverables (per product)
- [ ] Phase 5: Validate + Generate PowerPoint deck
```

## Progressive JSON File

The brief is written to disk progressively — once after each phase — so the file is always recoverable if the session is interrupted.

**Filename:** determined at the end of Phase 1, using the pattern:
```
{brand_slug}_brief_{yyyymmdd}.json
```
- `brand_slug`: brand name, lowercased, spaces → underscores
- `yyyymmdd`: today's date

Examples: `acme_brief_20260416.json`, `yoga_brand_brief_20260416.json`

**Write discipline:** after each phase confirmation, write the complete current JSON to disk (overwriting the previous version), always conforming to [brief-schema.json](${CLAUDE_PLUGIN_ROOT}/reference/brief-schema.json). Populate fields as they become available — leave unreached fields as `null` or empty arrays rather than omitting them. The file grows phase by phase:

| After phase | What's written |
|---|---|
| Phase 1 | `brand.name`, `brand.website`, product stubs (`name`, `asin`) |
| Phase 2 | `brand.guidelines` added |
| Phase 3 | `products[n].research` filled in (per product, as each completes) |
| Phase 4 | `products[n].creative_direction` + `products[n].deliverables` filled in |
| Phase 5 | `metadata` added, file validated, pptx generated |

Use the filename from Phase 1 for all subsequent writes and for the pptx output (`{brand_slug}_brief_{yyyymmdd}.pptx`).

## Phase 1: Intake

Read [intake.md](${CLAUDE_PLUGIN_ROOT}/skills/generate-creative-brief/intake.md) for the full conversation flow.

Collect brand info, products, and deliverables scope. Present as a batch, then follow up on missing items. End with a recap for user confirmation.

**Before moving on:** Present a summary of everything collected and ask the user to confirm. Then write the initial JSON stub to disk.

## Phase 2: Brand Analysis

Read [brand-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/brand-analyst.md) when this phase begins.

Always runs. Analyzes all available brand inputs — website URL, mood board/visual reference images, or user-provided guidelines. Outputs a brand profile with colors, typography, and tone. If only intake-collected guidelines are available (no URL or images), the brand-analyst still structures and analyzes them rather than passing them through raw.

**Before moving on:** Present the extracted brand profile (colors, fonts, tone) and ask the user to confirm or adjust. Then write updated JSON (with `brand.guidelines`) to disk.

## Phase 3: Research (per product, sequential)

Use the Python scripts (`fetch_product.py`, `get_competitors.py`, `get_keywords.py`) as the primary method for product, competitor, and keyword data. They use the DataForSEO API and return structured, complete data. Fall back to WebSearch/WebFetch only if a script fails or returns an error.

If a script returns `"DataForSEO credentials not configured"`: inform the user that the brief will use web search as a fallback (lower data quality), and that they can add credentials via plugin settings to unlock full research. Then proceed with WebSearch/WebFetch.

If the product is not on Amazon and no inspo ASIN is provided, ask the user to provide product details and competitor ASINs manually.

For each product, complete these steps in strict sequence. Do not start a step until the previous step has fully completed and returned its output.

```
Per-product research checklist:
- [ ] Step 3a: Product Researcher — complete before proceeding
- [ ] Step 3b: Competitor Analyst — depends on Step 3a completion
- [ ] Step 3c: Present findings to user — depends on Step 3b completion
- [ ] Step 3d: User confirms findings
- [ ] Step 3e: Write JSON to disk — depends on Step 3d
```

### Step 3a: Product Researcher

Read [product-researcher.md](${CLAUDE_PLUGIN_ROOT}/agents/product-researcher.md)
- **Existing product mode:** fetches the client's listing via DataForSEO + pulls ranked keywords
- **Inspo mode:** skips the product scrape (handled by Competitor Analyst) — runs keywords only on the inspo ASIN

**Do not proceed to Step 3b until Step 3a has fully completed and returned its output.**

### Step 3b: Competitor Analyst

Read [competitor-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/competitor-analyst.md)
- Gets competitors from DataForSEO via `get_competitors.py`
- **Existing product mode:** skips first result (same as client product), batch-fetches ASINs 2–4
- **Inspo mode:** batch-fetches all results (inspo product + its competitors form the full competitive landscape)
- Extracts competitor image URLs + review insights

If the user provides an ASIN or Amazon URL, run the Competitor Analyst — competitor analysis is not optional for Amazon products.

### Step 3c: Present Research Findings to User

STOP here and present a summary to the user. This is a required checkpoint — do not skip it.

Present:
- Product details (name, price, rating, key features)
- Product images — embed ALL image URLs inline using markdown (`![alt](url)`)
- Keywords with search volumes and the visual implication summary
- Competitor landscape — each competitor with name, price, rating, USPs, and ALL images inline (`![alt](url)`)
- Gap analysis findings

Ask the user: "Please review the research findings above. Confirm to proceed, or let me know what to adjust."

**Do not proceed until the user explicitly confirms.**

### Step 3e: Write Research to JSON

Only after user confirmation, write updated JSON (with `research` filled in for this product) to disk.

## Phase 4: Creative Strategy (per product)

Complete these steps in strict sequence for each product.

```
Per-product creative strategy checklist:
- [ ] Step 4a: Creative Director — complete before proceeding
- [ ] Step 4b: Present creative direction to user
- [ ] Step 4c: User confirms creative direction
- [ ] Step 4d: Run specialist agents — depends on Step 4c
- [ ] Step 4e: Present specialist deliverables to user
- [ ] Step 4f: User confirms specialist deliverables
- [ ] Step 4g: Write JSON to disk — depends on Step 4f
```

### Step 4a: Creative Director

Runs first. Read [creative-director.md](${CLAUDE_PLUGIN_ROOT}/agents/creative-director.md)
- Receives all research + brand guidelines
- Outputs unified product narrative and positioning strategy
- Contains shared creative rules all specialists follow

**Do not proceed to specialists until Step 4b and 4c are complete.**

### Step 4b: Present Creative Direction to User

STOP here and present the creative direction to the user. This is a required checkpoint — do not skip it.

Present:
- Positioning statement
- Key messages (with the research insight each is tied to)
- Visual direction
- Competitive differentiation strategy

Ask the user: "Please review the creative direction above. Confirm to proceed to specialist deliverables, or let me know what to adjust."

**Do not proceed until the user explicitly confirms.**

### Step 4d: Run Specialists

Only after user confirmation, run the specialists matching the project scope:

| Deliverable requested | File to read |
|---|---|
| Main Image | [specialist-main-image.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-main-image.md) |
| Listing Images | [specialist-listing-images.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-listing-images.md) |
| A+ Basic | [specialist-aplus-basic.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-aplus-basic.md) |
| A+ Premium | [specialist-aplus-premium.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-aplus-premium.md) |

Each specialist includes a `wireframe_description` field — a plain-text description of the wireframe layout (e.g., "Product centered at 85% frame, soft shadow beneath, white background, no text"). This generates the wireframe in Phase 5.

### Step 4e: Present Specialist Deliverables to User

STOP here and present ALL specialist deliverables to the user. This is a required checkpoint — do not skip it.

For each deliverable, present:
- Visual concept
- Copy (if applicable)
- Text-to-image prompt
- Strategic rationale (which research insight it addresses)
- Wireframe description

Ask the user: "Please review the specialist deliverables above. Confirm to proceed, or let me know what to adjust."

**Do not proceed until the user explicitly confirms.**

### Step 4g: Write Creative Strategy to JSON

Only after user confirmation, write updated JSON (with `creative_direction` and `deliverables` filled in for this product) to disk.

## Phase 5: Validate + Generate

The brief JSON is already on disk from progressive writes. This phase adds metadata, validates, and generates the deck.

1. Add `metadata` to the JSON (`generated_date`, `version`) and write the final file to disk
2. Validate: `python ${CLAUDE_PLUGIN_ROOT}/bin/validate_brief.py --input {filename}.json`
3. Fix any validation errors and re-validate before proceeding
4. Run the quality checklist below — do not proceed to generation until every item passes
5. Generate the branded PowerPoint deck: `node ${CLAUDE_PLUGIN_ROOT}/bin/generate_pptx.mjs --input {filename}.json --output {filename}.pptx`

Do not build slides manually — the script handles all layout, branding, wireframes, and image embedding from the brief JSON.

**Before moving on:** Share both output file paths (`.json` and `.pptx`) with the user and ask them to review the deck.

### Pre-Render Quality Checklist

The schema validator catches structural issues (missing fields, wrong types, array lengths). This checklist covers qualitative gaps the validator cannot catch. Review each item before generating the deck.

**Content quality (not caught by validator):**
- [ ] `prompt` fields are full text-to-image prompts (natural language paragraphs with aspect ratio, resolution, scene, lighting, brand colors, negative constraints) — not just a visual description
- [ ] `strategic_why` per deliverable is tied to a specific research insight, keyword, or competitor gap — not generic
- [ ] `wireframe_description` per deliverable describes spatial layout (product placement, text zones, composition areas) — not just a scene description
- [ ] `research.visual_implication` is set (one summary for all keywords)
- [ ] Listing images include a `sequence_strategy` explaining the 7-image narrative arc
- [ ] Competitor `usps` arrays are populated (complaints are optional — skip if no negative reviews)

**PowerPoint generation:**
- [ ] JSON file passes validation (no schema errors)
- [ ] `node ${CLAUDE_PLUGIN_ROOT}/bin/generate_pptx.mjs --input {filename}.json --output {filename}.pptx` runs without errors
- [ ] Output .pptx file is created successfully

## Script Reference

```bash
# Fetch Amazon product listing(s) — returns product details + image URLs
# Single ASIN (returns a product dict):
python ${CLAUDE_PLUGIN_ROOT}/bin/fetch_product.py --asin B0XXXXXXXX
# Multiple ASINs (returns a list of product dicts):
python ${CLAUDE_PLUGIN_ROOT}/bin/fetch_product.py --asins B0XXXXXXXX B0YYYYYYYY B0ZZZZZZZZ

# Get ranked keywords + search volumes
python ${CLAUDE_PLUGIN_ROOT}/bin/get_keywords.py --asin B0XXXXXXXX

# Get top competitor ASINs + details
python ${CLAUDE_PLUGIN_ROOT}/bin/get_competitors.py --asin B0XXXXXXXX

# Validate assembled brief JSON against schema
python ${CLAUDE_PLUGIN_ROOT}/bin/validate_brief.py --input {filename}.json

# Generate branded PowerPoint deck from brief JSON
node ${CLAUDE_PLUGIN_ROOT}/bin/generate_pptx.mjs --input {filename}.json --output {filename}.pptx
```

All scripts: retry API calls once on failure, return error JSON (not exceptions) on persistent failure, pre-process scraped HTML to stay within token limits.