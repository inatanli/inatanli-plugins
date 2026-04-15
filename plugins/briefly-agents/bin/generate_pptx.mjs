#!/usr/bin/env node
/**
 * generate_pptx.mjs
 *
 * Generates a branded PowerPoint deck from a creative-brief JSON file.
 * Uses PptxGenJS. Outputs a .pptx to the specified path.
 *
 * Usage:
 *   node scripts/generate_pptx.mjs --input brief.json --output brief.pptx
 */

import PptxGenJS from "pptxgenjs";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Image helpers ──────────────────────────────────────────────────────────
/**
 * Fetch a single image URL and return a PptxGenJS-compatible base64 data string.
 * Returns null on failure so missing images don't crash the deck.
 */
async function fetchAsBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(JSON.stringify({ warn: `Image fetch ${res.status}: ${url}` }));
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mime = contentType.split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    return `${mime};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error(JSON.stringify({ warn: `Image fetch failed: ${url} — ${e.message}` }));
    return null;
  }
}

/**
 * Walk the brief, collect every unique image URL, fetch them all in parallel,
 * and return a Map<url, base64DataString>.
 */
async function prefetchAllImages(brief) {
  const urls = new Set();
  for (const product of brief.products || []) {
    const research = product.research || {};
    for (const u of research.product?.image_urls || []) urls.add(u);
    for (const comp of research.competitors || []) {
      for (const u of comp.image_urls || []) urls.add(u);
    }
  }

  const cache = new Map();
  if (urls.size === 0) return cache;

  // Batch in groups of 10 to avoid overwhelming the network
  const allUrls = [...urls];
  for (let i = 0; i < allUrls.length; i += 10) {
    const batch = allUrls.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (u) => ({ url: u, data: await fetchAsBase64(u) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.data) {
        cache.set(r.value.url, r.value.data);
      }
    }
  }

  console.error(JSON.stringify({ info: `Prefetched ${cache.size}/${urls.size} images as base64` }));
  return cache;
}

// Module-level image cache — populated before slide building
let imageCache = new Map();

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};
const INPUT = flag("--input");
const OUTPUT = flag("--output") || "brief.pptx";

if (!INPUT) {
  console.error(JSON.stringify({ error: "Missing --input <brief.json>" }));
  process.exit(1);
}

// ── Load brief ──────────────────────────────────────────────────────────────
let brief;
try {
  brief = JSON.parse(readFileSync(resolve(INPUT), "utf-8"));
} catch (e) {
  console.error(JSON.stringify({ error: `Failed to read brief: ${e.message}` }));
  process.exit(1);
}

// ── Constants ───────────────────────────────────────────────────────────────
const SLIDE_W = 13.333; // 16:9 widescreen inches
const SLIDE_H = 7.5;
const MARGIN = 0.6;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_START_Y = 1.4; // below section header

// ── Brand extraction ────────────────────────────────────────────────────────
const brand = brief.brand || {};
const guidelines = brand.guidelines || {};
const colors = guidelines.colors || {};
const typography = guidelines.typography || {};

// Brand colors (strip leading # if present, PptxGenJS wants hex without #)
const hex = (c) => (c || "").replace(/^#/, "") || "333333";
const isLightColor = (hexStr) => {
  const r = parseInt(hexStr.slice(0, 2), 16);
  const g = parseInt(hexStr.slice(2, 4), 16);
  const b = parseInt(hexStr.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
};
const COLOR = {
  primary: hex(colors.primary),
  secondary: hex(colors.secondary),
  accent: hex(colors.accent),
  white: "FFFFFF",
  black: "1A1A1A",
  lightGray: "F4F4F4",
  midGray: "E0E0E0",
  darkGray: "666666",
  bodyText: "2D2D2D",
};

// Font mapping – brand fonts with universal fallbacks
const FALLBACK_HEADING = "Calibri";
const FALLBACK_BODY = "Calibri";

const FONT = {
  heading: typography.heading_font || FALLBACK_HEADING,
  body: typography.body_font || FALLBACK_BODY,
};

// ── Presentation instance ───────────────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pptx.author = "Creative Brief Agent";
pptx.subject = `Creative Brief — ${brand.name || "Brand"}`;

// ── Slide master definitions ────────────────────────────────────────────────
pptx.defineSlideMaster({
  title: "SECTION_HEADER",
  background: { color: COLOR.primary },
  objects: [
    {
      rect: {
        x: 0, y: SLIDE_H - 0.08, w: "100%", h: 0.08,
        fill: { color: COLOR.accent || COLOR.secondary },
      },
    },
  ],
});

pptx.defineSlideMaster({
  title: "CONTENT",
  background: { color: COLOR.white },
  objects: [
    // Top accent bar
    {
      rect: {
        x: 0, y: 0, w: "100%", h: 0.06,
        fill: { color: COLOR.primary },
      },
    },
    // Bottom accent line
    {
      rect: {
        x: 0, y: SLIDE_H - 0.04, w: "100%", h: 0.04,
        fill: { color: COLOR.accent || COLOR.midGray },
      },
    },
  ],
  slideNumber: { x: "95%", y: "96%", color: COLOR.darkGray, fontSize: 8 },
});

// ── Helper: add a section header slide ──────────────────────────────────────
function addSectionSlide(title, subtitle) {
  const slide = pptx.addSlide({ masterName: "SECTION_HEADER" });
  slide.addText(title, {
    x: MARGIN, y: 2.2, w: CONTENT_W, h: 1.4,
    fontSize: 40, fontFace: FONT.heading, color: COLOR.white,
    bold: true, align: "left",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN, y: 3.6, w: CONTENT_W, h: 0.8,
      fontSize: 18, fontFace: FONT.body, color: COLOR.white,
      bold: false, align: "left", transparency: 20,
    });
  }
  return slide;
}

// ── Helper: add a content slide with a title ────────────────────────────────
function addContentSlide(title) {
  const slide = pptx.addSlide({ masterName: "CONTENT" });
  slide.addText(title, {
    x: MARGIN, y: 0.25, w: CONTENT_W, h: 0.75,
    fontSize: 26, fontFace: FONT.heading, color: COLOR.primary,
    bold: true, align: "left",
  });
  // Divider line under title
  slide.addShape(pptx.shapes.LINE, {
    x: MARGIN, y: 1.05, w: CONTENT_W, h: 0,
    line: { color: COLOR.midGray, width: 1 },
  });
  return slide;
}

// ── Helper: color swatch ────────────────────────────────────────────────────
function addSwatch(slide, x, y, colorHex, label) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w: 1.4, h: 1.0,
    rectRadius: 0.1,
    fill: { color: colorHex },
    line: { color: COLOR.midGray, width: 0.5 },
  });
  slide.addText(`#${colorHex}`, {
    x, y: y + 1.05, w: 1.4, h: 0.35,
    fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
    align: "center",
  });
  slide.addText(label, {
    x, y: y + 1.35, w: 1.4, h: 0.3,
    fontSize: 8, fontFace: FONT.body, color: COLOR.darkGray,
    align: "center", bold: true,
  });
}

// ── Helper: render image grid ───────────────────────────────────────────────
function addImageGrid(slide, urls, startX, startY, maxW, imgH, cols, gap = 0.15) {
  if (!urls || urls.length === 0) return startY;
  const imgW = (maxW - gap * (cols - 1)) / cols;
  let x = startX;
  let y = startY;
  let col = 0;
  for (const url of urls) {
    const imgData = imageCache.get(url);
    if (!imgData) { col++; if (col >= cols) { col = 0; x = startX; y += imgH + gap; } else { x += imgW + gap; } continue; }
    slide.addImage({
      data: imgData,
      x, y, w: imgW, h: imgH,
      sizing: { type: "contain", w: imgW, h: imgH },
    });
    col++;
    if (col >= cols) {
      col = 0;
      x = startX;
      y += imgH + gap;
    } else {
      x += imgW + gap;
    }
  }
  return col === 0 ? y : y + imgH + gap;
}

// ── Helper: render SVG wireframe as shapes on slide ─────────────────────────
/**
 * Renders a simple wireframe using PptxGenJS shapes.
 * Uses the wireframe_description to create boxes, circles, and image
 * placeholders (box with X) with copy text placed directly on them.
 *
 * @param {object} slide - PptxGenJS slide
 * @param {string} description - wireframe_description text
 * @param {string|null} copy - copy text to overlay
 * @param {number} originX - left edge
 * @param {number} originY - top edge
 * @param {number} frameW - wireframe width
 * @param {number} frameH - wireframe height
 */
function renderWireframe(slide, description, copy, originX, originY, frameW, frameH) {
  const desc = (description || "").toLowerCase();

  // Outer wireframe border
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: originX, y: originY, w: frameW, h: frameH,
    fill: { color: "FAFAFA" },
    line: { color: "BBBBBB", width: 1 },
  });

  // Label
  slide.addText("WIREFRAME", {
    x: originX, y: originY, w: frameW, h: 0.25,
    fontSize: 7, fontFace: FONT.body, color: "999999",
    align: "center", bold: true,
  });

  const innerPad = 0.12;
  const innerX = originX + innerPad;
  const innerY = originY + 0.28;
  const innerW = frameW - innerPad * 2;
  const innerH = frameH - 0.4;

  // Parse description for zones
  const hasProduct = /product|hero|item|bottle|package|jar|bag/i.test(desc);
  const hasHeadline = /headline|title|heading|text overlay|copy/i.test(desc);
  const hasLifestyle = /lifestyle|background|scene|environment|setting/i.test(desc);
  const hasFeatures = /feature|callout|benefit|icon|bullet/i.test(desc);
  const hasLogo = /logo|brand mark/i.test(desc);
  const hasBadge = /badge|seal|stamp|certification|award/i.test(desc);
  const hasComparison = /comparison|before.after|vs|versus|side.by.side/i.test(desc);
  const hasGrid = /grid|gallery|collage|multiple/i.test(desc);

  // Determine layout pattern
  if (hasComparison) {
    // Side-by-side comparison
    const halfW = (innerW - 0.1) / 2;
    drawImagePlaceholder(slide, innerX, innerY, halfW, innerH, "BEFORE");
    drawImagePlaceholder(slide, innerX + halfW + 0.1, innerY, halfW, innerH, "AFTER");
    if (copy) {
      overlayText(slide, copy, originX, originY + frameH - 0.5, frameW, 0.45);
    }
  } else if (hasGrid) {
    // 2x2 grid
    const cellW = (innerW - 0.08) / 2;
    const cellH = (innerH - 0.08) / 2;
    drawImagePlaceholder(slide, innerX, innerY, cellW, cellH, "IMG 1");
    drawImagePlaceholder(slide, innerX + cellW + 0.08, innerY, cellW, cellH, "IMG 2");
    drawImagePlaceholder(slide, innerX, innerY + cellH + 0.08, cellW, cellH, "IMG 3");
    drawImagePlaceholder(slide, innerX + cellW + 0.08, innerY + cellH + 0.08, cellW, cellH, "IMG 4");
  } else if (hasFeatures && hasProduct) {
    // Product left, features right
    const prodW = innerW * 0.45;
    const featW = innerW * 0.5;
    drawImagePlaceholder(slide, innerX, innerY, prodW, innerH, "PRODUCT");
    // Feature callout lines
    const featX = innerX + prodW + innerW * 0.05;
    const rows = 3;
    const rowH = innerH / rows;
    for (let i = 0; i < rows; i++) {
      const fy = innerY + i * rowH + 0.05;
      slide.addShape(pptx.shapes.OVAL, {
        x: featX, y: fy + 0.05, w: 0.25, h: 0.25,
        line: { color: "AAAAAA", width: 0.75 },
      });
      slide.addText(`Feature ${i + 1}`, {
        x: featX + 0.32, y: fy, w: featW - 0.35, h: rowH - 0.1,
        fontSize: 7, fontFace: FONT.body, color: "888888",
        valign: "middle",
      });
    }
    if (copy) {
      overlayText(slide, copy, featX, innerY + innerH - 0.35, featW, 0.3);
    }
  } else if (hasLifestyle && hasProduct) {
    // Full background with centered product
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: innerX, y: innerY, w: innerW, h: innerH,
      fill: { color: "F0F0F0" },
      line: { color: "CCCCCC", width: 0.5, dashType: "dash" },
    });
    slide.addText("LIFESTYLE BG", {
      x: innerX, y: innerY, w: innerW, h: 0.2,
      fontSize: 6, fontFace: FONT.body, color: "AAAAAA", align: "center",
    });
    // Product in center
    const pW = innerW * 0.35;
    const pH = innerH * 0.6;
    drawImagePlaceholder(slide, innerX + (innerW - pW) / 2, innerY + (innerH - pH) / 2, pW, pH, "PRODUCT");
    if (hasHeadline && copy) {
      overlayText(slide, copy, innerX + 0.1, innerY + innerH - 0.45, innerW - 0.2, 0.4);
    }
  } else if (hasProduct && hasHeadline) {
    // Product with headline zone
    const prodH = innerH * 0.65;
    drawImagePlaceholder(slide, innerX + innerW * 0.15, innerY, innerW * 0.7, prodH, "PRODUCT");
    // Headline zone
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: innerX, y: innerY + prodH + 0.08, w: innerW, h: innerH - prodH - 0.08,
      fill: { color: "F0F0F0" },
      line: { color: "CCCCCC", width: 0.5 },
    });
    const headlineText = copy || "HEADLINE";
    slide.addText(headlineText, {
      x: innerX + 0.05, y: innerY + prodH + 0.08, w: innerW - 0.1, h: innerH - prodH - 0.08,
      fontSize: 7, fontFace: FONT.body, color: "777777",
      align: "center", valign: "middle",
    });
  } else if (hasProduct) {
    // Centered product only
    const pW = innerW * 0.6;
    const pH = innerH * 0.75;
    drawImagePlaceholder(slide, innerX + (innerW - pW) / 2, innerY + (innerH - pH) / 2, pW, pH, "PRODUCT");
    if (copy) {
      overlayText(slide, copy, innerX, originY + frameH - 0.45, innerW, 0.35);
    }
  } else {
    // Generic layout — full image placeholder
    drawImagePlaceholder(slide, innerX, innerY, innerW, innerH, "VISUAL");
    if (copy) {
      overlayText(slide, copy, innerX, innerY + innerH * 0.65, innerW, innerH * 0.3);
    }
  }

  // Badge
  if (hasBadge) {
    slide.addShape(pptx.shapes.OVAL, {
      x: originX + frameW - 0.55, y: originY + 0.3, w: 0.45, h: 0.45,
      line: { color: "AAAAAA", width: 0.75 },
    });
    slide.addText("BADGE", {
      x: originX + frameW - 0.55, y: originY + 0.3, w: 0.45, h: 0.45,
      fontSize: 5, fontFace: FONT.body, color: "999999",
      align: "center", valign: "middle",
    });
  }

  // Logo
  if (hasLogo) {
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: originX + 0.1, y: originY + frameH - 0.4, w: 0.5, h: 0.25,
      line: { color: "BBBBBB", width: 0.5 },
    });
    slide.addText("LOGO", {
      x: originX + 0.1, y: originY + frameH - 0.4, w: 0.5, h: 0.25,
      fontSize: 5, fontFace: FONT.body, color: "AAAAAA", align: "center", valign: "middle",
    });
  }
}

/** Draw an image placeholder — rectangle with an X through it */
function drawImagePlaceholder(slide, x, y, w, h, label) {
  // Box
  slide.addShape(pptx.shapes.RECTANGLE, {
    x, y, w, h,
    line: { color: "BBBBBB", width: 0.75 },
  });
  // Diagonal top-left to bottom-right
  slide.addShape(pptx.shapes.LINE, {
    x, y, w, h,
    line: { color: "CCCCCC", width: 0.5 },
  });
  // Diagonal top-right to bottom-left
  slide.addShape(pptx.shapes.LINE, {
    x: x + w, y, w: -w, h,
    line: { color: "CCCCCC", width: 0.5 },
  });
  // Label
  if (label) {
    slide.addText(label, {
      x, y, w, h,
      fontSize: 7, fontFace: FONT.body, color: "AAAAAA",
      align: "center", valign: "middle",
    });
  }
}

/** Overlay copy text on a translucent bar */
function overlayText(slide, text, x, y, w, h) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: "FFFFFF", transparency: 25 },
  });
  slide.addText(text, {
    x: x + 0.05, y, w: w - 0.1, h,
    fontSize: 7, fontFace: FONT.body, color: "555555",
    align: "center", valign: "middle", shrinkText: true,
  });
}

// ── Helper: truncate text ───────────────────────────────────────────────────
function trunc(str, max = 120) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. COVER SLIDE ──────────────────────────────────────────────────────────
function buildCover() {
  const slide = pptx.addSlide();
  slide.bkgd = COLOR.primary;

  // Brand name × Scalene Design (mixed fonts on one line)
  slide.addText(
    [
      { text: brand.name || "Creative Brief", options: { fontFace: FONT.heading, bold: true } },
      { text: " x ", options: { fontFace: "Space Grotesk", bold: false } },
      { text: "Scalene Design", options: { fontFace: "Space Grotesk", bold: true } },
    ],
    {
      x: MARGIN, y: 1.5, w: CONTENT_W, h: 1.5,
      fontSize: 52, color: COLOR.white, align: "left",
    }
  );

  // Subtitle
  const productCount = (brief.products || []).length;
  const productNames = (brief.products || []).map((p) => p.name).join(" · ");
  slide.addText("CREATIVE BRIEF", {
    x: MARGIN, y: 3.1, w: CONTENT_W, h: 0.6,
    fontSize: 18, fontFace: FONT.heading, color: COLOR.white,
    bold: false, letterSpacing: 6, transparency: 15,
  });

  slide.addText(productNames || `${productCount} product(s)`, {
    x: MARGIN, y: 3.8, w: CONTENT_W, h: 0.5,
    fontSize: 14, fontFace: FONT.body, color: COLOR.white,
    transparency: 30,
  });

  // Date
  const dateStr = brief.metadata?.generated_date || new Date().toISOString().split("T")[0];
  slide.addText(dateStr, {
    x: MARGIN, y: SLIDE_H - 1.2, w: CONTENT_W, h: 0.4,
    fontSize: 11, fontFace: FONT.body, color: COLOR.white,
    transparency: 40,
  });

  // Bottom accent bar
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: SLIDE_H - 0.08, w: "100%", h: 0.08,
    fill: { color: COLOR.accent || COLOR.secondary },
  });
}

// ── 2. BRAND GUIDELINES ─────────────────────────────────────────────────────
function buildBrandGuidelines() {
  const slide = addContentSlide("Brand Guidelines");

  const ROW1_Y = CONTENT_START_Y;
  const cardGap = 0.2;

  // ── TOP ROW: Colors card (left) + Typography card (right) ──
  const topCardH = 1.35;
  const topLeftW = CONTENT_W * 0.55;
  const topRightW = CONTENT_W - topLeftW - cardGap;
  const topRightX = MARGIN + topLeftW + cardGap;

  // Colors card background
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: MARGIN, y: ROW1_Y, w: topLeftW, h: topCardH,
    rectRadius: 0.1, fill: { color: COLOR.lightGray },
    line: { color: COLOR.midGray, width: 0.5 },
  });

  slide.addText("COLORS", {
    x: MARGIN + 0.2, y: ROW1_Y + 0.12, w: 1.2, h: 0.28,
    fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
    bold: true, charSpacing: 2,
  });

  const chipColors = [
    { colorHex: COLOR.primary, label: "Primary" },
    { colorHex: COLOR.secondary, label: "Secondary" },
    { colorHex: COLOR.accent, label: "Accent" },
  ];
  if (colors.additional) {
    colors.additional.forEach((c, i) =>
      chipColors.push({ colorHex: hex(c), label: `Add. ${i + 1}` })
    );
  }

  const CHIP_H = 0.4;
  const CHIP_GAP = 0.12;
  const CHIP_W = (topLeftW - 0.4 - CHIP_GAP * (chipColors.length - 1)) / Math.max(chipColors.length, 1);
  let chipX = MARGIN + 0.2;
  const chipY = ROW1_Y + 0.48;
  for (const chip of chipColors) {
    if (!chip.colorHex || chip.colorHex === "333333") continue;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: chipX, y: chipY, w: CHIP_W, h: CHIP_H,
      rectRadius: 0.06,
      fill: { color: chip.colorHex },
      line: { color: COLOR.midGray, width: 0.5 },
    });
    const labelColor = isLightColor(chip.colorHex) ? "333333" : "FFFFFF";
    slide.addText(`${chip.label}\n#${chip.colorHex}`, {
      x: chipX, y: chipY, w: CHIP_W, h: CHIP_H,
      fontSize: 7, fontFace: FONT.body, color: labelColor,
      align: "center", valign: "middle", bold: true,
    });
    chipX += CHIP_W + CHIP_GAP;
  }

  // Typography card background
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: topRightX, y: ROW1_Y, w: topRightW, h: topCardH,
    rectRadius: 0.1, fill: { color: COLOR.lightGray },
    line: { color: COLOR.midGray, width: 0.5 },
  });

  slide.addText("TYPOGRAPHY", {
    x: topRightX + 0.2, y: ROW1_Y + 0.12, w: 2.0, h: 0.28,
    fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
    bold: true, charSpacing: 2,
  });

  slide.addText([
    { text: "Heading  ", options: { fontSize: 10, color: COLOR.darkGray, fontFace: FONT.body } },
    { text: FONT.heading, options: { fontSize: 20, color: COLOR.primary, fontFace: FONT.heading, bold: true } },
  ], {
    x: topRightX + 0.2, y: ROW1_Y + 0.42, w: topRightW - 0.4, h: 0.4,
    valign: "middle",
  });

  slide.addText([
    { text: "Body  ", options: { fontSize: 10, color: COLOR.darkGray, fontFace: FONT.body } },
    { text: FONT.body, options: { fontSize: 16, color: COLOR.bodyText, fontFace: FONT.body } },
  ], {
    x: topRightX + 0.2, y: ROW1_Y + 0.85, w: topRightW - 0.4, h: 0.35,
    valign: "middle",
  });

  // ── MIDDLE ROW: Tone | Audience | Descriptors (3 cards) ──
  const ROW2_Y = ROW1_Y + topCardH + cardGap;
  const midCardH = 1.55;
  const colW3 = (CONTENT_W - cardGap * 2) / 3;
  const col2X = MARGIN + colW3 + cardGap;
  const col3X = MARGIN + (colW3 + cardGap) * 2;

  // Tone of Voice card
  if (guidelines.tone_of_voice) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: MARGIN, y: ROW2_Y, w: colW3, h: midCardH,
      rectRadius: 0.1, fill: { color: COLOR.lightGray },
      line: { color: COLOR.midGray, width: 0.5 },
    });
    slide.addText("TONE OF VOICE", {
      x: MARGIN + 0.18, y: ROW2_Y + 0.12, w: colW3 - 0.36, h: 0.28,
      fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
      bold: true, charSpacing: 2,
    });
    slide.addText(trunc(guidelines.tone_of_voice, 200), {
      x: MARGIN + 0.18, y: ROW2_Y + 0.45, w: colW3 - 0.36, h: midCardH - 0.55,
      fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
  }

  // Audience card
  if (guidelines.target_demographic) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: col2X, y: ROW2_Y, w: colW3, h: midCardH,
      rectRadius: 0.1, fill: { color: COLOR.lightGray },
      line: { color: COLOR.midGray, width: 0.5 },
    });
    slide.addText("AUDIENCE", {
      x: col2X + 0.18, y: ROW2_Y + 0.12, w: colW3 - 0.36, h: 0.28,
      fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
      bold: true, charSpacing: 2,
    });
    slide.addText(trunc(guidelines.target_demographic, 200), {
      x: col2X + 0.18, y: ROW2_Y + 0.45, w: colW3 - 0.36, h: midCardH - 0.55,
      fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
  }

  // Brand Descriptors card
  if (guidelines.brand_descriptors?.length) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: col3X, y: ROW2_Y, w: colW3, h: midCardH,
      rectRadius: 0.1, fill: { color: COLOR.lightGray },
      line: { color: COLOR.midGray, width: 0.5 },
    });
    slide.addText("BRAND DESCRIPTORS", {
      x: col3X + 0.18, y: ROW2_Y + 0.12, w: colW3 - 0.36, h: 0.28,
      fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
      bold: true, charSpacing: 2,
    });
    const descriptorText = guidelines.brand_descriptors.slice(0, 5).map((d) => `●  ${d}`).join("\n");
    slide.addText(descriptorText, {
      x: col3X + 0.18, y: ROW2_Y + 0.45, w: colW3 - 0.36, h: midCardH - 0.55,
      fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
  }

  // ── BOTTOM ROW: DO'S & DON'TS ──
  const ROW3_Y = ROW2_Y + midCardH + cardGap;
  const rules = guidelines.hard_rules;
  if (rules) {
    const panelW = (CONTENT_W - cardGap) / 2;
    const panelH = SLIDE_H - ROW3_Y - 0.35;

    if (rules.dos?.length) {
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: MARGIN, y: ROW3_Y, w: panelW, h: panelH,
        rectRadius: 0.12, fill: { color: "E8F5E9" },
        line: { color: "66BB6A", width: 1.5 },
      });
      slide.addText("DO", {
        x: MARGIN + 0.2, y: ROW3_Y + 0.12, w: panelW - 0.4, h: 0.38,
        fontSize: 14, fontFace: FONT.heading, color: "2E7D32", bold: true,
      });
      const dosText = rules.dos.slice(0, 3).map((d) => `✓  ${d}`).join("\n\n");
      slide.addText(dosText, {
        x: MARGIN + 0.2, y: ROW3_Y + 0.55, w: panelW - 0.4, h: panelH - 0.65,
        fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }

    if (rules.donts?.length) {
      const dontX = MARGIN + panelW + cardGap;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: dontX, y: ROW3_Y, w: panelW, h: panelH,
        rectRadius: 0.12, fill: { color: "FFEBEE" },
        line: { color: "EF5350", width: 1.5 },
      });
      slide.addText("DON'T", {
        x: dontX + 0.2, y: ROW3_Y + 0.12, w: panelW - 0.4, h: 0.38,
        fontSize: 14, fontFace: FONT.heading, color: "C62828", bold: true,
      });
      const dontsText = rules.donts.slice(0, 3).map((d) => `✗  ${d}`).join("\n\n");
      slide.addText(dontsText, {
        x: dontX + 0.2, y: ROW3_Y + 0.55, w: panelW - 0.4, h: panelH - 0.65,
        fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }
  }
}

// ── 3. PER-PRODUCT SLIDES ───────────────────────────────────────────────────
function buildProduct(product, index) {
  const research = product.research || {};
  const prodData = research.product || {};
  const competitors = research.competitors || [];
  const keywords = research.keywords || [];
  const gap = research.gap_analysis || {};
  const creative = product.creative_direction || {};
  const deliverables = product.deliverables || {};

  // ── Product overview — 2-column layout
  // Left column (~1/3): Full product info (description, price, ratings, USPs, complaints)
  // Right column (~2/3): Keywords, visual patterns, opportunities, complaints to address
  {
    const overviewTitle = [product.name || `Product ${index + 1}`, product.asin ? `ASIN: ${product.asin}` : null].filter(Boolean).join(" | ");
    const slide = addContentSlide(overviewTitle);

    const topY = CONTENT_START_Y;
    const leftW = CONTENT_W / 3; // 1/3 width for left column
    const colGap = 0.25;
    const rightX = MARGIN + leftW + colGap;
    const rightW = CONTENT_W - leftW - colGap; // 2/3 width for right column
    const availH = SLIDE_H - topY - 0.25; // remaining height

    // ═══════════════════════════════════════════════════════
    // LEFT COLUMN (1/3): Full Product Information
    // ═══════════════════════════════════════════════════════

    // ── Left column background card
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: MARGIN - 0.1, y: topY - 0.1, w: leftW + 0.2, h: availH + 0.1,
      rectRadius: 0.1, fill: { color: COLOR.lightGray },
      line: { color: COLOR.midGray, width: 0.5 },
    });

    let infoY = topY + 0.1;

    // ── Image Grid: 2 rows x 4 columns at the top (no gaps)
    if (prodData.image_urls?.length) {
      const imgRows = 2;
      const imgCols = 4;
      const imgCount = Math.min(prodData.image_urls.length, 8);
      
      // 1:1 square cells, slightly reduced to leave room for USPs
      const cellW = (leftW - 0.3) / imgCols * 0.92;
      const cellH = cellW; // 1:1 square
      
      let imgX = MARGIN + 0.15;
      let imgY = infoY;
      let col = 0;
      let row = 0;

      for (const url of prodData.image_urls.slice(0, imgCount)) {
        const imgData = imageCache.get(url);
        if (!imgData) { col++; if (col >= imgCols) { col = 0; row++; imgY += cellH; imgX = MARGIN + 0.15; } else { imgX += cellW; } continue; }
        slide.addImage({
          data: imgData,
          x: imgX, y: imgY, w: cellW, h: cellH,
          sizing: { type: "contain", w: cellW, h: cellH },
        });
        col++;
        if (col >= imgCols) {
          col = 0;
          row++;
          imgY += cellH;
          imgX = MARGIN + 0.15;
        } else {
          imgX += cellW;
        }
      }
      infoY += cellH * imgRows + 0.15;
    }

    // Description (full length)
    if (prodData.description) {
      slide.addText("DESCRIPTION", {
        x: MARGIN + 0.15, y: infoY, w: leftW - 0.3, h: 0.28,
        fontSize: 9, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(prodData.description, {
        x: MARGIN + 0.15, y: infoY + 0.3, w: leftW - 0.3, h: 1.0,
        fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
      infoY += 1.4;
    }

    // Price + rating
    const metaLine = [
      prodData.price ? `Price: ${prodData.price}` : null,
      prodData.rating ? `★ ${prodData.rating}` : null,
    ].filter(Boolean).join("   |   ");
    if (metaLine) {
      slide.addText(metaLine, {
        x: MARGIN + 0.15, y: infoY, w: leftW - 0.3, h: 0.35,
        fontSize: 11, fontFace: FONT.body, color: COLOR.darkGray, bold: true,
      });
      infoY += 0.45;
    }

    // Divider
    slide.addShape(pptx.shapes.LINE, {
      x: MARGIN + 0.1, y: infoY, w: leftW - 0.2, h: 0,
      line: { color: COLOR.midGray, width: 0.75 },
    });
    infoY += 0.15;

    // Key USPs
    slide.addText("Key USPs", {
      x: MARGIN + 0.15, y: infoY, w: leftW - 0.3, h: 0.28,
      fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
    });
    if (prodData.usps?.length) {
      slide.addText(prodData.usps.map((u) => `●  ${u}`).join("\n"), {
        x: MARGIN + 0.15, y: infoY + 0.32, w: leftW - 0.3, h: availH - (infoY - topY) - 0.32,
        fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }

    // ═══════════════════════════════════════════════════════
    // RIGHT COLUMN (2/3): 2x2 Grid Layout
    // ═══════════════════════════════════════════════════════
    // Top Left: Keywords          | Top Right: Complaints to Address
    // Bottom Left: Visual Patterns | Bottom Right: Differentiation Strategies

    const colGap2 = 0.15;
    const rowGap2 = 0.15;
    const cardW2 = (rightW - colGap2) / 2; // Half width minus gap
    const cardH2 = (availH - rowGap2) / 2; // Half height minus gap

    // ── Top Left Card: Keywords + Visual Implication
    if (keywords.length) {
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: rightX, y: topY, w: cardW2, h: cardH2,
        rectRadius: 0.12, fill: { color: COLOR.lightGray },
        line: { color: COLOR.midGray, width: 0.5 },
      });
      slide.addText("Top Keywords & Visual Intent", {
        x: rightX + 0.15, y: topY + 0.1, w: cardW2 - 0.3, h: 0.3,
        fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      // 4 keywords max, then the visual_implication summary below
      const kwRuns = [];
      keywords.slice(0, 4).forEach((kw, i) => {
        const vol = kw.search_volume ? `  —  ${Number(kw.search_volume).toLocaleString()} avg. monthly searches` : "";
        if (i > 0) kwRuns.push({ text: "\n", options: { fontSize: 4 } });
        kwRuns.push({
          text: `${trunc(kw.keyword || "", 32)}${vol}\n`,
          options: { fontSize: 9, bold: true, color: COLOR.bodyText, fontFace: FONT.body },
        });
      });
      if (research.visual_implication) {
        kwRuns.push({ text: "\n", options: { fontSize: 4 } });
        kwRuns.push({
          text: trunc(research.visual_implication, 220),
          options: { fontSize: 8, italic: true, color: COLOR.primary, fontFace: FONT.body },
        });
      }
      slide.addText(kwRuns, {
        x: rightX + 0.15, y: topY + 0.42, w: cardW2 - 0.3, h: cardH2 - 0.52,
        valign: "top",
      });
    }

    // ── Top Right Card: Complaints to Address
    const complaintItems = (gap.complaints_to_address || []).slice(0, 5);
    if (complaintItems.length) {
      const rightCardX = rightX + cardW2 + colGap2;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: rightCardX, y: topY, w: cardW2, h: cardH2,
        rectRadius: 0.12, fill: { color: COLOR.lightGray },
        line: { color: COLOR.midGray, width: 0.5 },
      });
      slide.addText("Complaints to Address", {
        x: rightCardX + 0.15, y: topY + 0.1, w: cardW2 - 0.3, h: 0.3,
        fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(complaintItems.map((i) => `●  ${i}`).join("\n\n"), {
        x: rightCardX + 0.15, y: topY + 0.42, w: cardW2 - 0.3, h: cardH2 - 0.52,
        fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }

    // ── Bottom Left Card: Visual Patterns
    if (gap.visual_patterns?.length) {
      const bottomY = topY + cardH2 + rowGap2;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: rightX, y: bottomY, w: cardW2, h: cardH2,
        rectRadius: 0.12, fill: { color: COLOR.lightGray },
        line: { color: COLOR.midGray, width: 0.5 },
      });
      slide.addText("Visual Patterns", {
        x: rightX + 0.15, y: bottomY + 0.1, w: cardW2 - 0.3, h: 0.3,
        fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(gap.visual_patterns.slice(0, 4).map((i) => `●  ${i}`).join("\n\n"), {
        x: rightX + 0.15, y: bottomY + 0.42, w: cardW2 - 0.3, h: cardH2 - 0.52,
        fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }

    // ── Bottom Right Card: Differentiation Strategies
    if (gap.differentiation_opportunities?.length) {
      const bottomY = topY + cardH2 + rowGap2;
      const rightCardX = rightX + cardW2 + colGap2;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: rightCardX, y: bottomY, w: cardW2, h: cardH2,
        rectRadius: 0.12, fill: { color: COLOR.lightGray },
        line: { color: COLOR.midGray, width: 0.5 },
      });
      slide.addText("Differentiation Strategies", {
        x: rightCardX + 0.15, y: bottomY + 0.1, w: cardW2 - 0.3, h: 0.3,
        fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(gap.differentiation_opportunities.slice(0, 4).map((i) => `●  ${i}`).join("\n\n"), {
        x: rightCardX + 0.15, y: bottomY + 0.42, w: cardW2 - 0.3, h: cardH2 - 0.52,
        fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }
  }

  // ── Competitors — all on one slide (3-column layout)
  if (competitors.length) {
    const slide = addContentSlide("Competitor Landscape");
    const AVAIL_H = SLIDE_H - CONTENT_START_Y - 0.15;
    const cols = 3;
    const colGap = 0.2;
    const colW = (CONTENT_W - colGap * (cols - 1)) / cols;
    const cardGap = 0.15;

    // Calculate how many competitors can fit per column
    const competitorsPerCol = Math.ceil(competitors.length / cols);
    
    // Calculate card height based on available space
    const cardsInTallestCol = competitorsPerCol;
    const cardH = (AVAIL_H - cardGap * (cardsInTallestCol - 1)) / cardsInTallestCol;

    // Image grid dimensions (2 rows, 4 columns, 1:1 ratio)
    const imgGridPadding = 0.1;
    const imgGridW = colW - imgGridPadding * 2;
    const imgCols = 4;
    const imgRows = 2;
    const imgGap = 0.06;
    const imgCellSize = Math.min(
      (imgGridW - imgGap * (imgCols - 1)) / imgCols,
      (cardH * 0.35 - imgGap * (imgRows - 1)) / imgRows
    );
    const imgGridH = imgCellSize * imgRows + imgGap * (imgRows - 1);
    const imgGridY = imgGridPadding;

    competitors.forEach((comp, ci) => {
      // Determine column and row position
      const col = ci % cols;
      const row = Math.floor(ci / cols);
      
      const x = MARGIN + col * (colW + colGap);
      const y = CONTENT_START_Y + row * (cardH + cardGap);

      // Card background
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: colW, h: cardH,
        rectRadius: 0.08,
        fill: { color: ci % 2 === 0 ? COLOR.lightGray : COLOR.white },
        line: { color: COLOR.midGray, width: 0.5 },
      });

      let innerY = y + 0.08;

      // Name + ASIN (one line) with hyperlink
      const nameW = colW - imgGridPadding * 2;
      const nameLine = [
        { text: trunc(comp.name || "Competitor", 30), options: { fontSize: 11, bold: true, color: COLOR.primary, fontFace: FONT.heading } },
      ];
      if (comp.asin) {
        nameLine.push({ text: "  |  ", options: { fontSize: 10, color: COLOR.darkGray } });
        nameLine.push({
          text: comp.asin,
          options: {
            fontSize: 10, color: COLOR.accent || COLOR.secondary,
            hyperlink: { url: `https://www.amazon.com/dp/${comp.asin}`, tooltip: `View on Amazon: ${comp.asin}` },
          },
        });
      }
      slide.addText(nameLine, {
        x: x + imgGridPadding, y: innerY, w: nameW, h: 0.3,
        fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      innerY += 0.32;

      // Price and rating (one line)
      const metrics = [
        comp.price ? `${comp.price}` : null,
        comp.rating ? `★ ${comp.rating}` : null,
      ].filter(Boolean).join("   |   ");
      if (metrics) {
        slide.addText(metrics, {
          x: x + imgGridPadding, y: innerY, w: nameW, h: 0.25,
          fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray, valign: "top",
        });
      }
      innerY += 0.28;

      // Image grid (2 rows x 4 columns, 1:1 ratio)
      if (comp.image_urls?.length) {
        const maxImages = Math.min(comp.image_urls.length, imgRows * imgCols);
        let imgX = x + imgGridPadding;
        let imgY = innerY;
        let imgCol = 0;
        let imgRow = 0;

        for (let i = 0; i < maxImages; i++) {
          const url = comp.image_urls[i];
          const imgData = imageCache.get(url);
          if (!imgData) { imgCol++; if (imgCol >= imgCols) { imgCol = 0; imgRow++; imgY += imgCellSize + imgGap; imgX = x + imgGridPadding; } else { imgX += imgCellSize + imgGap; } continue; }
          slide.addImage({
            data: imgData,
            x: imgX, y: imgY, w: imgCellSize, h: imgCellSize,
            sizing: { type: "contain", w: imgCellSize, h: imgCellSize },
          });
          imgCol++;
          if (imgCol >= imgCols) {
            imgCol = 0;
            imgRow++;
            imgY += imgCellSize + imgGap;
            imgX = x + imgGridPadding;
          } else {
            imgX += imgCellSize + imgGap;
          }
        }
        innerY += imgGridH + 0.08;
      }

      // Keywords info
      const kwInfo = [
        comp.intersecting_keywords != null ? `${comp.intersecting_keywords} intersecting keywords` : null,
        comp.avg_position != null ? `${comp.avg_position} average SERP position` : null,
      ].filter(Boolean).join("   |   ");
      if (kwInfo) {
        slide.addText(kwInfo, {
          x: x + imgGridPadding, y: innerY, w: nameW, h: 0.25,
          fontSize: 8, fontFace: FONT.body, color: COLOR.darkGray, valign: "top",
        });
        innerY += 0.28;
      }

      // USPs
      if (comp.usps?.length) {
        slide.addText("USPs", {
          x: x + imgGridPadding, y: innerY, w: nameW, h: 0.22,
          fontSize: 9, fontFace: FONT.heading, color: COLOR.primary, bold: true,
        });
        const uspText = comp.usps.map((u) => `●  ${trunc(u, 80)}`).join("\n");
        slide.addText(uspText, {
          x: x + imgGridPadding, y: innerY + 0.22, w: nameW, h: cardH - innerY + y - 0.3,
          fontSize: 8, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
        });
      }

      // Complaints
      if (comp.complaints?.length) {
        // Find the Y position for complaints (after USPs)
        const uspHeight = comp.usps?.length ? 0.22 + Math.min(0.8, cardH - innerY + y - 0.5) : 0;
        const complaintsY = innerY + uspHeight;
        
        slide.addText("Complaints", {
          x: x + imgGridPadding, y: complaintsY, w: nameW, h: 0.22,
          fontSize: 9, fontFace: FONT.heading, color: "C62828", bold: true,
        });
        const compText = comp.complaints.map((c) => `●  ${trunc(c, 80)}`).join("\n");
        slide.addText(compText, {
          x: x + imgGridPadding, y: complaintsY + 0.22, w: nameW, h: cardH - complaintsY + y - 0.3,
          fontSize: 8, fontFace: FONT.body, color: "C62828", italic: true, valign: "top",
        });
      }
    });

    // ── All competitor images on one slide (organized by rows)
    const allImages = competitors.filter((comp) => comp.image_urls?.length).map((comp) => ({
      name: comp.name || comp.asin || "Competitor",
      urls: comp.image_urls,
    }));

    if (allImages.length > 0) {
      const imgSlide = addContentSlide("Competitor Listing Images");
      const imgsPerRow = 8;
      const rowGap = 0.15; // gap between competitor rows
      const colGap = 0; // no gaps between columns as requested

      // Calculate image dimensions to fit 8 images across
      const imgW = (CONTENT_W - colGap * (imgsPerRow - 1)) / imgsPerRow;
      // Maintain proportional ratio - use the image's natural aspect ratio
      const imgH = imgW; // 1:1 square ratio

      let iy = CONTENT_START_Y;

      allImages.forEach((comp, idx) => {
        // Add competitor name label at start of row
        imgSlide.addText(`${comp.name}`, {
          x: MARGIN, y: iy, w: CONTENT_W, h: 0.25,
          fontSize: 9, fontFace: FONT.heading, color: COLOR.primary, bold: true,
        });
        iy += 0.28;

        // Add images in rows of 8
        const maxImages = Math.min(comp.urls.length, imgsPerRow);
        let ix = MARGIN;

        for (let i = 0; i < maxImages; i++) {
          const imgData = imageCache.get(comp.urls[i]);
          if (!imgData) { ix += imgW + colGap; continue; }
          imgSlide.addImage({
            data: imgData,
            x: ix, y: iy, w: imgW, h: imgH,
            sizing: { type: "contain", w: imgW, h: imgH },
          });
          ix += imgW + colGap;
        }

        // Move to next row position
        iy += imgH + rowGap;
      });
    }
  }

  // ── Creative direction
  {
    const slide = addContentSlide("Creative Direction");
    let y = CONTENT_START_Y;

    // ── Positioning statement (full width)
    if (creative.positioning_statement) {
      slide.addText("Positioning", {
        x: MARGIN, y, w: CONTENT_W, h: 0.25,
        fontSize: 12, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(creative.positioning_statement, {
        x: MARGIN, y: y + 0.28, w: CONTENT_W, h: 0.55,
        fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, italic: true,
      });
      y += 0.95;
    }

    // ── Tone of Voice (text box below positioning)
    if (guidelines.tone_of_voice) {
      slide.addText("Tone of Voice", {
        x: MARGIN, y, w: CONTENT_W, h: 0.25,
        fontSize: 12, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(guidelines.tone_of_voice, {
        x: MARGIN, y: y + 0.28, w: CONTENT_W, h: 0.55,
        fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText,
      });
      y += 0.95;
    }

    // ── Two-column: Key Messages (left) | Visual Direction (right)
    const colY = y;
    const leftW = CONTENT_W * 0.48;
    const rightW = CONTENT_W * 0.48;
    const rightX = MARGIN + CONTENT_W * 0.52;

    // Key Messages — one card per message
    if (creative.key_messages?.length) {
      slide.addText("Key Messages", {
        x: MARGIN, y: colY, w: leftW, h: 0.28,
        fontSize: 12, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      const cardH = 0.33;
      const cardGap = 0.1;
      creative.key_messages.forEach((msg, i) => {
        const cy = colY + 0.38 + i * (cardH + cardGap);
        // Light background card
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN, y: cy, w: leftW, h: cardH,
          fill: { color: COLOR.lightGray },
          line: { color: COLOR.midGray, width: 0.5 },
        });
        // Accent left bar
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN, y: cy, w: 0.06, h: cardH,
          fill: { color: COLOR.primary },
          line: { color: COLOR.primary },
        });
        slide.addText(`${i + 1}.  ${msg}`, {
          x: MARGIN + 0.1, y: cy, w: leftW - 0.1, h: cardH,
          fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText,
          valign: "middle",
        });
      });
    }

    // Visual Direction — accent background callout
    if (creative.visual_direction) {
      slide.addText("Visual Direction", {
        x: rightX, y: colY, w: rightW, h: 0.28,
        fontSize: 12, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: rightX, y: colY + 0.35, w: rightW, h: 1.6,
        fill: { color: COLOR.lightGray },
        line: { color: COLOR.midGray, width: 0.5 },
      });
      slide.addText(creative.visual_direction, {
        x: rightX + 0.12, y: colY + 0.35, w: rightW - 0.24, h: 1.6,
        fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText,
        valign: "middle", wrap: true,
      });
    }

    // ── Competitive Differentiation — full-width accent box at bottom
    if (creative.competitive_differentiation) {
      const boxY = SLIDE_H - 1.55;
      const boxH = 0.95;
      // Accent bar on left
      slide.addShape(pptx.ShapeType.rect, {
        x: MARGIN, y: boxY, w: 0.08, h: boxH,
        fill: { color: COLOR.accent || COLOR.secondary || COLOR.primary },
        line: { color: COLOR.accent || COLOR.secondary || COLOR.primary },
      });
      // Light background
      slide.addShape(pptx.ShapeType.rect, {
        x: MARGIN + 0.08, y: boxY, w: CONTENT_W - 0.08, h: boxH,
        fill: { color: COLOR.lightGray },
        line: { color: COLOR.midGray, width: 0.5 },
      });
      slide.addText("Competitive Differentiation", {
        x: MARGIN + 0.22, y: boxY + 0.06, w: CONTENT_W - 0.3, h: 0.25,
        fontSize: 10, fontFace: FONT.heading, color: COLOR.primary, bold: true,
      });
      slide.addText(creative.competitive_differentiation, {
        x: MARGIN + 0.22, y: boxY + 0.33, w: CONTENT_W - 0.3, h: 0.55,
        fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }
  }

  // ── Deliverables ──────────────────────────────────────────────────────────

  // Main image
  if (deliverables.main_image) {
    buildDeliverableSlide("Main Image", deliverables.main_image);
  }

  // Listing images
  if (deliverables.listing_images?.length) {
    addSectionSlide("Listing Images", deliverables.listing_images.length + " images — sequential narrative");

    // Sequence strategy overview
    if (deliverables.sequence_strategy) {
      const slide = addContentSlide("Sequence Strategy");
      slide.addText(deliverables.sequence_strategy, {
        x: MARGIN, y: CONTENT_START_Y, w: CONTENT_W, h: 4.0,
        fontSize: 11, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
      });
    }

    for (const img of deliverables.listing_images) {
      buildDeliverableSlide(
        `Listing Image ${img.image_number}`,
        img,
        img.role_in_sequence ? `Role: ${img.role_in_sequence}` : null,
      );
    }
  }

  // A+ Basic
  if (deliverables.aplus_basic?.modules?.length) {
    addSectionSlide("A+ Basic Content", `${deliverables.aplus_basic.modules.length} modules`);
    for (const mod of deliverables.aplus_basic.modules) {
      buildDeliverableSlide(
        `A+ Basic — ${mod.module_type} (Pos ${mod.position})`,
        mod,
      );
    }
  }

  // A+ Premium
  if (deliverables.aplus_premium?.modules?.length) {
    addSectionSlide("A+ Premium Content", `${deliverables.aplus_premium.modules.length} modules`);
    for (const mod of deliverables.aplus_premium.modules) {
      buildDeliverableSlide(
        `A+ Premium — ${mod.module_type} (Pos ${mod.position})`,
        mod,
      );
    }
  }
}

// ── Deliverable slide builder ───────────────────────────────────────────────
function buildDeliverableSlide(title, deliverable, subtitle) {
  const slide = addContentSlide(title);
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN, y: 1.08, w: CONTENT_W, h: 0.3,
      fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray, italic: true,
    });
  }

  const wireW = 3.2;
  const wireH = 3.2;
  const wireX = MARGIN;
  const wireY = CONTENT_START_Y + 0.1;

  // Wireframe
  renderWireframe(
    slide,
    deliverable.wireframe_description || "",
    deliverable.copy || null,
    wireX, wireY, wireW, wireH,
  );

  // Right side — text content
  const textX = wireX + wireW + 0.4;
  const textW = CONTENT_W - wireW - 0.4;
  let ty = wireY;

  // Visual concept
  if (deliverable.visual_concept) {
    slide.addText("Visual Concept", {
      x: textX, y: ty, w: textW, h: 0.3,
      fontSize: 11, fontFace: FONT.heading, color: COLOR.primary, bold: true,
    });
    slide.addText(deliverable.visual_concept, {
      x: textX, y: ty + 0.3, w: textW, h: 1.0,
      fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
    ty += 1.35;
  }

  // Strategic why
  if (deliverable.strategic_why) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: textX, y: ty, w: textW, h: 0.8,
      rectRadius: 0.08, fill: { color: COLOR.lightGray },
    });
    slide.addText([
      { text: "Strategic Why: ", options: { bold: true, fontSize: 9, color: COLOR.primary } },
      { text: deliverable.strategic_why, options: { fontSize: 9, color: COLOR.bodyText } },
    ], {
      x: textX + 0.1, y: ty + 0.05, w: textW - 0.2, h: 0.7,
      fontFace: FONT.body, valign: "top",
    });
    ty += 0.9;
  }

  // Prompt — below both wireframe and text, full width
  if (deliverable.prompt) {
    const promptY = Math.max(ty + 0.15, wireY + wireH + 0.25);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: MARGIN, y: promptY, w: CONTENT_W, h: 1.8,
      rectRadius: 0.1, fill: { color: "F8F8F8" },
      line: { color: COLOR.midGray, width: 0.5 },
    });
    slide.addText([
      { text: "Text-to-Image Prompt\n", options: { bold: true, fontSize: 9, color: COLOR.primary } },
      { text: deliverable.prompt, options: { fontSize: 8, color: COLOR.bodyText } },
    ], {
      x: MARGIN + 0.15, y: promptY + 0.08, w: CONTENT_W - 0.3, h: 1.6,
      fontFace: FONT.body, valign: "top",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD DECK
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  // Pre-download all images as base64 before building slides
  imageCache = await prefetchAllImages(brief);

  buildCover();
  buildBrandGuidelines();

  (brief.products || []).forEach((product, i) => {
    buildProduct(product, i);
  });

  // ── Write file ────────────────────────────────────────────────────────────
  const outputPath = resolve(OUTPUT);
  try {
    await pptx.writeFile({ fileName: outputPath });
    console.log(JSON.stringify({ success: true, output: outputPath }));
  } catch (err) {
    console.error(JSON.stringify({ error: `PPTX generation failed: ${err.message}` }));
    process.exit(1);
  }
})();
