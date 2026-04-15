#!/usr/bin/env python3
"""Generate PDF from HTML template + brief JSON. Fetches and inlines images."""

import argparse
import json
import os
import sys

try:
    from jinja2 import Template
except ImportError:
    print(json.dumps({"error": "jinja2 not installed. Run: pip install jinja2"}))
    sys.exit(1)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(
        json.dumps(
            {
                "error": "playwright not installed. Run: pip install playwright && playwright install chromium"
            }
        )
    )
    sys.exit(1)


def generate_pdf(input_path: str, template_path: str, output_path: str) -> dict:
    # Load brief data
    try:
        with open(input_path) as f:
            brief = json.load(f)
    except FileNotFoundError:
        return {"error": f"Brief file not found: {input_path}"}
    except json.JSONDecodeError as e:
        return {"error": f"Invalid brief JSON: {str(e)}"}

    # Load HTML template
    try:
        with open(template_path) as f:
            template_str = f.read()
    except FileNotFoundError:
        return {"error": f"Template not found: {template_path}"}

    # Render HTML with brief data
    template = Template(template_str)
    html_content = template.render(brief=brief)

    # Convert HTML to PDF using Playwright
    # Playwright's Chromium handles fetching and inlining images automatically
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.set_content(html_content, wait_until="networkidle")
            page.pdf(
                path=output_path,
                format="A4",
                print_background=True,
                margin={
                    "top": "0.5in",
                    "bottom": "0.5in",
                    "left": "0.5in",
                    "right": "0.5in",
                },
            )
            browser.close()
    except Exception as e:
        return {"error": f"PDF generation failed: {str(e)}"}

    file_size = os.path.getsize(output_path)
    return {
        "success": True,
        "output": output_path,
        "file_size_bytes": file_size,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate PDF from brief")
    parser.add_argument("--input", required=True, help="Path to brief JSON")
    parser.add_argument("--template", required=True, help="Path to HTML template")
    parser.add_argument("--output", required=True, help="Output PDF path")
    args = parser.parse_args()

    result = generate_pdf(args.input, args.template, args.output)
    print(json.dumps(result, indent=2))

    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
