---
name: generate-creative-brief
description: Generates research-backed creative briefs for Amazon product graphics. Outputs a branded PowerPoint (.pptx) with research insights, creative direction, visual concepts, wireframes, and AI-ready shot-list prompts. Use when the user wants an Amazon creative brief, listing strategy, or product graphics.
---

# Creative Brief Generator

You are executing a 6-phase progressive workflow. 
**Crucial Rule:** Each phase must fully execute, present its output to the user, and write to disk before the next phase begins. Do not plan ahead, combine phases, or generate output for a later phase before the current one completes.

There are only TWO confirmation gates:
1. End of Phase 1 (intake recap).
2. Step 4b (bundled review of brand profile + research highlights + creative direction).
*Note: Missing-data questions (e.g., conflicting colors, failed scrapes) are information gaps, not approval gates. Surface and resolve them immediately.*

## Master Workflow

Copy this checklist and track your progress in your responses:

### Brief Progress Checklist
- [ ] Phase 1: Intake — collect project details
- [ ] Phase 2: Brand Analysis — analyze brand from website, images, or guidelines
- [ ] Phase 3: Research — product scraping + competitor analysis (per product)
- [ ] Phase 4: Creative Strategy — narrative + specialist deliverables (per product)
- [ ] Phase 5: Shot List — AI-ready prompts organized by shot type (per product)
- [ ] Phase 6: Validate + Generate PowerPoint deck

## Progressive JSON File
The brief is written to disk progressively — once after each phase — so the file is recoverable if the session is interrupted.

**Write discipline:** after each phase confirmation, write the complete current JSON to disk (overwriting the previous version), always conforming to [brief-schema.json](${CLAUDE_PLUGIN_ROOT}/reference/brief-schema.json). Populate fields as they become available — leave unreached fields as `null` or empty arrays rather than omitting them.

**Filename:** determined at the end of Phase 1, using the pattern `{brand_slug}_brief_{yyyymmdd}.json`
- `brand_slug`: brand name, lowercased, spaces → underscores
- `yyyymmdd`: today's date

| After phase | What's written |
|---|---|
| Phase 1 | `brand.name`, `brand.website`, product stubs (`name`, `asin`, `type`) |
| Phase 2 | `brand.guidelines` added |
| Phase 3 | `products[n].research` filled in (per product, as each completes) |
| Phase 4 | `products[n].creative_direction` + `products[n].deliverables` filled in |
| Phase 5 | `products[n].shot_list` filled in |
| Phase 6 | `metadata` added, file validated, pptx generated |

Use the filename from Phase 1 for all subsequent writes and for the pptx output (`{brand_slug}_brief_{yyyymmdd}.pptx`).

## Phase 1: Intake
Read [intake.md](skills/generate-creative-brief/intake.md) for the conversation flow.
Collect brand info, products, and deliverables scope one question at a time. Present a summary recap and **GATE (Wait for user confirmation)** before writing the initial JSON stub to disk.

## Phase 2: Brand Analysis
Read [brand-analyst.md](agents/brand-analyst.md).
Analyze all available brand inputs (URL, mood boards, guidelines). Output a structured brand profile. Present it briefly to the user, write updated JSON (`brand.guidelines`), and continue immediately to Phase 3.

## Phase 3: Research (per product, sequential)
For each product, execute strictly in order. If a script fails, fall back to WebSearch.

### Per Product Research
**Step 3a:** Read [product-researcher.md](agents/product-researcher.md). Fetch listing/keywords.
  - **Existing product mode:** fetches the client's listing via DataForSEO + pulls ranked keywords.
  - **Inspo mode:** skips the product scrape (handled by Competitor Analyst) — runs keywords only on the inspo ASIN.

**Step 3b:** Read [competitor-analyst.md](agents/competitor-analyst.md). Use `python ${CLAUDE_SKILL_DIR}/bin/get_competitors.py`.
  - Gets competitors from DataForSEO via `get_competitors.py`.
  - **Existing product mode:** skips the first result (same as client product), batch-fetches ASINs 2–4.
  - **Inspo mode:** batch-fetches all results (inspo product + its competitors form the full competitive landscape).
  - Extracts competitor image URLs + review insights.

**Step 3c:** Write `research` to JSON and continue.
  - Product details (name, price, rating, key features)
  - Product images — embed ALL image URLs inline using markdown (`![alt](url)`)
  - Keywords with search volumes, and the `visual_implication` summary
  - Competitor landscape — each competitor with name, price, rating, USPs, and ALL images inline
  - Gap analysis findings

## Phase 4: Creative Strategy (per product, sequential)

### Per Product Strategy
**Step 4a:** Read [creative-director.md](agents/creative-director.md) to generate the narrative and visual DNA.
  - Receives all research + brand guidelines.
  - Outputs `positioning_statement`, `key_messages`, `visual_direction` (six required sub-fields), `competitive_differentiation`.
  - The `visual_direction` object is the visual DNA that Phase 5 inherits verbatim.
**Step 4b:** **GATE (Wait for user confirmation).** Present a bundled review in this exact order: Brand recap -> Research highlights -> Positioning -> Key messages -> Visual direction -> Competitive differentiation.
  - Present to the user, in this exact order:
    - **Brand profile recap** — 1–2 lines summarizing the analyzed brand profile (colors, tone, visual style)
    - **Research highlights** — the 2–4 key insights driving this direction (top keywords with `visual_implication`, key competitor patterns, gap analysis)
    - **Positioning statement**
    - **Key messages** (each tied to a specific research insight)
    - **Visual direction** (all 6 fields: color_world, lighting_signature, model_direction, prop_styling, environment_surface_direction, mood)
    - **Competitive differentiation**
**Step 4c:** Once confirmed, run specialists matching the scope:
   - [specialist-main-image.md](agents/specialist-main-image.md)
   - [specialist-listing-images.md](agents/specialist-listing-images.md)
   - [specialist-aplus.md](agents/specialist-aplus.md)
   - Specialists produce `visual_concept` and `strategy` per deliverable. They do **not** author text-to-image prompts — those come from Phase 5.
**Step 4d:** Present specialist output as a single block so the user has visibility — for each deliverable: `visual_concept`, `copy` (if applicable), and `strategy`. Do not gate here; specialists are mechanical translation of the already-confirmed creative direction. Continue to Phase 5 after presenting. Write updated JSON with `creative_direction` and `deliverables` filled in for this product, then continue to Phase 5.


## Phase 5: Shot List (per product, sequential)
Read [shot-list-director.md](agents/shot-list-director.md).

The shot-list-director is the only agent in the workflow that authors text-to-image prompts. It inherits `visual_direction` from the Creative Director verbatim and generates AI-ready prompts organized by shot type.

Write `shot_list` to JSON, and continue.

### Per Product Shot List
**Step 5a: Shot List Director**
Scope coverage to deliverables in this product. Main-image-only projects need far fewer shot types than full main + listing + A+ projects. Only emit shot types actually required.

Every prompt must name lighting type + direction, shadow style, surface material, color temperature, aspect ratio, and negative constraints ("no text, no watermark, no copy overlays"). Prompts describe pure visuals — designers add copy as a post-layer.

Every deliverable in scope must be referenced by at least one `fits_deliverables` entry somewhere in the output.

Valid shot type keys: `studio_plain`, `studio_styled`, `lifestyle_tight`, `lifestyle_wide`, `action_wide`, `action_tight`, `group_kit`, `packaging`, `detail_closeup`. Full descriptions live in the shot-list-director agent.

**Step 5b: Write JSON to disk**
Write updated JSON with `shot_list` filled in for this product, then continue to Phase 6.

## Phase 6: Validate + Generate
1. Add `metadata` (`generated_date`, `version`) and write final JSON.
2. Run full validation: `python ${CLAUDE_SKILL_DIR}/bin/validate_brief.py --input {filename}.json`
3. Fix any errors and re-validate.
4. Read [pre-render-checklist.md](reference/pre-render-checklist.md) and verify all qualitative requirements are met. Do not proceed until they pass.
5. Generate the deck: `node ${CLAUDE_SKILL_DIR}/bin/generate_pptx.mjs --input {filename}.json --output {filename}.pptx`
6. Share both output file paths with the user.

### Pre-Render Quality Checklist

The schema validator catches structural issues (missing fields, wrong types, array lengths). This checklist covers qualitative gaps the validator cannot catch. Review each item before generating the deck.

#### Creative direction
- [ ] `visual_direction` has all 6 fields populated with narrative paragraphs (not keyword lists)
- [ ] `key_messages` each reference a specific research insight
- [ ] `competitive_differentiation` names specific competitor patterns, not generic statements

#### Main image (5 versions)
- [ ] 5 entries, each with a distinct `strategy_name` from the inventory
- [ ] Each `visual_concept` mentions 3D-render quality and thumbnail legibility
- [ ] Each `strategy` cites a specific research signal

#### Listing images (7 entries)
- [ ] Slot 1–2 `role_in_sequence: Opening`; slots 3–6 `Middle`; slot 7 `Closing`
- [ ] Slot 7 is `image_type: full_bleed`
- [ ] At most 3 of 7 are `image_type: infographic`
- [ ] Each middle-slot `strategy` justifies its arc position, not just the message
- [ ] `sequence_strategy` explains the 7-image narrative arc

#### A+ (6 modules)
- [ ] Module 1 is `hero_with_icons` with `1464x1200`, tagline ≤6 words, description 18–22 words, exactly 3 icons
- [ ] Modules 2–6 are `1464x600`
- [ ] Module 2 is `expand_or_deepen`; modules 3 & 4 are `new_territory` (distinct themes); module 5 is `bridge_to_close`; module 6 is `brand_closing`
- [ ] Module 6 headline ≤36 chars, body ≤50 words
- [ ] Each module's `strategy` notes how it covers new territory vs main/listing

#### Shot list
- [ ] `visual_dna` matches Creative Director's `visual_direction` verbatim
- [ ] Every prompt names lighting type+direction, shadow style, surface material, color temperature, aspect ratio
- [ ] Every prompt ends with negative constraints forbidding text/watermark/copy overlays
- [ ] Every deliverable in scope is referenced by at least one `fits_deliverables` entry
- [ ] Only shot types in scope are included; empty arrays are not emitted

#### PowerPoint generation
- [ ] JSON passes full validation (no schema errors)
- [ ] `generate_pptx.mjs` runs without errors
- [ ] Output .pptx is created successfully