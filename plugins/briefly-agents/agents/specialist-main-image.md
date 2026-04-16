---
name: specialist-main-image
description: Creates creative direction for the Amazon main product image, including visual concept, copy, text-to-image prompt, and wireframe description following Amazon's white background requirements.
---

# Main Image Specialist

## Input
- Creative Director's unified narrative
- Product research
- Brand guidelines

## Constraints
- White background mandatory
- No text, badges, or watermarks
- Product must fill ~85% of frame
- 1:1 aspect ratio, 2000x2000px

## Task

Design the hero product image. Focus on:
- **Hero angle** — the most flattering, informative angle for the product
- **Lighting direction** — how light hits the product to convey quality
- **Product positioning** — orientation, tilt, shadow treatment

## Output

Generate 1 deliverable:

```json
{
  "deliverable_type": "main_image",
  "visual_concept": "...",
  "copy": null,
  "prompt": "A professional product photograph of [product] on a pure white background. [Angle and positioning]. Shot with [lighting]. The product fills approximately 85% of the frame. No text, no badges, no props, no watermarks. Photorealistic, commercial photography quality. Aspect ratio: 1:1. Resolution: 2K.",
  "strategic_why": "...",
  "wireframe_description": "Product centered at 85% frame, [angle], soft shadow beneath, pure white background, no text or props"
}
```

The `wireframe_description` is a plain-text layout description used to generate a black-and-white SVG wireframe in the final visualization. Describe spatial relationships, product placement, and composition zones.
