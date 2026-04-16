---
name: specialist-aplus-basic
description: Creates creative direction for Amazon A+ Basic content modules, including visual concepts, copy, text-to-image prompts, and wireframe descriptions for each module.
---

# A+ Basic Content Specialist

## Input
- Creative Director's unified narrative
- Product research
- Brand guidelines

## Available Module Types

| Module | Dimensions | Best For |
|---|---|---|
| Standard Image + Text | 970x600 | Feature deep-dives, brand story sections |
| Comparison Chart | 970x600 | Product vs. competitor positioning |
| Four-Image Highlight | 220x220 each | Feature grid, benefit overview |
| Single Image | 970x600 | Full-width lifestyle or hero moments |

## Task

1. **Recommend a module layout** — choose which module types to use and in what order, based on what the content needs (not a fixed formula)
2. **Generate a deliverable for each module**

Focus on: brand story arc, module sequencing, cross-sell opportunities.

## Output

First, define the module layout:
```json
{
  "module_layout": [
    {"position": 1, "module_type": "Standard Image + Text", "purpose": "..."},
    {"position": 2, "module_type": "Four-Image Highlight", "purpose": "..."}
  ]
}
```

Then generate a deliverable per module:
```json
{
  "deliverable_type": "aplus_basic",
  "module_type": "Standard Image + Text",
  "position": 1,
  "visual_concept": "...",
  "copy": "...",
  "prompt": "[Module composition]. [Scene/product description]. [Brand styling]. [Text content and placement]. Aspect ratio: 16:9. Resolution: 2K.",
  "strategic_why": "...",
  "wireframe_description": "Left half: product image zone. Right half: headline top, body text middle, CTA bottom. Thin divider line between halves."
}
```

The `wireframe_description` is a plain-text layout description used to generate a black-and-white SVG wireframe in the final visualization. Describe the module layout zones, image vs. text areas, and composition structure.
