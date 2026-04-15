#!/usr/bin/env python3
"""Validate assembled brief JSON against the schema. Returns validation results."""

import argparse
import json
import os
import sys

try:
    from jsonschema import validate, ValidationError, Draft7Validator
except ImportError:
    print(json.dumps({"error": "jsonschema not installed. Run: pip install jsonschema"}))
    sys.exit(1)


def validate_brief(input_path: str) -> dict:
    # Resolve schema path relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(script_dir, "..", "templates", "brief-schema.json")

    try:
        with open(schema_path) as f:
            schema = json.load(f)
    except FileNotFoundError:
        return {"valid": False, "errors": [f"Schema not found at {schema_path}"]}
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [f"Invalid schema JSON: {str(e)}"]}

    try:
        with open(input_path) as f:
            brief = json.load(f)
    except FileNotFoundError:
        return {"valid": False, "errors": [f"Brief file not found: {input_path}"]}
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [f"Invalid brief JSON: {str(e)}"]}

    # Collect all schema validation errors (don't stop at first)
    validator = Draft7Validator(schema)
    errors = []
    for error in sorted(validator.iter_errors(brief), key=lambda e: list(e.path)):
        path = " -> ".join(str(p) for p in error.path) or "(root)"
        errors.append({"path": path, "message": error.message})

    # Semantic validation (catches issues the schema alone can't)
    warnings = []
    semantic_errors = []
    products = brief.get("products", [])
    for i, product in enumerate(products):
        prefix = f"products[{i}]"

        # Check product images exist and look like URLs
        img_urls = product.get("research", {}).get("product", {}).get("image_urls", [])
        if not img_urls:
            semantic_errors.append({"path": f"{prefix}.research.product.image_urls", "message": "Product image_urls is empty — images are required for the visualization"})

        # Check competitor images and overlap metrics
        competitors = product.get("research", {}).get("competitors", [])
        for j, comp in enumerate(competitors):
            comp_imgs = comp.get("image_urls", [])
            if not comp_imgs:
                semantic_errors.append({"path": f"{prefix}.research.competitors[{j}].image_urls", "message": f"Competitor '{comp.get('name', '?')}' has no image_urls"})
            if comp.get("intersecting_keywords") is None:
                warnings.append({"path": f"{prefix}.research.competitors[{j}].intersecting_keywords", "message": f"Competitor '{comp.get('name', '?')}' missing intersecting_keywords"})

        # Check research has visual_implication (one for the whole keyword list)
        if not product.get("research", {}).get("visual_implication"):
            warnings.append({"path": f"{prefix}.research.visual_implication", "message": "Missing visual_implication for keyword list"})

        # Check deliverables: prompts should be real generation prompts (not just descriptions)
        deliverables = product.get("deliverables", {})

        # Listing images: must be exactly 7
        listing_imgs = deliverables.get("listing_images")
        if listing_imgs is not None:
            if len(listing_imgs) != 7:
                semantic_errors.append({"path": f"{prefix}.deliverables.listing_images", "message": f"Expected exactly 7 listing images, got {len(listing_imgs)}"})
            for j, img in enumerate(listing_imgs):
                prompt = img.get("prompt", "")
                if prompt and ("aspect ratio" not in prompt.lower() and "resolution" not in prompt.lower()):
                    warnings.append({"path": f"{prefix}.deliverables.listing_images[{j}].prompt", "message": "Prompt may be incomplete — missing aspect ratio or resolution spec"})
                if not img.get("wireframe_description"):
                    semantic_errors.append({"path": f"{prefix}.deliverables.listing_images[{j}].wireframe_description", "message": "Missing wireframe_description"})

        # Main image checks
        main_img = deliverables.get("main_image")
        if main_img:
            prompt = main_img.get("prompt", "")
            if prompt and ("aspect ratio" not in prompt.lower() and "resolution" not in prompt.lower()):
                warnings.append({"path": f"{prefix}.deliverables.main_image.prompt", "message": "Prompt may be incomplete — missing aspect ratio or resolution spec"})

        # A+ module checks
        for aplus_key in ["aplus_basic", "aplus_premium"]:
            aplus = deliverables.get(aplus_key)
            if aplus and aplus.get("modules"):
                for j, mod in enumerate(aplus["modules"]):
                    if not mod.get("wireframe_description"):
                        semantic_errors.append({"path": f"{prefix}.deliverables.{aplus_key}.modules[{j}].wireframe_description", "message": "Missing wireframe_description"})

    all_errors = errors + semantic_errors
    if all_errors:
        result = {"valid": False, "error_count": len(all_errors), "errors": all_errors}
    else:
        result = {"valid": True, "message": "Brief validates successfully against schema"}

    if warnings:
        result["warning_count"] = len(warnings)
        result["warnings"] = warnings

    return result


def main():
    parser = argparse.ArgumentParser(description="Validate brief JSON against schema")
    parser.add_argument("--input", required=True, help="Path to brief JSON file")
    args = parser.parse_args()

    result = validate_brief(args.input)
    print(json.dumps(result, indent=2))

    if not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
