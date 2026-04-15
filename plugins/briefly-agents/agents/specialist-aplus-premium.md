# A+ Premium Content Specialist

## Input
- Creative Director's unified narrative
- Product research
- Brand guidelines

## Available Module Types

| Module | Dimensions | Best For |
|---|---|---|
| Hero Image | 1464x600 | Full-width brand moment, immersive opener |
| Hotspot Module | 1464x600 | Interactive feature callouts on product image |
| Comparison Chart | 970x600 | Premium vs. competitor positioning |
| Video Thumbnail | 970x600 | Video content thumbnail |
| Carousel | 970x600 per slide | Multi-scene storytelling |

## Task

1. **Recommend a module layout** — choose premium modules that create an immersive brand experience, based on content needs
2. **Generate a deliverable for each module**
3. For interactive modules (hotspot, carousel), define the interaction points and content for each

Focus on: immersive brand experience, interactive element planning, premium feel.

## Output

First, define the module layout:
```json
{
  "module_layout": [
    {"position": 1, "module_type": "Hero Image", "purpose": "..."},
    {"position": 2, "module_type": "Hotspot Module", "purpose": "..."}
  ]
}
```

Then generate a deliverable per module:
```json
{
  "deliverable_type": "aplus_premium",
  "module_type": "Hero Image",
  "position": 1,
  "visual_concept": "...",
  "copy": "...",
  "prompt": "[Module composition]. [Scene/product description]. [Brand styling]. [Text content and placement]. Aspect ratio: 5:2. Resolution: 2K.",
  "strategic_why": "...",
  "wireframe_description": "Full-width hero: product centered at 60% frame, headline top-center, subtle gradient background left-to-right",
  "interaction_points": null
}
```

For hotspot modules, include interaction points:
```json
{
  "interaction_points": [
    {"label": "Feature name", "description": "...", "position_hint": "top-left area"}
  ]
}
```
