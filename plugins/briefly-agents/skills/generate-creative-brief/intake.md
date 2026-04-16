# Intake Conversation Flow

## Opening Question

Start here — before asking anything else:

"Are you creating a brief for an existing Amazon product (you have an ASIN) or a new product that isn't on Amazon yet?"

- **Existing product** → collect an ASIN; mark as `type: existing`
- **New product** → collect product name, description, USPs, and target audience; then ask: "Do you have a competitor or inspiration product on Amazon we can use as a reference? (optional ASIN)"
  - If inspo ASIN provided: mark as `type: inspo`
  - If no ASIN: note that the user will provide competitor ASINs manually in Phase 3

If the user has already indicated the product type (e.g. "help me write a brief for ASIN B09W3Z3MTL" implies existing), skip this question and proceed — but confirm your assumption in the recap.

---

## What to Collect

Present these as a batch after the opening question, then follow up on anything missing or ambiguous.

### Brand Info
- **Brand name** (required)
- **Brand inputs** — ask what they have available (accept any combination):
  - Website URL → brand-analyst will fetch and analyze it
  - Mood board or visual reference images → brand-analyst will read and analyze them
  - Brand guidelines document or written guidelines → brand-analyst will analyze and structure them
  - Nothing yet → collect brand guidelines directly in intake (see fields below)
- **Brand guidelines** (collect directly only if no website, images, or doc is provided):
  - Brand Colors (primary, secondary, accent)
  - Typography (font family / style preference)
  - Tone of Voice
  - 3 words to describe the brand
  - Core Target Demographic

Note: brand analysis always runs in Phase 2, regardless of how guidelines are sourced. Provided guidelines are analyzed and structured, not just passed through.

### Project Scope
- **Products** — for each product, collect based on product type:
  - **Existing product:** ASIN (required), product name, product description (key features, target use case)
  - **New product:** product name, description, USPs, target audience, and optionally an inspo ASIN
  - Variations or base only?
- **Deliverables per product:**
  - Main Image
  - Listing Images (7 per product)
  - A+ Basic Content
  - A+ Premium Content

## Recap Format

After collecting everything, present a structured recap:

```
## Project Recap

**Brand:** [name]
**Website:** [url or "not provided"]
**Brand Inputs:** [website URL / mood board images / provided guidelines / collected in intake]

**Products:**
1. [Product name] — [ASIN if provided] ([existing / inspo / manual])
   - Description: [product description]
   - Deliverables: [Main Image, Listing Images, A+ Basic, A+ Premium]
2. [Product name] — [ASIN if provided] ([existing / inspo / manual])
   - Description: [product description]
   - Deliverables: [...]

**Next Steps:** [what happens after confirmation]
```

Ask for explicit confirmation before proceeding to Phase 2 (or Phase 3 if no website).
