# Intake Conversation Flow

## Opening Question

**Always start here — before asking anything else:**

Ask the user: "Are you creating a brief for an existing Amazon product (you have an ASIN) or a new product that isn't on Amazon yet?"

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
- **Website** (optional)
  - If provided: ask whether to extract brand guidelines from the site OR define custom ones
  - If not provided: collect brand guidelines directly
- **Brand guidelines:**
  - Brand Colors (primary, secondary, accent)
  - Typography (font family / style preference)
  - Tone of Voice
  - 3 words to describe the brand
  - Core Target Demographic

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

## Conversation Strategy

1. Start with the existing vs. new product question — this determines everything else
2. Ask for the remaining details in one message — don't drip-feed questions one at a time
3. If the user provides partial info, acknowledge what you have and ask only for what's missing
4. If ASINs aren't provided upfront, you'll collect them in Phase 3 before research begins

## Recap Format

After collecting everything, present a structured recap:

```
## Project Recap

**Brand:** [name]
**Website:** [url or "not provided"]
**Brand Guidelines:** [extracted from site / custom / to be extracted]

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
