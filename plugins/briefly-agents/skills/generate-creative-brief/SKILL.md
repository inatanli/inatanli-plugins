---
name: generate-creative-brief
description: >
  Generates research-backed creative briefs for Amazon product graphics.
  Outputs a branded PowerPoint (.pptx) with research insights, creative
  direction, visual concepts, wireframes, and AI-ready shot-list prompts.
  Use when the user wants a creative brief, Amazon listing strategy, main
  image, listing images, or A+ content, or mentions ASINs, Amazon
  graphics, or product graphics.
---

# Creative Brief Generator

Progress through six phases. Ask the user to confirm before moving between phases. Do not auto-advance.

<brief_progress>
- [ ] Phase 1: Intake — collect project details
- [ ] Phase 2: Brand Analysis — analyze brand from website, images, or provided guidelines
- [ ] Phase 3: Research — product scraping + competitor analysis (per product)
- [ ] Phase 4: Creative Strategy — narrative + specialist deliverables (per product)
- [ ] Phase 5: Shot List — AI-ready prompts organized by shot type (per product)
- [ ] Phase 6: Validate + Generate PowerPoint deck
</brief_progress>

## Progressive JSON File

The brief is written to disk progressively — once after each phase — so the file is recoverable if the session is interrupted.

**Filename:** determined at the end of Phase 1, using the pattern `{brand_slug}_brief_{yyyymmdd}.json`
- `brand_slug`: brand name, lowercased, spaces → underscores
- `yyyymmdd`: today's date

Examples: `acme_brief_20260418.json`, `yoga_brand_brief_20260418.json`

**Write discipline:** after each phase confirmation, write the complete current JSON to disk (overwriting the previous version), always conforming to [brief-schema.json](${CLAUDE_PLUGIN_ROOT}/reference/brief-schema.json). Populate fields as they become available — leave unreached fields as `null` or empty arrays rather than omitting them.

| After phase | What's written |
|---|---|
| Phase 1 | `brand.name`, `brand.website`, product stubs (`name`, `asin`, `type`) |
| Phase 2 | `brand.guidelines` added |
| Phase 3 | `products[n].research` filled in (per product, as each completes) |
| Phase 4 | `products[n].creative_direction` + `products[n].deliverables` filled in |
| Phase 5 | `products[n].shot_list` filled in |
| Phase 6 | `metadata` added, file validated, pptx generated |

Use the filename from Phase 1 for all subsequent writes and for the pptx output (`{brand_slug}_brief_{yyyymmdd}.pptx`).

Run partial validation after each phase write: `python ${CLAUDE_PLUGIN_ROOT}/bin/validate_brief.py --input {filename}.json --phase {n}`.

## Phase 1: Intake

Read [intake.md](${CLAUDE_PLUGIN_ROOT}/skills/generate-creative-brief/intake.md) for the conversation flow.

Collect brand info, products, and deliverables scope (Main Image / Listing Images / A+). Present as a batch, then follow up on missing items. End with a recap for user confirmation.

Before moving on: present a summary of everything collected and ask the user to confirm. Then write the initial JSON stub to disk.

## Phase 2: Brand Analysis

Read [brand-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/brand-analyst.md) when this phase begins.

Always runs. Analyzes all available brand inputs — website URL, mood board/visual reference images, or user-provided guidelines. Outputs a brand profile with colors, typography, tone, and visual style. If only intake-collected guidelines are available, the brand-analyst still structures and analyzes them rather than passing them through raw.

Before moving on: present the extracted brand profile and ask the user to confirm or adjust. Then write updated JSON (with `brand.guidelines`) to disk.

## Phase 3: Research (per product, sequential)

Use the Python scripts as the primary method for product, competitor, and keyword data. Commands live in each researcher agent ([product-researcher.md](${CLAUDE_PLUGIN_ROOT}/agents/product-researcher.md), [competitor-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/competitor-analyst.md)). Fall back to WebSearch/WebFetch only if a script fails.

If the product is not on Amazon and no inspo ASIN is provided, ask the user to provide product details and competitor ASINs manually.

For each product, complete these steps in strict sequence. Do not start a step until the previous step has fully completed.

<per_product_research>
- [ ] Step 3a: Product Researcher — fetches listing + keywords
- [ ] Step 3b: Competitor Analyst — fetches top 3 competitors + images
- [ ] Step 3c: Present findings to user
- [ ] Step 3d: User confirms findings
- [ ] Step 3e: Write JSON to disk
</per_product_research>

### Step 3a: Product Researcher

Read [product-researcher.md](${CLAUDE_PLUGIN_ROOT}/agents/product-researcher.md).

- **Existing product mode:** fetches the client's listing via DataForSEO + pulls ranked keywords.
- **Inspo mode:** skips the product scrape (handled by Competitor Analyst) — runs keywords only on the inspo ASIN.

### Step 3b: Competitor Analyst

Read [competitor-analyst.md](${CLAUDE_PLUGIN_ROOT}/agents/competitor-analyst.md).

- Gets competitors from DataForSEO via `get_competitors.py`.
- **Existing product mode:** skips the first result (same as client product), batch-fetches ASINs 2–4.
- **Inspo mode:** batch-fetches all results (inspo product + its competitors form the full competitive landscape).
- Extracts competitor image URLs + review insights.

If the user provides an ASIN or Amazon URL, run the Competitor Analyst — competitor analysis is not optional for Amazon products.

### Step 3c: Present research findings

Present a summary to the user:
- Product details (name, price, rating, key features)
- Product images — embed ALL image URLs inline using markdown (`![alt](url)`)
- Keywords with search volumes and the `visual_implication` summary
- Competitor landscape — each competitor with name, price, rating, USPs, and ALL images inline
- Gap analysis findings

Ask: "Please review the research findings above. Confirm to proceed, or let me know what to adjust." Do not proceed until the user confirms.

### Step 3e: Write research to JSON

After user confirmation, write updated JSON with `research` filled in for this product.

## Phase 4: Creative Strategy (per product, sequential)

<per_product_strategy>
- [ ] Step 4a: Creative Director — unified narrative + structured visual direction
- [ ] Step 4b: Present creative direction to user
- [ ] Step 4c: User confirms creative direction
- [ ] Step 4d: Run specialists matching project scope
- [ ] Step 4e: Present specialist deliverables to user
- [ ] Step 4f: User confirms specialist deliverables
- [ ] Step 4g: Write JSON to disk
</per_product_strategy>

### Step 4a: Creative Director

Read [creative-director.md](${CLAUDE_PLUGIN_ROOT}/agents/creative-director.md).

- Receives all research + brand guidelines.
- Outputs `positioning_statement`, `key_messages`, `visual_direction` (six required sub-fields), `competitive_differentiation`.
- The `visual_direction` object is the visual DNA that Phase 5 inherits verbatim.

### Step 4b: Present creative direction

Present to the user:
- Positioning statement
- Key messages (each tied to a research insight)
- Visual direction (all 6 fields: color_world, lighting_signature, model_direction, prop_styling, environment_surface_direction, mood)
- Competitive differentiation

Ask: "Please review the creative direction above. Confirm to proceed to specialist deliverables, or let me know what to adjust." Do not proceed until the user confirms.

### Step 4d: Run specialists

After user confirmation, run the specialists matching project scope. Each reads the Creative Director output and its own agent file.

| Deliverable requested | File to read |
|---|---|
| Main Image | [specialist-main-image.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-main-image.md) |
| Listing Images | [specialist-listing-images.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-listing-images.md) |
| A+ | [specialist-aplus.md](${CLAUDE_PLUGIN_ROOT}/agents/specialist-aplus.md) |

Specialists produce `visual_concept` and `strategy` per deliverable. They do **not** author text-to-image prompts — those come from Phase 5.

### Step 4e: Present specialist deliverables

For each deliverable, present: visual concept, copy (if applicable), and strategic rationale.

Ask: "Please review the specialist deliverables above. Confirm to proceed, or let me know what to adjust." Do not proceed until the user confirms.

### Step 4g: Write creative strategy to JSON

After user confirmation, write updated JSON with `creative_direction` and `deliverables` filled in for this product.

## Phase 5: Shot List (per product, sequential)

Read [shot-list-director.md](${CLAUDE_PLUGIN_ROOT}/agents/shot-list-director.md) when this phase begins.

The shot-list-director is the only agent in the workflow that authors text-to-image prompts. It inherits `visual_direction` from the Creative Director verbatim and generates AI-ready prompts organized by shot type.

<per_product_shot_list>
- [ ] Step 5a: Shot List Director — generates prompts scoped to deliverables in this product's scope
- [ ] Step 5b: Present shot list to user
- [ ] Step 5c: User confirms shot list
- [ ] Step 5d: Write JSON to disk
</per_product_shot_list>

### Step 5a: Shot List Director

Scope coverage to deliverables in this product. Main-image-only projects need far fewer shot types than full main + listing + A+ projects. Only emit shot types actually required.

Every prompt must name lighting type + direction, shadow style, surface material, color temperature, aspect ratio, and negative constraints ("no text, no watermark, no copy overlays"). Prompts describe pure visuals — designers add copy as a post-layer.

Every deliverable in scope must be referenced by at least one `fits_deliverables` entry somewhere in the output.

Valid shot type keys: `studio_plain`, `studio_styled`, `lifestyle_tight`, `lifestyle_wide`, `action_wide`, `action_tight`, `group_kit`, `packaging`, `detail_closeup`. Full descriptions live in the shot-list-director agent.

### Step 5b: Present shot list

Present per shot type: option_id, prompt (full text), lighting, shadows, surface_material, color_temperature, aspect_ratio, resolution, camera, fits_deliverables.

Ask: "Please review the shot list above. Confirm to proceed, or let me know what to adjust." Do not proceed until the user confirms.

### Step 5d: Write shot list to JSON

After user confirmation, write updated JSON with `shot_list` filled in for this product.

## Phase 6: Validate + Generate

The brief JSON is already on disk from progressive writes. This phase adds metadata, validates, and generates the deck.

1. Add `metadata` to the JSON (`generated_date`, `version`) and write the final file.
2. Validate: `python ${CLAUDE_PLUGIN_ROOT}/bin/validate_brief.py --input {filename}.json`
3. Fix any validation errors and re-validate before proceeding.
4. Run the quality checklist below — do not proceed to generation until every item passes.
5. Generate the deck: `node ${CLAUDE_PLUGIN_ROOT}/bin/generate_pptx.mjs --input {filename}.json --output {filename}.pptx`

Before moving on: share both output file paths (`.json` and `.pptx`) with the user and ask them to review the deck.

### Pre-Render Quality Checklist

The schema validator catches structural issues (missing fields, wrong types, array lengths). This checklist covers qualitative gaps the validator cannot catch. Review each item before generating the deck.

**Creative direction**
- [ ] `visual_direction` has all 6 fields populated with narrative paragraphs (not keyword lists)
- [ ] `key_messages` each reference a specific research insight
- [ ] `competitive_differentiation` names specific competitor patterns, not generic statements

**Main image (5 versions)**
- [ ] 5 entries, each with a distinct `strategy_name` from the inventory
- [ ] Each `visual_concept` mentions 3D-render quality and thumbnail legibility
- [ ] Each `strategy` cites a specific research signal

**Listing images (7 entries)**
- [ ] Slot 1–2 `role_in_sequence: Opening`; slots 3–6 `Middle`; slot 7 `Closing`
- [ ] Slot 7 is `image_type: full_bleed`
- [ ] At most 3 of 7 are `image_type: infographic`
- [ ] Each middle-slot `strategy` justifies its arc position, not just the message
- [ ] `sequence_strategy` explains the 7-image narrative arc

**A+ (6 modules)**
- [ ] Module 1 is `hero_with_icons` with `1464x1200`, tagline ≤6 words, description 18–22 words, exactly 3 icons
- [ ] Modules 2–6 are `1464x600`
- [ ] Module 2 is `expand_or_deepen`; modules 3 & 4 are `new_territory` (distinct themes); module 5 is `bridge_to_close`; module 6 is `brand_closing`
- [ ] Module 6 headline ≤36 chars, body ≤50 words
- [ ] Each module's `strategy` notes how it covers new territory vs main/listing

**Shot list**
- [ ] `visual_dna` matches Creative Director's `visual_direction` verbatim
- [ ] Every prompt names lighting type+direction, shadow style, surface material, color temperature, aspect ratio
- [ ] Every prompt ends with negative constraints forbidding text/watermark/copy overlays
- [ ] Every deliverable in scope is referenced by at least one `fits_deliverables` entry
- [ ] Only shot types in scope are included; empty arrays are not emitted

**PowerPoint generation**
- [ ] JSON passes full validation (no schema errors)
- [ ] `generate_pptx.mjs` runs without errors
- [ ] Output .pptx is created successfully
