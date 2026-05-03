#!/usr/bin/env node
/**
 * generate_pptx.mjs
 *
 * Generates a Scalene-branded PowerPoint deck from a creative-brief JSON file.
 * Uses PptxGenJS. Outputs a .pptx to the specified path.
 *
 * Usage:
 *   node generate_pptx.mjs --input brief.json --output brief.pptx
 */

import PptxGenJS from "pptxgenjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Image helpers ──────────────────────────────────────────────────────────

function imageDimensions(buf) {
  // PNG: signature 8 bytes, IHDR chunk at offset 8; width at 16, height at 20
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  // JPEG: scan for SOF markers
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 3 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        const h = buf.readUInt16BE(i + 5);
        const w = buf.readUInt16BE(i + 7);
        if (w > 0 && h > 0) return { width: w, height: h };
      }
      i += 2 + len;
    }
  }
  // WebP: RIFF????WEBP header
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length > 29) {
      const w = (buf.readUInt16LE(26) & 0x3fff) + 1;
      const h = (buf.readUInt16LE(28) & 0x3fff) + 1;
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (chunk === "VP8L" && buf.length > 21) {
      const bits = buf.readUInt32LE(21);
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (chunk === "VP8X" && buf.length > 30) {
      const w = buf.readUIntLE(24, 3) + 1;
      const h = buf.readUIntLE(27, 3) + 1;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }
  return { width: 1, height: 1 };
}

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
    const { width, height } = imageDimensions(buf);
    const ar = width / height;
    return { data: `${mime};base64,${buf.toString("base64")}`, ar };
  } catch (e) {
    console.error(JSON.stringify({ warn: `Image fetch failed: ${url} — ${e.message}` }));
    return null;
  }
}

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
  const allUrls = [...urls];
  for (let i = 0; i < allUrls.length; i += 10) {
    const batch = allUrls.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (u) => ({ url: u, entry: await fetchAsBase64(u) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.entry) cache.set(r.value.url, r.value.entry);
    }
  }
  console.error(JSON.stringify({ info: `Prefetched ${cache.size}/${urls.size} images as base64` }));
  return cache;
}

let imageCache = new Map();

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
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

// ── Scalene Design System ────────────────────────────────────────────────────
const C = {
  orange:     "FE6702",
  orangeDeep: "E2410E",
  ink:        "141414",
  white:      "FFFFFF",
  neutral:    "F4F4F4",
  border:     "E0E0E0",
  gray:       "888888",
};

const F = {
  heading: "Space Grotesk",
  body:    "Inter",
};

const T = {
  display:   36,
  section:   24,
  subhead:   18,
  body:      14,
  caption:   12,
  data:      10,
  wireframe: 5.5,
};

// Canvas dimensions (LAYOUT_16x9 = 10 × 5.625 in)
const SW = 10;
const SH = 5.625;
const M  = 0.4;   // margin
const CW = SW - M * 2;

// ── Brand extraction (content-only, used on Brand Guidelines slide) ────────
const brand      = brief.brand || {};
const guidelines = brand.guidelines || {};
const brandColors = guidelines.colors || {};
const brandTypo   = guidelines.typography || {};

const hex = (c) => (c || "").replace(/^#/, "") || "333333";

// ── Scalene logo ─────────────────────────────────────────────────────────────
let LOGO_DATA = null;
try {
  const logoPath = resolve(__dirname, "assets", "Scalene_logo.png");
  const buf = readFileSync(logoPath);
  LOGO_DATA = `image/png;base64,${buf.toString("base64")}`;
} catch (_) {
  console.error(JSON.stringify({ warn: "Scalene logo not found at bin/assets/Scalene_logo.png — cover will omit it." }));
}

// ── Presentation instance ────────────────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.layout  = "LAYOUT_16x9";
pptx.author  = "Scalene Design";
pptx.subject = `Creative Brief — ${brand.name || "Brand"}`;

// ── Shared helpers ───────────────────────────────────────────────────────────

function label(slide, text, x, y, w, color) {
  slide.addText((text || "").toUpperCase(), {
    x, y, w, h: 0.22,
    fontSize: 8, fontFace: F.body, color: color || C.gray,
    bold: true, charSpacing: 2,
  });
}

function divider(slide, x, y, w, color, weight) {
  slide.addShape(pptx.shapes.LINE, {
    x, y, w, h: 0,
    line: { color: color || C.border, width: weight || 0.75 },
  });
}

function vDivider(slide, x, y, h, color) {
  slide.addShape(pptx.shapes.LINE, {
    x, y, w: 0, h,
    line: { color: color || C.border, width: 0.75 },
  });
}

// ── Slide factories ──────────────────────────────────────────────────────────

function orangeSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: C.orange };
  return slide;
}

function darkSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: C.ink };
  return slide;
}

function contentSlide(title, opts = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  if (title) {
    slide.addText(title, {
      x: M, y: 0.18, w: CW, h: 0.52,
      fontSize: T.section, fontFace: F.heading, color: C.ink,
      bold: true, align: opts.titleAlign || "left",
    });
    divider(slide, M, 0.72, CW, C.border, 0.75);
  }
  return slide;
}

function blankContentSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  return slide;
}

const CONTENT_Y = 0.88;

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 1 — Cover
// ═══════════════════════════════════════════════════════════════════════════
function buildCover() {
  const slide = orangeSlide();

  if (LOGO_DATA) {
    slide.addImage({
      data: LOGO_DATA,
      x: SW / 2 - 0.28, y: 0.4, w: 0.56, h: 0.56,
      sizing: { type: "contain", w: 0.56, h: 0.56 },
    });
  }

  const brandName = brand.name || "Brand";
  slide.addText(
    [
      { text: brandName,        options: { fontFace: F.heading, bold: true } },
      { text: " x ",            options: { fontFace: F.body,    bold: false } },
      { text: "Scalene Design", options: { fontFace: F.heading, bold: true } },
    ],
    {
      x: M, y: 1.3, w: CW, h: 1.5,
      fontSize: 44, color: C.white, align: "center",
    }
  );

  slide.addText("Research and Creative Brief", {
    x: M, y: 2.85, w: CW, h: 0.42,
    fontSize: 16, fontFace: F.body, color: C.white,
    align: "center", charSpacing: 2, transparency: 15,
  });

  const productNames = (brief.products || []).map((p) => p.name).join("  ·  ");
  if (productNames) {
    slide.addText(productNames, {
      x: M, y: 3.38, w: CW, h: 0.38,
      fontSize: 13, fontFace: F.body, color: C.white,
      align: "center", transparency: 30,
    });
  }

  const dateStr = brief.metadata?.generated_date || new Date().toISOString().split("T")[0];
  slide.addText(dateStr, {
    x: M, y: SH - 0.5, w: CW, h: 0.3,
    fontSize: 10, fontFace: F.body, color: C.white,
    align: "center", transparency: 40,
  });

}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Brand Guidelines (rendered in the BRAND's own identity)
// ═══════════════════════════════════════════════════════════════════════════
function buildBrandGuidelines() {
  const brandPrimary = hex(brandColors.primary);
  const bHeadFont    = brandTypo.heading_font || F.heading;
  const bBodyFont    = brandTypo.body_font    || F.body;
  const descriptors  = guidelines.brand_descriptors || [];

  const slide = pptx.addSlide();
  slide.background = { color: C.white };

  // ── Layout constants ──────────────────────────────────────────────────────
  const LEFT_W  = CW * 0.56;
  const RIGHT_X = M + LEFT_W + 0.32;
  const RIGHT_W = CW - LEFT_W - 0.32;
  const PAD_Y   = 0.28;

  // ── Left — Brand masthead + descriptor centerpiece + type specimen ────────

  // Brand name masthead (small, primary color, top)
  slide.addText((brand.name || "Brand").toUpperCase(), {
    x: M, y: PAD_Y, w: LEFT_W, h: 0.26,
    fontSize: T.caption, fontFace: bBodyFont, color: brandPrimary,
    bold: true, charSpacing: 3, valign: "top",
  });

  // Brand descriptors — the centrepiece, stacked large
  const descY    = PAD_Y + 0.36;
  const descLineH = 0.72;
  descriptors.slice(0, 3).forEach((d, i) => {
    slide.addText(d, {
      x: M, y: descY + i * descLineH, w: LEFT_W, h: descLineH,
      fontSize: T.display, fontFace: bHeadFont, color: C.ink,
      bold: true, valign: "middle", shrinkText: true,
    });
  });

  // Thin rule separating descriptors from specimen
  const specimenY = descY + descriptors.slice(0, 3).length * descLineH + 0.18;
  divider(slide, M, specimenY, LEFT_W, C.border, 0.5);

  // Typographic specimen
  const specTextY = specimenY + 0.18;
  slide.addText(`This is ${brand.name || "the brand"}`, {
    x: M, y: specTextY, w: LEFT_W, h: 0.36,
    fontSize: T.subhead, fontFace: bHeadFont, color: brandPrimary,
    bold: true, valign: "top", shrinkText: true,
  });
  slide.addText("Lorem ipsum dolor sit amet, consectetur adipiscing elit.", {
    x: M, y: specTextY + 0.4, w: LEFT_W, h: 0.28,
    fontSize: T.caption, fontFace: bBodyFont, color: C.gray,
    valign: "top", shrinkText: true,
  });

  // Font names below specimen
  const fontY = specTextY + 0.76;
  slide.addText(bHeadFont, {
    x: M, y: fontY, w: LEFT_W * 0.5, h: 0.24,
    fontSize: T.data, fontFace: bHeadFont, color: C.ink, bold: true, valign: "top",
  });
  slide.addText(bBodyFont, {
    x: M + LEFT_W * 0.5, y: fontY, w: LEFT_W * 0.5, h: 0.24,
    fontSize: T.data, fontFace: bBodyFont, color: C.gray, valign: "top",
  });

  // ── Vertical rule ─────────────────────────────────────────────────────────
  vDivider(slide, RIGHT_X - 0.16, PAD_Y, SH - PAD_Y * 2, C.border);

  // ── Right — Color swatches, tone, audience ────────────────────────────────
  let ry = PAD_Y;

  // Color swatches — horizontal bars, full right column width
  const swatchList = [
    { hex: hex(brandColors.primary),   name: "Primary" },
    { hex: hex(brandColors.secondary), name: "Secondary" },
    { hex: hex(brandColors.accent),    name: "Accent" },
  ];
  (brandColors.additional || []).forEach((c, i) =>
    swatchList.push({ hex: hex(c), name: `Add. ${i + 1}` })
  );
  const validSwatches = swatchList.filter((s) => s.hex && s.hex !== "333333");

  label(slide, "Color Palette", RIGHT_X, ry, RIGHT_W, C.gray);
  ry += 0.24;

  const BAR_H   = 0.32;
  const BAR_GAP = 0.06;
  for (const sw of validSwatches) {
    const barW = RIGHT_W * 0.38;
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: RIGHT_X, y: ry, w: barW, h: BAR_H,
      fill: { color: sw.hex }, line: { color: C.border, width: 0.5 },
    });
    slide.addText(`${sw.name}  #${sw.hex.toUpperCase()}`, {
      x: RIGHT_X + barW + 0.1, y: ry, w: RIGHT_W - barW - 0.1, h: BAR_H,
      fontSize: T.data, fontFace: bBodyFont, color: C.ink,
      valign: "middle", shrinkText: true,
    });
    ry += BAR_H + BAR_GAP;
  }

  ry += 0.16;
  divider(slide, RIGHT_X, ry, RIGHT_W, C.border, 0.5);
  ry += 0.18;

  // Remaining space split equally between tone and audience
  const hasTone     = !!guidelines.tone_of_voice;
  const hasAudience = !!guidelines.target_demographic;
  const LABEL_H     = 0.24;
  const GAP_H       = 0.18; // gap between sections
  const bottomPad   = 0.2;
  const remaining   = SH - ry - bottomPad;

  const sections    = [hasTone, hasAudience].filter(Boolean).length;
  const textH       = sections > 0
    ? (remaining - LABEL_H * sections - GAP_H * (sections - 1)) / sections
    : 0;

  if (hasTone) {
    label(slide, "Tone of Voice", RIGHT_X, ry, RIGHT_W, C.gray);
    ry += LABEL_H;
    slide.addText(guidelines.tone_of_voice, {
      x: RIGHT_X, y: ry, w: RIGHT_W, h: textH,
      fontSize: T.data, fontFace: bBodyFont, color: C.ink,
      valign: "top", shrinkText: true,
    });
    ry += textH + 0.18;
  }

  if (hasAudience) {
    label(slide, "Audience", RIGHT_X, ry, RIGHT_W, C.gray);
    ry += LABEL_H;
    slide.addText(guidelines.target_demographic, {
      x: RIGHT_X, y: ry, w: RIGHT_W, h: textH,
      fontSize: T.data, fontFace: bBodyFont, color: C.ink,
      valign: "top", shrinkText: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Deliverables summary string (shared by intro slide + what-we're-making)
// ═══════════════════════════════════════════════════════════════════════════
function deliverablesSummary(product) {
  const deliverables = product?.deliverables || {};
  const parts = [];
  if (deliverables.main_image?.length) parts.push("1 Main Image");
  if (deliverables.listing_images?.images?.length) parts.push(`${deliverables.listing_images.images.length} Listing Images`);
  if (deliverables.aplus?.modules?.length) parts.push(`${Math.min(deliverables.aplus.modules.length, 6)} A+ Modules`);
  return parts.join(", ");
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Brief Intro (inserted after cover)
// ═══════════════════════════════════════════════════════════════════════════
function buildBriefIntro(product) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };

  const brandName   = brand.name || "the brand";
  const deliverables = deliverablesSummary(product);

  const runs = [
    { text: `This creative brief outlines the strategic direction for the ${brandName} Amazon listing. It covers the research and competitive analysis that informed our creative decisions, the visual direction we're taking, and the specific images we'll produce for the ${deliverables} and asset library.`, options: { breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "What you'll see in this brief:", options: { breakLine: true } },
    { text: "Product research, market data, and competitive landscape", options: { bullet: true, breakLine: true } },
    { text: `How we're positioning ${brandName} against competitors`, options: { bullet: true, breakLine: true } },
    { text: "The visual direction and brand application", options: { bullet: true, breakLine: true } },
    { text: `${deliverables} with rationale`, options: { bullet: true, breakLine: true } },
    { text: "Asset shot list for production", options: { bullet: true, breakLine: false } },
  ];

  slide.addText(runs, {
    x: M, y: M + 0.3, w: CW, h: SH - M * 2 - 0.3,
    fontSize: 12, fontFace: F.body, color: C.ink,
    align: "left", valign: "top",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-product section dispatcher
// ═══════════════════════════════════════════════════════════════════════════
function buildProduct(product) {
  buildProductOverview(product);
  buildKeyUsps(product);
  buildKeywordsVisualPatterns(product);
  buildMarketOpportunities(product);
  buildVisualImplication(product);
  buildCompetitorLandscape(product);
  buildCreativePositioning(product);
  buildKeyMessages(product);
  buildVisualDirection(product);
  buildBrandGuidelines();
  buildWhatWereMaking(product);

  const deliverables = product.deliverables || {};
  if (Array.isArray(deliverables.main_image) && deliverables.main_image.length) {
    buildMainImageOverview(deliverables.main_image);
  }
  if (deliverables.listing_images?.images?.length) {
    buildListingImages(deliverables.listing_images);
  }
  if (deliverables.aplus?.modules?.length) {
    buildAplusContent(deliverables.aplus.modules);
  }

  buildShotListDivider(product);
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Product Overview
// ═══════════════════════════════════════════════════════════════════════════
function buildProductOverview(product) {
  const prodData = product.research?.product || {};
  const slide    = pptx.addSlide();
  slide.background = { color: C.orange };

  const leftW  = CW * 0.42;
  const rightX = M + leftW + 0.35;
  const rightW = CW - leftW - 0.35;

  // ── Calculate right-column block height for vertical centering ──
  const NAME_H   = 0.84;  // 18pt name — tall enough for up to 3 lines
  const ASIN_H   = product.asin ? 0.28 : 0;
  const hasMeta  = !!(prodData.price || prodData.rating);
  const META_H   = hasMeta ? 0.36 : 0;
  const DIV_H    = 0.22;  // divider + gap
  const DESC_H   = prodData.description ? 1.4 : 0;
  const blockH   = NAME_H + ASIN_H + META_H + DIV_H + DESC_H;
  const startY   = (SH - blockH) / 2;

  // ── Left: 2×3 image grid, also vertically centered ──
  const imgCols    = 3;
  const cellW      = leftW / imgCols;
  const cellH      = cellW;  // row height stays square; image width follows aspect ratio
  const imgGridH   = cellH * 2;
  const imgStartY  = (SH - imgGridH) / 2;
  if (prodData.image_urls?.length) {
    const imgCount = Math.min(prodData.image_urls.length, 6);
    let imgX = M, imgY = imgStartY, col = 0;
    for (const url of prodData.image_urls.slice(0, imgCount)) {
      const entry = imageCache.get(url);
      if (entry) {
        const ar  = entry.ar ?? 1;
        const iH  = cellH - 0.04;
        const iW  = iH * ar;
        const iX  = imgX + (cellW - iW) / 2;
        slide.addImage({ data: entry.data, x: iX, y: imgY + 0.02, w: iW, h: iH });
      }
      col++;
      if (col >= imgCols) { col = 0; imgY += cellH; imgX = M; }
      else { imgX += cellW; }
    }
  }

  vDivider(slide, rightX - 0.175, startY, blockH, C.white);

  let ry = startY;

  slide.addText(product.name || "", {
    x: rightX, y: ry, w: rightW, h: NAME_H,
    fontSize: T.subhead, fontFace: F.heading, color: C.white,
    bold: true, valign: "top",
  });
  ry += NAME_H;

  if (product.asin) {
    slide.addText(`ASIN: ${product.asin}`, {
      x: rightX, y: ry, w: rightW, h: 0.24,
      fontSize: T.data, fontFace: F.body, color: C.white, valign: "top", shrinkText: true,
    });
    ry += ASIN_H;
  }

  if (hasMeta) {
    const meta = [
      prodData.price  || null,
      prodData.rating ? `★ ${prodData.rating}${prodData.reviews_count ? ` (${prodData.reviews_count.toLocaleString()} reviews)` : ""}` : null,
    ].filter(Boolean).join("   |   ");
    slide.addText(meta, {
      x: rightX, y: ry, w: rightW, h: 0.3,
      fontSize: T.body, fontFace: F.body, color: C.white, bold: true, valign: "top", shrinkText: true,
    });
    ry += META_H;
  }

  divider(slide, rightX, ry, rightW, C.white, 0.5);
  ry += DIV_H;

  if (prodData.description) {
    slide.addText(prodData.description, {
      x: rightX, y: ry, w: rightW, h: DESC_H,
      fontSize: T.caption, fontFace: F.body, color: C.white,
      valign: "top", shrinkText: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Key USPs & Top Complaints
// ═══════════════════════════════════════════════════════════════════════════
function buildKeyUsps(product) {
  const prodData   = product.research?.product || {};
  const usps       = prodData.usps       || [];
  const complaints = prodData.complaints || [];
  if (!usps.length && !complaints.length) return;

  const slide    = contentSlide("Key USPs and Top Complaints");
  const PILL_GAP = 0.15;
  const PILL_H   = (SH - CONTENT_Y - PILL_GAP - 0.12) / 2;
  const ROW1_Y   = CONTENT_Y;
  const ROW2_Y   = ROW1_Y + PILL_H + PILL_GAP;

  const tileW = (CW - PILL_GAP * 2) / 3;
  const xOf   = (col) => M + col * (tileW + PILL_GAP);

  const NUM_H  = 0.55;
  const drawUspPill = (text, x, y, num) => {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: tileW, h: PILL_H,
      fill: { color: C.orange }, line: { color: C.orange, width: 0 },
      rectRadius: 0.12,
    });
    slide.addText(String(num), {
      x: x + 0.12, y: y + 0.1, w: tileW - 0.24, h: NUM_H,
      fontSize: T.display, fontFace: F.heading, color: C.white,
      bold: true, align: "center", valign: "top",
    });
    slide.addText(text, {
      x: x + 0.12, y: y + NUM_H + 0.1, w: tileW - 0.24, h: PILL_H - NUM_H - 0.2,
      fontSize: T.body, fontFace: F.body, color: C.white,
      align: "center", valign: "top", bold: false, shrinkText: true,
    });
  };

  // Row 1: USPs 1–3
  usps.slice(0, 3).forEach((usp, i) => drawUspPill(usp, xOf(i), ROW1_Y, i + 1));

  // Row 2: USPs 4–5 + Top Complaints (text only, same dimensions)
  const row2Usps = usps.slice(3, 5);
  row2Usps.forEach((usp, i) => drawUspPill(usp, xOf(i), ROW2_Y, i + 4));

  if (complaints.length) {
    const cx = xOf(2);
    label(slide, "Top Complaints", cx, ROW2_Y, tileW, C.orangeDeep);
    slide.addText(complaints.slice(0, 4).map((c) => `·  ${c}`).join("\n"), {
      x: cx, y: ROW2_Y + 0.28, w: tileW, h: PILL_H - 0.28,
      fontSize: T.caption, fontFace: F.body, color: C.ink, valign: "top", shrinkText: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Top Keywords + Visual Patterns
// ═══════════════════════════════════════════════════════════════════════════
function buildKeywordsVisualPatterns(product) {
  const research = product.research || {};
  const keywords = (research.keywords || []).slice(0, 4);
  const patterns = research.gap_analysis?.visual_patterns || [];
  if (!keywords.length && !patterns.length) return;

  const slide   = contentSlide("Top Keywords by Average Monthly Searches");

  // 2×2 grid: top-left = #1 (largest)
  const GRID_GAP = 0.15;
  const cellW    = (CW - GRID_GAP) / 2;
  const cellH    = 1.05;

  keywords.slice(0, 4).forEach((kw, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const kx  = M + col * (cellW + GRID_GAP);
    const ky  = CONTENT_Y + row * (cellH + GRID_GAP);
    const isHero = i === 0;

    slide.addText(kw.keyword || "", {
      x: kx + 0.12, y: ky + 0.08, w: cellW - 0.24, h: cellH * 0.55,
      fontSize: isHero ? T.section : T.body,
      fontFace: F.heading, color: C.orange,
      bold: true, align: "center", valign: "middle", shrinkText: true,
    });
    const vol = kw.average_monthly_search_volume
      ? `${Number(kw.average_monthly_search_volume).toLocaleString()} avg. monthly searches`
      : "";
    if (vol) {
      slide.addText(vol, {
        x: kx + 0.12, y: ky + cellH * 0.65, w: cellW - 0.24, h: cellH * 0.3,
        fontSize: T.caption, fontFace: F.body, color: C.ink,
        align: "center", valign: "top", shrinkText: true,
      });
    }
  });

  if (patterns.length) {
    const gridBottom = CONTENT_Y + cellH * 2 + GRID_GAP;
    const cardY = gridBottom + 0.18;
    const cardH = SH - cardY - 0.15;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: M, y: cardY, w: CW, h: cardH,
      fill: { color: C.neutral }, line: { color: C.border, width: 0.75 },
      rectRadius: 0.1,
    });
    label(slide, "Visual Patterns in the Category", M + 0.15, cardY + 0.1, CW - 0.3, C.gray);
    slide.addText(patterns.slice(0, 5).map((p, i) => `${i + 1}.  ${p}`).join("\n"), {
      x: M + 0.15, y: cardY + 0.36, w: CW - 0.3, h: cardH - 0.46,
      fontSize: T.caption, fontFace: F.body, color: C.ink, valign: "top", shrinkText: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Market Opportunities
// ═══════════════════════════════════════════════════════════════════════════
function buildMarketOpportunities(product) {
  const gap  = product.research?.gap_analysis || {};
  const diff = gap.differentiation_opportunities || [];
  const comp = gap.complaints_to_address        || [];
  if (!diff.length && !comp.length) return;

  const slide   = contentSlide("Market Opportunities");
  const cardGap = 0.2;
  const cardW   = (CW - cardGap) / 2;
  const cardY   = CONTENT_Y;
  const cardH   = SH - cardY - 0.12;

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: M, y: cardY, w: cardW, h: cardH,
    fill: { color: C.neutral }, line: { color: C.border, width: 0.75 },
    rectRadius: 0.12,
  });
  label(slide, "Differentiation Opportunities", M + 0.15, cardY + 0.12, cardW - 0.3, C.gray);
  slide.addText(
    diff.slice(0, 5).map((d, i) => ({
      text: `${i + 1}.  ${d}`,
      options: { breakLine: true, paraSpaceAfter: 8 },
    })),
    {
      x: M + 0.15, y: cardY + 0.38, w: cardW - 0.3, h: cardH - 0.5,
      fontSize: T.caption, fontFace: F.body, color: C.ink, valign: "top", shrinkText: true,
    }
  );

  const c2X = M + cardW + cardGap;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: c2X, y: cardY, w: cardW, h: cardH,
    fill: { color: C.orange }, line: { color: C.orange, width: 0 },
    rectRadius: 0.12,
  });
  label(slide, "Complaints to Address", c2X + 0.15, cardY + 0.12, cardW - 0.3, C.white);
  slide.addText(
    comp.slice(0, 5).map((c, i) => ({
      text: `${i + 1}.  ${c}`,
      options: { breakLine: true, paraSpaceAfter: 8 },
    })),
    {
      x: c2X + 0.15, y: cardY + 0.38, w: cardW - 0.3, h: cardH - 0.5,
      fontSize: T.caption, fontFace: F.body, color: C.white, valign: "top", shrinkText: true,
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Visual Implication
// ═══════════════════════════════════════════════════════════════════════════
function buildVisualImplication(product) {
  const vi = product.research?.visual_implication;
  if (!vi) return;

  const slide = darkSlide();
  slide.addText("THE OPPORTUNITY", {
    x: M, y: 0.3, w: CW, h: 0.7,
    fontSize: 36, fontFace: F.heading, color: C.orange,
    bold: true, charSpacing: 3, align: "left",
  });
  slide.addText(vi, {
    x: M, y: 1.15, w: CW, h: SH - 1.35,
    fontSize: T.section, fontFace: F.heading, color: C.white,
    bold: false, align: "left", valign: "middle", shrinkText: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Competitor Landscape
// ═══════════════════════════════════════════════════════════════════════════
function buildCompetitorLandscape(product) {
  const competitors = product.research?.competitors || [];
  if (!competitors.length) return;

  const slide   = contentSlide("Competitor Landscape", { titleAlign: "center" });
  const cols    = 3;
  const colGap  = 0.18;
  const colW    = (CW - colGap * (cols - 1)) / cols;
  const PAD     = 0.14;

  const imgSize  = 1.4;
  const imgY     = CONTENT_Y;
  const cardTop  = imgY + imgSize + 0.12;
  const cardH2   = SH - cardTop - 0.15;

  competitors.slice(0, cols).forEach((comp, i) => {
    const cx = M + i * (colW + colGap);

    // Image above the card, centered horizontally in the column
    const firstImg = comp.image_urls?.[0];
    if (firstImg && imageCache.get(firstImg)) {
      const entry = imageCache.get(firstImg);
      const ar    = entry.ar ?? 1;
      const iH    = imgSize;
      const iW    = iH * ar;
      slide.addImage({
        data: entry.data,
        x: cx + (colW - iW) / 2, y: imgY,
        w: iW, h: iH,
      });
    }

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: cardTop, w: colW, h: cardH2,
      fill: { color: C.neutral }, line: { color: C.border, width: 0.75 },
      rectRadius: 0.12,
    });

    let iy = cardTop + PAD;

    // Name — 12pt, up to 3 lines; ASIN starts below actual text height
    const COMP_NAME_H = 0.6;
    slide.addText(comp.name || "Competitor", {
      x: cx + PAD, y: iy, w: colW - PAD * 2, h: COMP_NAME_H,
      fontSize: T.caption, fontFace: F.heading, color: C.orange,
      bold: true, align: "center", valign: "top",
    });
    iy += COMP_NAME_H;

    // ASIN (linked)
    if (comp.asin) {
      slide.addText([{
        text: comp.asin,
        options: {
          fontSize: T.data, color: C.orange,
          hyperlink: { url: `https://www.amazon.com/dp/${comp.asin}` },
        },
      }], {
        x: cx + PAD, y: iy, w: colW - PAD * 2, h: 0.22,
        fontFace: F.body, align: "center",
      });
      iy += 0.24;
    }

    // Price | Rating
    const metrics = [comp.price, comp.rating ? `★ ${comp.rating}${comp.reviews_count ? ` (${comp.reviews_count.toLocaleString()} reviews)` : ""}` : null].filter(Boolean).join("   |   ");
    if (metrics) {
      slide.addText(metrics, {
        x: cx + PAD, y: iy, w: colW - PAD * 2, h: 0.22,
        fontSize: T.data, fontFace: F.body, color: C.gray,
        align: "center", valign: "top", shrinkText: true,
      });
      iy += 0.26;
    }

    divider(slide, cx + PAD, iy, colW - PAD * 2, C.border, 0.5);
    iy += 0.12;

    if (comp.usps_and_complaints) {
      slide.addText(comp.usps_and_complaints, {
        x: cx + PAD, y: iy, w: colW - PAD * 2, h: cardTop + cardH2 - iy - PAD,
        fontSize: T.data, fontFace: F.body, color: C.ink,
        valign: "top", shrinkText: true,
      });
    }
  });

  buildCompetitorListingImages(competitors);
}

function buildCompetitorListingImages(competitors) {
  const withImages = competitors.filter((c) => c.image_urls?.length);
  if (!withImages.length) return;

  const HEADER_Y     = 0.2;
  const TITLE_H      = 0.6;
  const TOP_OFF      = HEADER_Y + TITLE_H + 0.16;
  const BOTTOM       = SH - 0.12;
  const availH       = BOTTOM - TOP_OFF;

  const GRID_COLS    = 3;  // columns per competitor
  const GRID_ROWS    = 3;  // rows per competitor
  const IMG_GAP      = 0.05; // gap between images within a grid
  const COMP_GAP     = 0.28; // gap between competitor groups

  const numComps     = withImages.length;
  // Total width split between competitor grids
  const gridW        = (CW - COMP_GAP * (numComps - 1)) / numComps;
  const cellSize     = Math.min(
    (gridW - IMG_GAP * (GRID_COLS - 1)) / GRID_COLS,
    (availH - IMG_GAP * (GRID_ROWS - 1)) / GRID_ROWS
  );
  const gridActualW  = cellSize * GRID_COLS + IMG_GAP * (GRID_COLS - 1);
  const gridActualH  = cellSize * GRID_ROWS + IMG_GAP * (GRID_ROWS - 1);
  const gridStartY   = TOP_OFF + (availH - gridActualH) / 2;

  const slide = pptx.addSlide();
  slide.background = { color: "000000" };
  slide.addText("Competitor Listing Images", {
    x: M, y: HEADER_Y, w: CW, h: TITLE_H,
    fontSize: 36, fontFace: F.heading, color: C.white, bold: true,
  });

  withImages.forEach((comp, i) => {
    const gridX = M + i * (gridW + COMP_GAP) + (gridW - gridActualW) / 2;

    comp.image_urls.slice(0, GRID_COLS * GRID_ROWS).forEach((url, j) => {
      const entry = imageCache.get(url);
      if (!entry) return;
      const col  = j % GRID_COLS;
      const row  = Math.floor(j / GRID_COLS);
      const ar   = entry.ar ?? 1;
      const iH   = cellSize;
      const iW   = iH * ar;
      const cellX = gridX + col * (cellSize + IMG_GAP);
      slide.addImage({
        data: entry.data,
        x: cellX + (cellSize - iW) / 2,
        y: gridStartY + row * (cellSize + IMG_GAP),
        w: iW, h: iH,
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Creative Positioning
// ═══════════════════════════════════════════════════════════════════════════
function buildCreativePositioning(product) {
  const cd = product.creative_direction || {};
  if (!cd.positioning_statement && !cd.competitive_differentiation) return;

  const slide = darkSlide();
  slide.addText("Creative Positioning", {
    x: M, y: 0.22, w: CW, h: 0.55,
    fontSize: 34, fontFace: F.heading, color: C.orange,
    bold: true, align: "right",
  });

  const colW  = (CW - 0.3) / 2;
  const col2X = M + colW + 0.3;
  const cy    = 1.0;
  const colH  = SH - cy - 0.15;

  if (cd.positioning_statement) {
    label(slide, "Positioning Statement", M, cy, colW, C.gray);
    slide.addText(cd.positioning_statement, {
      x: M, y: cy + 0.26, w: colW, h: colH - 0.26,
      fontSize: T.caption, fontFace: F.body, color: C.white, valign: "top", shrinkText: true,
    });
  }

  if (cd.competitive_differentiation) {
    label(slide, "Competitive Differentiation", col2X, cy, colW, C.gray);
    slide.addText(cd.competitive_differentiation, {
      x: col2X, y: cy + 0.26, w: colW, h: colH - 0.26,
      fontSize: T.caption, fontFace: F.body, color: C.white, valign: "top", shrinkText: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Key Messages
// ═══════════════════════════════════════════════════════════════════════════
function buildKeyMessages(product) {
  const msgs = (product.creative_direction?.key_messages || []).slice(0, 5);
  if (!msgs.length) return;

  const slide = contentSlide("Key Messages");

  const cardY   = CONTENT_Y + 0.1;
  const cardH   = SH - cardY - 0.2;
  const cardGap = 0.12;
  const cardW   = (CW - cardGap * (msgs.length - 1)) / msgs.length;

  msgs.forEach((msg, i) => {
    const cx = M + i * (cardW + cardGap);

    if (i > 0) vDivider(slide, cx - cardGap / 2, cardY, cardH, C.border);

    slide.addText(String(i + 1).padStart(2, "0"), {
      x: cx, y: cardY, w: cardW, h: 0.65,
      fontSize: 48, fontFace: F.heading, color: C.orange,
      bold: true, align: "center",
    });

    divider(slide, cx, cardY + 0.73, cardW, C.border, 0.75);

    slide.addText(msg, {
      x: cx + 0.08, y: cardY + 0.83, w: cardW - 0.16, h: cardH - 0.83,
      fontSize: T.body, fontFace: F.body, color: C.ink,
      align: "left", valign: "top", shrinkText: true,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Visual Direction
// ═══════════════════════════════════════════════════════════════════════════
function buildVisualDirection(product) {
  const vd = product.creative_direction?.visual_direction;
  if (!vd) return;

  const slide = darkSlide();
  slide.addText("Visual Direction", {
    x: M, y: 0.2, w: CW, h: 0.46,
    fontSize: 26, fontFace: F.heading, color: C.white, bold: true, align: "right",
  });

  const rows = [
    ["Color World",           vd.color_world],
    ["Lighting Signature",    vd.lighting_signature],
    ["Model Direction",       vd.model_direction],
    ["Prop Styling",          vd.prop_styling],
    ["Environment / Surface", vd.environment_surface_direction],
    ["Mood",                  vd.mood],
  ].filter(([, v]) => !!v);

  const cols  = 3;
  const tileW = (CW - 0.2 * (cols - 1)) / cols;
  const tileH = (SH - 0.88 - 0.1) / Math.ceil(rows.length / cols);
  const colXs = [M, M + tileW + 0.2, M + (tileW + 0.2) * 2];

  rows.forEach(([lbl, val], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tx  = colXs[col];
    const ty  = 0.88 + row * (tileH + 0.06);

    divider(slide, tx, ty, tileW, C.orangeDeep, 0.75);
    slide.addText((lbl || "").toUpperCase(), {
      x: tx, y: ty + 0.06, w: tileW, h: 0.22,
      fontSize: 6, fontFace: F.body, color: C.orange,
      bold: true, charSpacing: 2,
    });
    slide.addText(val, {
      x: tx, y: ty + 0.3, w: tileW, h: tileH - 0.35,
      fontSize: 6, fontFace: F.body, color: C.white, valign: "top", shrinkText: true,
    });
  });

  slide.addNotes(JSON.stringify(vd, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — What We're Making
// ═══════════════════════════════════════════════════════════════════════════
function buildWhatWereMaking(product) {
  const deliverables = product.deliverables || {};
  const parts = [];
  if (deliverables.main_image?.length) {
    parts.push("1 Main Image");
  }
  if (deliverables.listing_images?.images?.length) {
    parts.push(`${deliverables.listing_images.images.length} Listing Images`);
  }
  if (deliverables.aplus?.modules?.length) {
    parts.push(`${Math.min(deliverables.aplus.modules.length, 6)} A+ Modules`);
  }

  if (!parts.length) return;

  const slide = pptx.addSlide();
  slide.background = { color: C.orange };

  // Block heights: kicker 0.4, headline 1.1, body 0.9 → total ~2.4
  const blockH = 2.6;
  const blockY = (SH - blockH) / 2;

  slide.addText("WHAT WE'RE MAKING", {
    x: M, y: blockY, w: CW, h: 0.4,
    fontSize: T.caption, fontFace: F.body, color: C.white,
    bold: true, charSpacing: 3, align: "center",
  });

  slide.addText(parts.join("  ·  "), {
    x: M, y: blockY + 0.5, w: CW, h: 0.7,
    fontSize: 24, fontFace: F.heading, color: C.white,
    bold: true, align: "center", valign: "middle", shrinkText: true,
  });

  const brandName = brand.name || "the brand";
  slide.addText(
    `Based on the research and strategic positioning above, here's what we're producing for the ${brandName} listing.`,
    {
      x: M + 0.8, y: blockY + 1.7, w: CW - 1.6, h: 0.9,
      fontSize: T.caption, fontFace: F.body, color: C.white,
      align: "center", transparency: 15, shrinkText: true,
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Main Image — All Versions
// ═══════════════════════════════════════════════════════════════════════════
function buildMainImageOverview(versions) {
  const slide = contentSlide("Main Image — Five Concepts");
  const n     = versions.length;
  const gap   = 0.12;
  const sz    = (CW - gap * (n - 1)) / n;
  const boxH  = SH - CONTENT_Y - 0.2;
  const PAD   = 0.14;

  // Fixed height budgets sized for worst-case line counts
  const NUM_H   = 0.42;  // version number — 1 line at 24pt
  const NAME_H  = 0.52;  // strategy name — 2 lines at 14pt (~0.24in/line)
  const FEAT_H  = 1.30;  // feature — 7 lines at 10pt (~0.18in/line)
  const STRAT_H = 0.68;  // strategy body — 4 lines at 8pt (~0.15in/line)

  versions.forEach((v, i) => {
    const bx = M + i * (sz + gap);

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: bx, y: CONTENT_Y, w: sz, h: boxH,
      fill: { color: C.neutral }, line: { color: C.border, width: 1 },
      rectRadius: 0.12,
    });

    let cy = CONTENT_Y + PAD;

    // Version number
    slide.addText(String(v.version_number || i + 1), {
      x: bx, y: cy, w: sz, h: NUM_H,
      fontSize: T.section, fontFace: F.heading, color: C.orange,
      bold: true, align: "center",
    });
    cy += NUM_H;

    // Strategy name — 14pt, 2-line budget
    if (v.strategy_name) {
      slide.addText(v.strategy_name, {
        x: bx + PAD, y: cy, w: sz - PAD * 2, h: NAME_H,
        fontSize: T.body, fontFace: F.heading, color: C.ink,
        bold: true, align: "center", valign: "top", shrinkText: true,
      });
    }
    cy += NAME_H;

    // Feature — 10pt, 7-line budget
    if (v.feature) {
      slide.addText(v.feature.toUpperCase(), {
        x: bx + PAD, y: cy, w: sz - PAD * 2, h: FEAT_H,
        fontSize: T.data, fontFace: F.body, color: C.gray,
        bold: true, charSpacing: 1.5, align: "center", valign: "top", shrinkText: true,
      });
    }
    cy += FEAT_H;

    // Strategy body — 8pt, 4-line budget
    if (v.strategy) {
      slide.addText(v.strategy, {
        x: bx + PAD, y: cy, w: sz - PAD * 2, h: STRAT_H,
        fontSize: 8, fontFace: F.body, color: C.ink,
        align: "left", valign: "top", shrinkText: true,
      });
    }
  });

  // Move visual_concept to speaker notes
  const noteSections = versions.map((v, i) => {
    const head = `Version ${v.version_number || i + 1}${v.strategy_name ? ` — ${v.strategy_name}` : ""}`;
    const lines = [head];
    if (v.feature)        lines.push(`Feature: ${v.feature}`);
    if (v.visual_concept) lines.push(`Concept: ${v.visual_concept}`);
    if (v.strategy)       lines.push(`Strategy: ${v.strategy}`);
    return lines.join("\n");
  });
  if (noteSections.length) slide.addNotes(noteSections.join("\n\n"));
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Listing Images
// ═══════════════════════════════════════════════════════════════════════════
function buildListingImages(listing) {
  const images = listing.images || [];

  // Plain content slide (no title bar — title lives in cell (0,0))
  const slide = blankContentSlide();

  const COLS      = 4;
  const ROWS      = 2;
  const COL_GAP   = 0.12;
  // Card: square, sized to fit 4 columns
  const CARD_W    = (CW - COL_GAP * (COLS - 1)) / COLS;
  const CARD_H    = CARD_W; // 1:1 ratio

  // Strategy text sits below each card; row gap must accommodate it
  const STRAT_H   = 0.36;  // up to 2 lines at 5.5pt
  const STRAT_PAD = 0.06;  // gap between card bottom and strategy text
  const ROW_GAP   = STRAT_H + STRAT_PAD + 0.1; // space between row 1 bottom and row 2 top

  // Total vertical footprint: 2 rows of cards + strategy rows + row gap
  const TOTAL_H   = CARD_H * ROWS + ROW_GAP + STRAT_H;
  const TOP_Y     = Math.max((SH - TOTAL_H) / 2, 0.1);

  // Fixed text block heights inside each card (worst-case line counts)
  const PAD       = 0.1;
  const HEAD_H    = 0.76;  // heading 14pt — up to 3 lines (~0.24in/line)
  const SUB_H     = 0.36;  // subheading 8pt — up to 2 lines (~0.16in/line)
  const NUM_H     = 0.22;
  const BULLET_H  = CARD_H - PAD * 2 - HEAD_H - SUB_H - NUM_H;

  // Cell (0,0) — title
  slide.addText("Listing\nImages", {
    x: M, y: TOP_Y, w: CARD_W, h: CARD_H,
    fontSize: T.display, fontFace: F.heading, color: C.ink,
    bold: true, align: "left", valign: "middle",
  });

  // 7 image cards in remaining grid slots
  const slots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 && c === 0) continue;
      slots.push({ col: c, row: r });
    }
  }

  images.slice(0, 7).forEach((img, i) => {
    const slot = slots[i];
    if (!slot) return;
    const cx   = M + slot.col * (CARD_W + COL_GAP);
    const rowY = TOP_Y + slot.row * (CARD_H + ROW_GAP);

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: rowY, w: CARD_W, h: CARD_H,
      fill: { color: C.orange }, line: { color: C.orange, width: 0 },
      rectRadius: 0.12,
    });

    const copy = img.copy || {};
    const iW   = CARD_W - PAD * 2;
    let cy2    = rowY + PAD;

    // Heading — 14pt, 2-line budget
    if (typeof copy === "object" && copy.heading) {
      slide.addText(copy.heading, {
        x: cx + PAD, y: cy2, w: iW, h: HEAD_H,
        fontSize: T.body, fontFace: F.heading, color: C.white,
        bold: true, align: "center", valign: "top", shrinkText: true,
      });
    }
    cy2 += HEAD_H;

    // Subheading — 8pt, 2-line budget
    if (typeof copy === "object" && copy.subheading) {
      slide.addText(copy.subheading, {
        x: cx + PAD, y: cy2, w: iW, h: SUB_H,
        fontSize: 8, fontFace: F.body, color: C.white,
        align: "center", valign: "top", shrinkText: true,
      });
    }
    cy2 += SUB_H;

    // Bullets — fill remaining space above slot number
    if (Array.isArray(copy.bullet_points) && copy.bullet_points.length) {
      const bpText = copy.bullet_points.slice(0, 3).map((bp) => `·  ${bp}`).join("\n");
      slide.addText(bpText, {
        x: cx + PAD, y: cy2, w: iW, h: Math.max(BULLET_H, 0.1),
        fontSize: T.wireframe, fontFace: F.body, color: C.white,
        align: "left", valign: "top", shrinkText: true,
      });
    }

    // Slot number — pinned to bottom-left of card
    slide.addText(String(img.slot_number || i + 1), {
      x: cx + 0.06, y: rowY + CARD_H - NUM_H - 0.04, w: 0.3, h: NUM_H,
      fontSize: T.data, fontFace: F.heading, color: C.white, bold: true, align: "left",
    });

    // Strategy — below the card, within the row gap
    if (img.strategy) {
      slide.addText(img.strategy, {
        x: cx, y: rowY + CARD_H + STRAT_PAD, w: CARD_W, h: STRAT_H,
        fontSize: T.wireframe, fontFace: F.body, color: C.gray,
        align: "center", valign: "top", shrinkText: true,
      });
    }
  });

  if (listing.sequence_strategy) {
    slide.addNotes(`Sequence strategy:\n${listing.sequence_strategy}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — A+ Content
// ═══════════════════════════════════════════════════════════════════════════
function buildAplusContent(modules) {
  const slide     = contentSlide("A+ Content");
  if (!modules?.length) return;

  const MOD_COUNT = 6;
  const ROWS_H    = SH - CONTENT_Y - 0.1;
  const ROW_H     = ROWS_H / MOD_COUNT;
  const LEFT_W    = CW * 0.4;
  const RIGHT_X   = M + LEFT_W + 0.3;
  const RIGHT_W   = CW - LEFT_W - 0.3;
  const PAD       = 0.08;

  vDivider(slide, RIGHT_X - 0.15, CONTENT_Y, ROWS_H, C.border);

  modules.slice(0, MOD_COUNT).forEach((mod, i) => {
    if (!mod) return;
    const ry = CONTENT_Y + i * ROW_H;
    if (i > 0) divider(slide, M, ry, CW, C.border, 0.5);

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: M, y: ry + 0.04, w: LEFT_W, h: ROW_H - 0.08,
      fill: { color: C.orange }, line: { color: C.orange, width: 0 },
      rectRadius: 0.08,
    });

    const copy     = mod.copy || {};
    const heading  = copy.heading    || null;
    const subhead  = copy.subheading || null;
    const bullets  = Array.isArray(copy.bullet_points) ? copy.bullet_points : [];
    let textY      = ry + 0.1;
    const maxTextY = ry + ROW_H - 0.06;

    if (heading) {
      slide.addText(heading, {
        x: M + PAD, y: textY, w: LEFT_W - PAD * 2, h: 0.22,
        fontSize: 8, fontFace: F.heading,
        color: C.white, bold: true, valign: "top", shrinkText: true,
      });
      textY += 0.23;
    }
    if (subhead && textY < maxTextY) {
      slide.addText(subhead, {
        x: M + PAD, y: textY, w: LEFT_W - PAD * 2, h: Math.max(maxTextY - textY - 0.04, 0.15),
        fontSize: T.wireframe, fontFace: F.body,
        color: C.white, valign: "top", shrinkText: true,
      });
      textY += 0.18;
    }
    if (bullets.length && textY < maxTextY) {
      slide.addText(bullets.slice(0, 2).map((b) => `·  ${b}`).join("\n"), {
        x: M + PAD, y: textY, w: LEFT_W - PAD * 2, h: Math.max(maxTextY - textY, 0.1),
        fontSize: T.wireframe, fontFace: F.body,
        color: C.white, valign: "top", shrinkText: true,
      });
    }

    if (mod.strategy) {
      if (i > 0) divider(slide, RIGHT_X, ry, RIGHT_W, C.border, 0.5);
      const roleText = `Module ${i + 1}${mod.module_role ? ` — ${mod.module_role.replace(/_/g, " ")}` : ""}`;
      label(slide, roleText, RIGHT_X, ry + 0.04, RIGHT_W, C.orange);
      slide.addText(mod.strategy, {
        x: RIGHT_X, y: ry + 0.24, w: RIGHT_W, h: ROW_H - 0.28,
        fontSize: T.data, fontFace: F.body, color: C.ink, valign: "top", shrinkText: true,
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Shot List divider (prompts in speaker notes)
// ═══════════════════════════════════════════════════════════════════════════
function buildShotListDivider(product) {
  const shotList = product.shot_list;
  if (!shotList?.shots_by_type) return;

  const typeKeys = Object.keys(shotList.shots_by_type).filter(
    (k) => Array.isArray(shotList.shots_by_type[k]) && shotList.shots_by_type[k].length
  );
  if (!typeKeys.length) return;

  const slide = darkSlide();
  slide.addText("SHOT LIST", {
    x: M, y: SH / 2 - 0.3, w: CW, h: 0.6,
    fontSize: 40, fontFace: F.heading, color: C.white, bold: true, align: "right",
  });

  const noteLines = [];
  for (const key of typeKeys) {
    for (const s of shotList.shots_by_type[key]) {
      if (s.prompt) noteLines.push(`${s.option_id}: "${s.prompt}"`);
    }
  }
  if (noteLines.length) {
    slide.addNotes(`[\n  ${noteLines.join(",\n  ")}\n]`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE — Next Steps
// ═══════════════════════════════════════════════════════════════════════════
function buildNextSteps() {
  const slide = orangeSlide();

  slide.addText("Next\nSteps", {
    x: M, y: 1.2, w: CW * 0.38, h: 2.6,
    fontSize: 46, fontFace: F.heading, color: C.white,
    bold: true, align: "left", valign: "middle",
  });

  const cardX = M + CW * 0.42;
  const cardW = CW - CW * 0.42;
  const cardY = 0.35;
  const cardH = SH - cardY * 2;

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: cardX, y: cardY, w: cardW, h: cardH,
    fill: { color: C.white }, line: { color: C.white, width: 0 },
    rectRadius: 0.18,
  });

  label(slide, "What Happens Next", cardX + 0.2, cardY + 0.18, cardW - 0.4, C.gray);

  const steps = [
    { n: "1", title: "Brief Approval",      body: "Review this brief and confirm the creative direction" },
    { n: "2", title: "Asset Generation",    body: "AI-generated assets based on the shot list and visual direction" },
    { n: "3", title: "Designer Refinement", body: "Photoshop refinement, text overlays, and layout by the design team" },
    { n: "4", title: "Listing Ready",       body: "Final listing images, A+ modules, and assets delivered for upload" },
  ];

  const stepH = (cardH - 0.55) / steps.length;
  steps.forEach((s, i) => {
    const sy = cardY + 0.48 + i * stepH;
    slide.addText(s.n, {
      x: cardX + 0.18, y: sy, w: 0.32, h: stepH - 0.08,
      fontSize: T.subhead, fontFace: F.heading, color: C.orange, bold: true, valign: "top",
    });
    slide.addText(s.title, {
      x: cardX + 0.55, y: sy, w: cardW - 0.75, h: 0.3,
      fontSize: T.body, fontFace: F.heading, color: C.ink, bold: true, valign: "top", shrinkText: true,
    });
    slide.addText(s.body, {
      x: cardX + 0.55, y: sy + 0.32, w: cardW - 0.75, h: stepH - 0.4,
      fontSize: T.body, fontFace: F.body, color: C.gray, valign: "top", shrinkText: true,
    });
  });

  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: SH - 0.06, w: SW, h: 0.06,
    fill: { color: C.orangeDeep }, line: { color: C.orangeDeep, width: 0 },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD DECK
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  imageCache = await prefetchAllImages(brief);

  buildCover();
  buildBriefIntro((brief.products || [])[0]);
  (brief.products || []).forEach((product, i) => buildProduct(product, i));
  buildNextSteps();

  const outputPath = resolve(OUTPUT);
  try {
    await pptx.writeFile({ fileName: outputPath });
    console.log(JSON.stringify({ success: true, output: outputPath }));
  } catch (err) {
    console.error(JSON.stringify({ error: `PPTX generation failed: ${err.message}` }));
    process.exit(1);
  }
})();
