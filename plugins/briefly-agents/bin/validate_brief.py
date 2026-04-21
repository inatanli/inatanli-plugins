#!/usr/bin/env python3
"""Validate assembled brief JSON against the schema. Returns validation results."""

import argparse
import json
import os
import re
import sys

try:
    from jsonschema import Draft7Validator
except ImportError:
    print(json.dumps({"error": "jsonschema not installed. Run: pip install jsonschema"}))
    sys.exit(1)


PHASE_REQUIRED_FIELDS = {
    1: [("brand", "name"), ("products",)],
    2: [("brand", "guidelines")],
    3: [("products", "research")],
    4: [("products", "creative_direction"), ("products", "deliverables")],
    5: [("products", "shot_list")],
    6: [("metadata",)],
}


def _word_count(text):
    return len(re.findall(r"\S+", text or ""))


def _check_listing_images(prefix, listing, errors):
    if not isinstance(listing, dict):
        return
    images = listing.get("images") or []
    if len(images) != 7:
        errors.append({
            "path": f"{prefix}.deliverables.listing_images.images",
            "message": f"Expected exactly 7 listing images, got {len(images)}",
        })
        return

    opening_slots = {1, 2}
    middle_slots = {3, 4, 5, 6}
    closing_slots = {7}
    infographic_count = 0

    for idx, img in enumerate(images):
        slot_prefix = f"{prefix}.deliverables.listing_images.images[{idx}]"
        slot = img.get("slot_number")
        role = img.get("role_in_sequence")
        image_type = img.get("image_type")

        if slot in opening_slots and role != "Opening":
            errors.append({
                "path": f"{slot_prefix}.role_in_sequence",
                "message": f"Slot {slot} must have role_in_sequence 'Opening', got '{role}'",
            })
        elif slot in middle_slots and role != "Middle":
            errors.append({
                "path": f"{slot_prefix}.role_in_sequence",
                "message": f"Slot {slot} must have role_in_sequence 'Middle', got '{role}'",
            })
        elif slot in closing_slots and role != "Closing":
            errors.append({
                "path": f"{slot_prefix}.role_in_sequence",
                "message": f"Slot {slot} must have role_in_sequence 'Closing', got '{role}'",
            })

        if slot == 7 and image_type != "full_bleed":
            errors.append({
                "path": f"{slot_prefix}.image_type",
                "message": "Slot 7 (Closing) must be image_type 'full_bleed'",
            })

        if image_type == "infographic":
            infographic_count += 1

        if "prompt" in img:
            errors.append({
                "path": f"{slot_prefix}.prompt",
                "message": "Deliverables must not contain 'prompt' — prompts live in shot_list",
            })

    if infographic_count > 3:
        errors.append({
            "path": f"{prefix}.deliverables.listing_images.images",
            "message": f"At most 3 listing images may be 'infographic', got {infographic_count}",
        })


def _check_main_image(prefix, main_image, errors):
    if not isinstance(main_image, list):
        return
    if len(main_image) != 5:
        errors.append({
            "path": f"{prefix}.deliverables.main_image",
            "message": f"Expected exactly 5 main image versions, got {len(main_image)}",
        })
        return

    seen_strategies = set()
    for idx, version in enumerate(main_image):
        version_prefix = f"{prefix}.deliverables.main_image[{idx}]"
        strategy_name = version.get("strategy_name")
        if strategy_name:
            if strategy_name in seen_strategies:
                errors.append({
                    "path": f"{version_prefix}.strategy_name",
                    "message": f"strategy_name '{strategy_name}' is duplicated across versions — each version must use a distinct strategy",
                })
            seen_strategies.add(strategy_name)
        if "prompt" in version:
            errors.append({
                "path": f"{version_prefix}.prompt",
                "message": "Deliverables must not contain 'prompt' — prompts live in shot_list",
            })
        if "copy" in version:
            errors.append({
                "path": f"{version_prefix}.copy",
                "message": "Main image versions must not contain 'copy' field",
            })


def _check_aplus(prefix, aplus, errors):
    if not isinstance(aplus, dict):
        return
    modules = aplus.get("modules") or []
    if len(modules) != 6:
        errors.append({
            "path": f"{prefix}.deliverables.aplus.modules",
            "message": f"Expected exactly 6 A+ modules, got {len(modules)}",
        })
        return

    expected = {
        1: ("hero_with_icons", "1464x1200"),
        2: ("expand_or_deepen", "1464x600"),
        3: ("new_territory", "1464x600"),
        4: ("new_territory", "1464x600"),
        5: ("bridge_to_close", "1464x600"),
        6: ("brand_closing", "1464x600"),
    }

    for idx, mod in enumerate(modules):
        mod_prefix = f"{prefix}.deliverables.aplus.modules[{idx}]"
        number = mod.get("module_number")
        role = mod.get("module_role")
        dimensions = mod.get("dimensions")
        copy_obj = mod.get("copy") or {}

        if number in expected:
            expected_role, expected_dim = expected[number]
            if role != expected_role:
                errors.append({
                    "path": f"{mod_prefix}.module_role",
                    "message": f"Module {number} must have role '{expected_role}', got '{role}'",
                })
            if dimensions != expected_dim:
                errors.append({
                    "path": f"{mod_prefix}.dimensions",
                    "message": f"Module {number} must have dimensions '{expected_dim}', got '{dimensions}'",
                })

        if "prompt" in mod:
            errors.append({
                "path": f"{mod_prefix}.prompt",
                "message": "A+ modules must not contain 'prompt' — prompts live in shot_list",
            })
        if "interaction_points" in mod:
            errors.append({
                "path": f"{mod_prefix}.interaction_points",
                "message": "interaction_points is removed — all A+ modules are full-image",
            })

        if number == 1:
            if not copy_obj.get("tagline"):
                errors.append({"path": f"{mod_prefix}.copy.tagline", "message": "Module 1 must set copy.tagline"})
            elif _word_count(copy_obj["tagline"]) > 6:
                errors.append({
                    "path": f"{mod_prefix}.copy.tagline",
                    "message": f"Module 1 copy.tagline exceeds 6-word cap (got {_word_count(copy_obj['tagline'])} words)",
                })
            if not copy_obj.get("product_name"):
                errors.append({"path": f"{mod_prefix}.copy.product_name", "message": "Module 1 must set copy.product_name"})
            desc = copy_obj.get("description") or ""
            desc_words = _word_count(desc)
            if not desc:
                errors.append({"path": f"{mod_prefix}.copy.description", "message": "Module 1 must set copy.description"})
            elif not (18 <= desc_words <= 22):
                errors.append({
                    "path": f"{mod_prefix}.copy.description",
                    "message": f"Module 1 copy.description must be 18-22 words (got {desc_words})",
                })
            icons = copy_obj.get("icons") or []
            if len(icons) != 3:
                errors.append({"path": f"{mod_prefix}.copy.icons", "message": f"Module 1 must have exactly 3 icons, got {len(icons)}"})
            for i_idx, icon in enumerate(icons):
                label = icon.get("label") or ""
                if _word_count(label) > 3:
                    errors.append({
                        "path": f"{mod_prefix}.copy.icons[{i_idx}].label",
                        "message": f"Icon label '{label}' exceeds 3-word cap",
                    })
        else:
            if not copy_obj.get("headline"):
                errors.append({"path": f"{mod_prefix}.copy.headline", "message": f"Module {number} must set copy.headline"})
            if not copy_obj.get("body"):
                errors.append({"path": f"{mod_prefix}.copy.body", "message": f"Module {number} must set copy.body"})
            if number == 6:
                headline = copy_obj.get("headline") or ""
                body = copy_obj.get("body") or ""
                if len(headline) > 36:
                    errors.append({
                        "path": f"{mod_prefix}.copy.headline",
                        "message": f"Module 6 copy.headline exceeds 36-char cap (got {len(headline)})",
                    })
                body_words = _word_count(body)
                if body_words > 50:
                    errors.append({
                        "path": f"{mod_prefix}.copy.body",
                        "message": f"Module 6 copy.body exceeds 50-word cap (got {body_words})",
                    })


def _check_shot_list(prefix, product, errors, warnings):
    shot_list = product.get("shot_list")
    if shot_list is None:
        return

    shots_by_type = shot_list.get("shots_by_type") or {}
    fits_refs = set()
    for shot_type, options in shots_by_type.items():
        for idx, option in enumerate(options or []):
            opt_prefix = f"{prefix}.shot_list.shots_by_type.{shot_type}[{idx}]"
            prompt = option.get("prompt") or ""
            lowered = prompt.lower()
            for field, keyword in (("lighting", "lighting"), ("shadows", "shadow"), ("surface_material", "surface"), ("color_temperature", "temperature")):
                if not option.get(field):
                    errors.append({"path": f"{opt_prefix}.{field}", "message": f"Missing {field} — shot-list prompts must specify this"})
            for ref in option.get("fits_deliverables") or []:
                fits_refs.add(ref)
            has_no_text = "no text" in lowered
            has_no_watermark = "no watermark" in lowered
            if not (has_no_text and has_no_watermark):
                warnings.append({
                    "path": f"{opt_prefix}.prompt",
                    "message": "Prompt is missing explicit negative constraints ('no text, no watermark, no copy overlays') — shot list must be text-free",
                })

    deliverables = product.get("deliverables") or {}
    expected_refs = set()
    main_image = deliverables.get("main_image")
    if isinstance(main_image, list):
        for version in main_image:
            if version.get("version_number"):
                expected_refs.add(f"main_image.v{version['version_number']}")
    listing = deliverables.get("listing_images")
    if isinstance(listing, dict):
        for img in listing.get("images") or []:
            if img.get("slot_number"):
                expected_refs.add(f"listing_image.slot_{img['slot_number']}")
    aplus = deliverables.get("aplus")
    if isinstance(aplus, dict):
        for mod in aplus.get("modules") or []:
            if mod.get("module_number"):
                expected_refs.add(f"aplus.module_{mod['module_number']}")

    missing = expected_refs - fits_refs
    for ref in sorted(missing):
        warnings.append({
            "path": f"{prefix}.shot_list",
            "message": f"Deliverable '{ref}' is not referenced by any shot option's fits_deliverables",
        })


def _check_phase_scope(brief, phase, errors):
    products = brief.get("products") or []
    if phase >= 1:
        if not brief.get("brand", {}).get("name"):
            errors.append({"path": "brand.name", "message": "Phase 1 requires brand.name"})
        if not products:
            errors.append({"path": "products", "message": "Phase 1 requires at least one product"})
    if phase >= 2:
        if not brief.get("brand", {}).get("guidelines"):
            errors.append({"path": "brand.guidelines", "message": "Phase 2 requires brand.guidelines"})
    for i, product in enumerate(products):
        prefix = f"products[{i}]"
        if phase >= 3 and not product.get("research"):
            errors.append({"path": f"{prefix}.research", "message": "Phase 3 requires research"})
        if phase >= 4:
            if not product.get("creative_direction"):
                errors.append({"path": f"{prefix}.creative_direction", "message": "Phase 4 requires creative_direction"})
            if not product.get("deliverables"):
                errors.append({"path": f"{prefix}.deliverables", "message": "Phase 4 requires deliverables"})
        if phase >= 5 and not product.get("shot_list"):
            errors.append({"path": f"{prefix}.shot_list", "message": "Phase 5 requires shot_list"})
    if phase >= 6 and not brief.get("metadata"):
        errors.append({"path": "metadata", "message": "Phase 6 requires metadata"})


def validate_brief(input_path: str, phase: int | None = None) -> dict:
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if plugin_root:
        schema_path = os.path.join(plugin_root, "reference", "brief-schema.json")
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(script_dir, "..", "reference", "brief-schema.json")

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

    errors = []
    warnings = []

    if phase is None or phase >= 6:
        validator = Draft7Validator(schema)
        for error in sorted(validator.iter_errors(brief), key=lambda e: list(e.path)):
            path = " -> ".join(str(p) for p in error.path) or "(root)"
            errors.append({"path": path, "message": error.message})
    else:
        _check_phase_scope(brief, phase, errors)

    products = brief.get("products") or []
    for i, product in enumerate(products):
        prefix = f"products[{i}]"

        research = product.get("research") or {}
        img_urls = research.get("product", {}).get("image_urls") or []
        if research and not img_urls:
            errors.append({"path": f"{prefix}.research.product.image_urls", "message": "Product image_urls is empty — images are required for the visualization"})

        for j, comp in enumerate(research.get("competitors") or []):
            if not comp.get("image_urls"):
                errors.append({
                    "path": f"{prefix}.research.competitors[{j}].image_urls",
                    "message": f"Competitor '{comp.get('name', '?')}' has no image_urls",
                })
            if comp.get("intersecting_keywords") is None:
                warnings.append({
                    "path": f"{prefix}.research.competitors[{j}].intersecting_keywords",
                    "message": f"Competitor '{comp.get('name', '?')}' missing intersecting_keywords",
                })

        if research and not research.get("visual_implication"):
            warnings.append({"path": f"{prefix}.research.visual_implication", "message": "Missing visual_implication for keyword list"})

        deliverables = product.get("deliverables") or {}
        if "aplus_basic" in deliverables or "aplus_premium" in deliverables:
            errors.append({
                "path": f"{prefix}.deliverables",
                "message": "aplus_basic/aplus_premium are removed — use single 'aplus' field",
            })

        _check_main_image(prefix, deliverables.get("main_image"), errors)
        _check_listing_images(prefix, deliverables.get("listing_images"), errors)
        _check_aplus(prefix, deliverables.get("aplus"), errors)
        _check_shot_list(prefix, product, errors, warnings)

    if errors:
        result = {"valid": False, "error_count": len(errors), "errors": errors}
    else:
        result = {"valid": True, "message": "Brief validates successfully against schema"}

    if warnings:
        result["warning_count"] = len(warnings)
        result["warnings"] = warnings

    return result


def main():
    parser = argparse.ArgumentParser(description="Validate brief JSON against schema")
    parser.add_argument("--input", required=True, help="Path to brief JSON file")
    parser.add_argument("--phase", type=int, choices=range(1, 7), help="Partial validation scoped to phase N (1-6). Omit for full validation.")
    args = parser.parse_args()

    result = validate_brief(args.input, phase=args.phase)
    print(json.dumps(result, indent=2))

    if not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
