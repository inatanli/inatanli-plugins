#!/usr/bin/env node
/**
 * generate_pptx.mjs
 *
 * Generates a branded PowerPoint deck from a creative-brief JSON file.
 * Uses PptxGenJS. Outputs a .pptx to the specified path.
 *
 * Usage:
 *   node generate_pptx.mjs --input brief.json --output brief.pptx
 */

import PptxGenJS from "pptxgenjs";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Image helpers ──────────────────────────────────────────────────────────
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
      batch.map(async (u) => ({ url: u, data: await fetchAsBase64(u) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.data) cache.set(r.value.url, r.value.data);
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

// ── Constants ───────────────────────────────────────────────────────────────
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.6;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_START_Y = 1.4;

// ── Brand extraction ────────────────────────────────────────────────────────
const brand = brief.brand || {};
const guidelines = brand.guidelines || {};
const colors = guidelines.colors || {};
const typography = guidelines.typography || {};

const hex = (c) => (c || "").replace(/^#/, "") || "333333";
if (!colors.primary) {
  console.error(JSON.stringify({
    warn: "brand.colors.primary missing — falling back to neutral #333333.",
  }));
}
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

const FONT = {
  heading: typography.heading_font || "Calibri",
  body: typography.body_font || "Calibri",
};

// ── Presentation instance ───────────────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Scalene Design";
pptx.subject = `Creative Brief — ${brand.name || "Brand"}`;

// ── Slide masters ────────────────────────────────────────────────────────────
pptx.defineSlideMaster({
  title: "SECTION_HEADER",
  background: { color: COLOR.primary },
  objects: [
    { rect: { x: 0, y: SLIDE_H - 0.08, w: "100%", h: 0.08, fill: { color: COLOR.accent || COLOR.secondary } } },
  ],
});

pptx.defineSlideMaster({
  title: "CONTENT",
  background: { color: COLOR.white },
  objects: [
    { rect: { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: COLOR.primary } } },
    { rect: { x: 0, y: SLIDE_H - 0.04, w: "100%", h: 0.04, fill: { color: COLOR.accent || COLOR.midGray } } },
  ],
  slideNumber: { x: "95%", y: "96%", color: COLOR.darkGray, fontSize: 8 },
});

// ── Design system helpers ───────────────────────────────────────────────────

function addSectionLabel(slide, text, x, y, w, color) {
  slide.addText((text || "").toUpperCase(), {
    x, y, w, h: 0.25,
    fontSize: 9, fontFace: FONT.body, color: color || COLOR.darkGray,
    bold: true, charSpacing: 2.5,
  });
}

function addDivider(slide, x, y, w, color, weight) {
  slide.addShape(pptx.shapes.LINE, {
    x, y, w, h: 0,
    line: { color: color || COLOR.midGray, width: weight || 0.75 },
  });
}

function addVerticalDivider(slide, x, y, h, color) {
  slide.addShape(pptx.shapes.LINE, {
    x, y, w: 0, h,
    line: { color: color || COLOR.midGray, width: 0.75 },
  });
}

function addTypographicTile(slide, label, value, x, y, w, h) {
  addDivider(slide, x, y, w, COLOR.midGray, 0.5);
  addSectionLabel(slide, label, x, y + 0.08, w);
  if (value) {
    slide.addText(value, {
      x, y: y + 0.33, w, h: h - 0.38,
      fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText,
      valign: "top", shrinkText: true,
    });
  }
}

function addKeywordBarChart(slide, keywords, x, y, w, h) {
  if (!keywords?.length) return;

  // Sort by search volume descending
  const sorted = [...keywords].sort((a, b) => {
    const volA = Number(a.average_monthly_search_volume) || 0;
    const volB = Number(b.average_monthly_search_volume) || 0;
    return volB - volA;
  });

  const top = sorted.slice(0, 8);
  const labels = top.map((k) => k.keyword || "");
  const values = top.map((k) => Number(k.average_monthly_search_volume) || 0);

  slide.addChart(pptx.charts.BAR, [{ name: "Avg. Monthly Searches", labels, values }], {
    x, y, w, h,
    barDir: "bar",
    chartColors: [COLOR.primary],
    showLegend: false,
    showTitle: false,
    showValue: true,
    dataLabelFontSize: 8,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    catAxisLineShow: false,
    valAxisLineShow: false,
    catAxisLabelPos: "low",
    catAxisOrientation: "maxMin", // Ensures the highest volume (first in array) is at the top
  });
}

// ── Section / content slide builders ────────────────────────────────────────
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
      align: "left", transparency: 20,
    });
  }
  return slide;
}

function addContentSlide(title) {
  const slide = pptx.addSlide({ masterName: "CONTENT" });
  slide.addText(title, {
    x: MARGIN, y: 0.25, w: CONTENT_W, h: 0.75,
    fontSize: 26, fontFace: FONT.heading, color: COLOR.primary,
    bold: true, align: "left",
  });
  addDivider(slide, MARGIN, 1.05, CONTENT_W);
  return slide;
}

// ── Truncate helper ─────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Cover ───────────────────────────────────────────────────────────────────
function buildCover() {
  const slide = pptx.addSlide();
  slide.bkgd = COLOR.primary;

  const agencyName = "Scalene Design";
  slide.addText(
    [
      { text: brand.name || "Creative Brief", options: { fontFace: FONT.heading, bold: true } },
      { text: " x ", options: { fontFace: "Space Grotesk", bold: false } },
      { text: agencyName, options: { fontFace: "Space Grotesk", bold: true } },
    ],
    { x: MARGIN, y: 1.5, w: CONTENT_W, h: 1.5, fontSize: 52, color: COLOR.white, align: "left" }
  );

  slide.addText("Creative Brief", {
    x: MARGIN, y: 3.1, w: CONTENT_W, h: 0.6,
    fontSize: 18, fontFace: FONT.heading, color: COLOR.white,
    charSpacing: 4, transparency: 15,
  });

  const productNames = (brief.products || []).map((p) => p.name).join(" · ");
  slide.addText(productNames || `${(brief.products || []).length} product(s)`, {
    x: MARGIN, y: 3.8, w: CONTENT_W, h: 0.5,
    fontSize: 14, fontFace: FONT.body, color: COLOR.white, transparency: 30,
  });

  const dateStr = brief.metadata?.generated_date || new Date().toISOString().split("T")[0];
  slide.addText(dateStr, {
    x: MARGIN, y: SLIDE_H - 1.2, w: CONTENT_W, h: 0.4,
    fontSize: 11, fontFace: FONT.body, color: COLOR.white, transparency: 40,
  });

  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: SLIDE_H - 0.08, w: "100%", h: 0.08,
    fill: { color: COLOR.accent || COLOR.secondary },
  });
}

// ── Brand Guidelines (1 slide) ───────────────────────────────────────────────
function buildBrandGuidelines() {
  const slide = addContentSlide("Brand Guidelines");

  // TOP: colors (left 55%) + typography (right 40%)
  const topY = CONTENT_START_Y;
  const topH = 1.55;
  const colorsW = CONTENT_W * 0.55;
  const typeX = MARGIN + CONTENT_W * 0.6;
  const typeW = CONTENT_W * 0.38;

  addSectionLabel(slide, "Colors", MARGIN, topY, colorsW);

  const chipColors = [
    { colorHex: COLOR.primary, label: "Primary" },
    { colorHex: COLOR.secondary, label: "Secondary" },
    { colorHex: COLOR.accent, label: "Accent" },
  ];
  if (colors.additional) {
    colors.additional.forEach((c, i) => chipColors.push({ colorHex: hex(c), label: `Add. ${i + 1}` }));
  }
  const validChips = chipColors.filter((c) => c.colorHex && c.colorHex !== "333333");
  const CHIP_H = 0.55;
  const CHIP_GAP = 0.1;
  const CHIP_W = Math.min(1.2, (colorsW - CHIP_GAP * (validChips.length - 1)) / Math.max(validChips.length, 1));
  let chipX = MARGIN;
  const chipY = topY + 0.3;
  for (const chip of validChips) {
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: chipX, y: chipY, w: CHIP_W, h: CHIP_H,
      fill: { color: chip.colorHex }, line: { color: COLOR.midGray, width: 0.5 },
    });
    const labelColor = isLightColor(chip.colorHex) ? "333333" : "FFFFFF";
    slide.addText(`${chip.label}\n#${chip.colorHex}`, {
      x: chipX, y: chipY, w: CHIP_W, h: CHIP_H,
      fontSize: 7, fontFace: FONT.body, color: labelColor,
      align: "center", valign: "middle", bold: true,
    });
    chipX += CHIP_W + CHIP_GAP;
  }

  addVerticalDivider(slide, typeX - 0.2, topY, topH);
  addSectionLabel(slide, "Typography", typeX, topY, typeW);
  slide.addText(FONT.heading, {
    x: typeX, y: topY + 0.3, w: typeW, h: 0.55,
    fontSize: 28, fontFace: FONT.heading, color: COLOR.primary, bold: true, shrinkText: true,
  });
  slide.addText(FONT.body, {
    x: typeX, y: topY + 0.9, w: typeW, h: 0.35,
    fontSize: 16, fontFace: FONT.body, color: COLOR.bodyText, shrinkText: true,
  });

  // BOTTOM: Tone | Audience | Descriptors (3 columns, no cards)
  const botY = topY + topH + 0.3;
  addDivider(slide, MARGIN, botY - 0.12, CONTENT_W);
  const botH = SLIDE_H - botY - 0.35;
  const colW3 = (CONTENT_W - 0.3) / 3;
  const col2X = MARGIN + colW3 + 0.15;
  const col3X = MARGIN + (colW3 + 0.15) * 2;

  if (guidelines.tone_of_voice) {
    addSectionLabel(slide, "Tone of Voice", MARGIN, botY, colW3);
    slide.addText(guidelines.tone_of_voice, {
      x: MARGIN, y: botY + 0.3, w: colW3, h: botH - 0.3,
      fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
  }

  if (guidelines.target_demographic) {
    addVerticalDivider(slide, col2X - 0.075, botY, botH);
    addSectionLabel(slide, "Audience", col2X, botY, colW3);
    slide.addText(guidelines.target_demographic, {
      x: col2X, y: botY + 0.3, w: colW3, h: botH - 0.3,
      fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
  }

  if (guidelines.brand_descriptors?.length) {
    addVerticalDivider(slide, col3X - 0.075, botY, botH);
    addSectionLabel(slide, "Brand Descriptors", col3X, botY, colW3);
    slide.addText(
      guidelines.brand_descriptors.slice(0, 5).map((d, i) => `${i + 1}.  ${d}`).join("\n\n"),
      { x: col3X, y: botY + 0.3, w: colW3, h: botH - 0.3, fontSize: 12, fontFace: FONT.body, color: COLOR.bodyText, valign: "top" }
    );
  }
}

// ── Product dispatcher ───────────────────────────────────────────────────────
function buildProduct(product, index) {
  const name = product.name || `Product ${index + 1}`;
  addSectionSlide(name, product.asin ? `ASIN: ${product.asin}` : null);

  buildProductSnapshot(product);
  buildMarketGap(product);
  buildCreativePositioning(product);
  buildCreativeVisual(product);
  buildCompetitorLandscape(product);

  const deliverables = product.deliverables || {};

  if (Array.isArray(deliverables.main_image) && deliverables.main_image.length) {
    addSectionSlide("Main Image", `${deliverables.main_image.length} versions`);
    buildMainImageOverview(deliverables.main_image);
  }

  const listing = deliverables.listing_images;
  if (listing?.images?.length) {
    addSectionSlide("Listing Images", "7-image narrative sequence");
    buildListingImagesOverview(listing);
  }

  if (deliverables.aplus?.modules?.length) {
    addSectionSlide("A+ Content", `${deliverables.aplus.modules.length} modules`);
    buildAplusContentSlide(deliverables.aplus.modules);
  }

  if (product.shot_list?.shots_by_type) {
    buildShotListSection(product.shot_list);
  }
}

// ── Product Snapshot ─────────────────────────────────────────────────────────
function buildProductSnapshot(product) {
  const prodData = product.research?.product || {};
  const slide = addContentSlide(product.name || "Product Overview");

  const leftW = CONTENT_W * 0.35;
  const rightX = MARGIN + leftW + 0.35;
  const rightW = CONTENT_W - leftW - 0.35;
  const topY = CONTENT_START_Y;
  const availH = SLIDE_H - topY - 0.3;

  // Left: image grid (2 rows × 4 cols, 1:1 cells)
  let leftY = topY;
  if (prodData.image_urls?.length) {
    const imgCols = 4;
    const cellW = (leftW - 0.05) / imgCols;
    const cellH = cellW;
    const imgCount = Math.min(prodData.image_urls.length, 8);
    let imgX = MARGIN;
    let imgY = leftY;
    let col = 0;
    for (const url of prodData.image_urls.slice(0, imgCount)) {
      const imgData = imageCache.get(url);
      if (imgData) {
        slide.addImage({
          data: imgData, x: imgX, y: imgY,
          sizing: { type: "contain", w: cellW, h: cellH },
        });
      }
      col++;
      if (col >= imgCols) { col = 0; imgY += cellH; imgX = MARGIN; }
      else { imgX += cellW; }
    }
    leftY += cellH * Math.ceil(imgCount / imgCols) + 0.15;
  }

  const metaLine = [
    prodData.price || null,
    prodData.rating ? `★ ${prodData.rating}` : null,
  ].filter(Boolean).join("   |   ");
  if (metaLine) {
    slide.addText(metaLine, {
      x: MARGIN, y: leftY, w: leftW, h: 0.35,
      fontSize: 13, fontFace: FONT.body, color: COLOR.bodyText, bold: true,
    });
    leftY += 0.45;
  }

  // Description moved to left
  if (prodData.description) {
    addSectionLabel(slide, "Description", MARGIN, leftY, leftW);
    slide.addText(prodData.description, {
      x: MARGIN, y: leftY + 0.28, w: leftW, h: 1.5,
      fontSize: 9, fontFace: FONT.body, color: COLOR.bodyText, valign: "top",
    });
  }

  addVerticalDivider(slide, rightX - 0.175, topY, availH);

  // Right: description + USPs
  let ry = topY;
  if (prodData.usps?.length) {
    addSectionLabel(slide, "Key USPs", rightX, ry, rightW);
    ry += 0.3;
    prodData.usps.forEach((usp, i) => {
      slide.addText([
        { text: `${String(i + 1).padStart(2, "0")}.  `, options: { bold: true, fontSize: 13, color: COLOR.primary } },
        { text: usp, options: { fontSize: 10, color: COLOR.bodyText } },
      ], {
        x: rightX, y: ry, w: rightW, h: 0.42,
        fontFace: FONT.body, valign: "middle", shrinkText: true,
      });
      ry += 0.44;
    });
    ry += 0.1;
  }

  // Top Complaints (conditional)
  if (prodData.complaints?.length) {
    addDivider(slide, rightX, ry, rightW);
    ry += 0.15;
    addSectionLabel(slide, "Top Complaints", rightX, ry, rightW, COLOR.secondary);
    ry += 0.3;
    prodData.complaints.slice(0, 3).forEach((complaint, i) => {
      slide.addText([
        { text: `·  `, options: { bold: true, fontSize: 12, color: COLOR.secondary } },
        { text: complaint, options: { fontSize: 9.5, color: COLOR.bodyText } },
      ], {
        x: rightX, y: ry, w: rightW, h: 0.4,
        fontFace: FONT.body, valign: "top", shrinkText: true,
      });
      ry += 0.42;
    });
  }
}

// ── Market Gap ───────────────────────────────────────────────────────────────
function buildMarketGap(product) {
  const research = product.research || {};
  const keywords = research.keywords || [];
  const gap = research.gap_analysis || {};
  const slide = addContentSlide("Market Gap");
  const topY = CONTENT_START_Y;
  const availH = SLIDE_H - topY - 0.3;

  // Keyword bar chart
  const chartH = 2.2;
  addSectionLabel(slide, "Top Keywords by Search Volume", MARGIN, topY, CONTENT_W);
  if (keywords.length) {
    addKeywordBarChart(slide, keywords, MARGIN, topY + 0.28, CONTENT_W, chartH - 0.28);
  }

  // 3-column gap analysis
  const colY = topY + chartH + 0.28;
  const colH = 2.0;
  const colGap = 0.18;
  const colW = (CONTENT_W - colGap * 2) / 3;
  const col2X = MARGIN + colW + colGap;
  const col3X = MARGIN + (colW + colGap) * 2;

  const gapCols = [
    { label: "Visual Patterns", items: gap.visual_patterns || [] },
    { label: "Differentiation Opportunities", items: gap.differentiation_opportunities || [] },
    { label: "Complaints to Address", items: gap.complaints_to_address || [] },
  ];
  gapCols.forEach(({ label, items }, i) => {
    const cx = [MARGIN, col2X, col3X][i];
    if (i > 0) addVerticalDivider(slide, cx - colGap / 2, colY, colH);
    addSectionLabel(slide, label, cx, colY, colW);
    items.slice(0, 5).forEach((item, j) => {
      slide.addText([
        { text: `${String(j + 1).padStart(2, "0")}.  `, options: { bold: true, fontSize: 10, color: COLOR.primary } },
        { text: item, options: { fontSize: 9, color: COLOR.bodyText } },
      ], {
        x: cx, y: colY + 0.3 + j * 0.55, w: colW, h: 0.5,
        fontFace: FONT.body, valign: "top", shrinkText: true,
      });
    });
  });

  // Visual implication as a strategic callout below columns
  if (research.visual_implication) {
    const implY = colY + colH + 0.3;
    slide.addText(research.visual_implication, {
      x: MARGIN, y: implY, w: CONTENT_W, h: 0.6,
      fontSize: 10, fontFace: FONT.body, color: COLOR.primary, italic: true,
      valign: "top", shrinkText: true,
    });
  }
}

// ── Creative Positioning ─────────────────────────────────────────────────────
function buildCreativePositioning(product) {
  const creative = product.creative_direction || {};
  if (!creative.positioning_statement && !creative.key_messages?.length && !creative.competitive_differentiation) return;

  const slide = addContentSlide("Creative Positioning");
  let cy = CONTENT_START_Y;

  if (creative.positioning_statement) {
    addSectionLabel(slide, "Positioning Statement", MARGIN, cy, CONTENT_W);
    slide.addText(creative.positioning_statement, {
      x: MARGIN, y: cy + 0.28, w: CONTENT_W, h: 0.8,
      fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText,
      valign: "top", shrinkText: true,
    });
    cy += 1.15;
  }

  if (creative.competitive_differentiation) {
    addSectionLabel(slide, "Competitive Differentiation", MARGIN, cy, CONTENT_W);
    slide.addText(creative.competitive_differentiation, {
      x: MARGIN, y: cy + 0.28, w: CONTENT_W, h: 0.8,
      fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText,
      valign: "top", shrinkText: true,
    });
    cy += 1.15;
  }

  if (creative.key_messages?.length) {
    addSectionLabel(slide, "Key Messages", MARGIN, cy, CONTENT_W);
    cy += 0.3;
    creative.key_messages.forEach((msg, i) => {
      const my = cy;
      slide.addText([
        { text: `${String(i + 1).padStart(2, "0")}  `, options: { bold: true, fontSize: 20, color: COLOR.primary, fontFace: FONT.heading } },
        { text: msg, options: { fontSize: 12, color: COLOR.bodyText, fontFace: FONT.body } },
      ], {
        x: MARGIN, y: my, w: CONTENT_W, h: 0.55,
        valign: "middle", shrinkText: true,
      });
      addDivider(slide, MARGIN, my + 0.58, CONTENT_W, COLOR.midGray, 0.5);
      cy += 0.62;
    });
  }
}

// ── Creative Direction: Visual Direction ────────────────────────────────────
function buildCreativeVisual(product) {
  const creative = product.creative_direction || {};
  const vd = creative.visual_direction;
  if (!vd) return;
  const slide = addContentSlide("Visual Direction");
  const topY = CONTENT_START_Y;

  if (vd && typeof vd === "object") {
    const vdRows = [
      ["Color World", vd.color_world],
      ["Lighting Signature", vd.lighting_signature],
      ["Model Direction", vd.model_direction],
      ["Prop Styling", vd.prop_styling],
      ["Environment / Surface", vd.environment_surface_direction],
      ["Mood", vd.mood],
    ].filter(([, v]) => !!v);

    const cols = 2;
    const tileW = (CONTENT_W - 0.3) / cols;
    const rows = Math.ceil(vdRows.length / cols);
    const tileH = Math.min(1.4, (SLIDE_H - topY - 0.5) / rows);
    const col2X = MARGIN + tileW + 0.3;

    vdRows.forEach(([label, value], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tx = col === 0 ? MARGIN : col2X;
      const ty = topY + row * (tileH + 0.1);
      addTypographicTile(slide, label, value, tx, ty, tileW, tileH);
    });
  }
}

// ── Competitor Landscape ─────────────────────────────────────────────────────
function buildCompetitorLandscape(product) {
  const competitors = product.research?.competitors || [];
  if (!competitors.length) return;

  const slide = addContentSlide("Competitor Landscape");
  const AVAIL_H = SLIDE_H - CONTENT_START_Y - 0.15;
  const cols = 3;
  const colGap = 0.25;
  const colW = (CONTENT_W - colGap * (cols - 1)) / cols;
  const rowGap = 0.2;
  const competitorsPerCol = Math.ceil(competitors.length / cols);
  const cardH = (AVAIL_H - rowGap * (competitorsPerCol - 1)) / competitorsPerCol;

  const imgPad = 0.1;
  const imgCols = 4;
  const imgRows = 2;
  const imgCellSize = Math.min(
    (colW - imgPad * 2 - 0.04 * (imgCols - 1)) / imgCols,
    (cardH * 0.38 - 0.04 * (imgRows - 1)) / imgRows
  );
  const imgGridH = imgCellSize * imgRows + 0.04 * (imgRows - 1);

  competitors.forEach((comp, ci) => {
    const col = ci % cols;
    const row = Math.floor(ci / cols);
    const x = MARGIN + col * (colW + colGap);
    const y = CONTENT_START_Y + row * (cardH + rowGap);

    if (col > 0) addVerticalDivider(slide, x - colGap / 2, CONTENT_START_Y, AVAIL_H);
    if (row > 0 && col === 0) addDivider(slide, MARGIN, y - rowGap / 2, CONTENT_W, COLOR.midGray, 0.5);

    let innerY = y;

    const nameLine = [
      { text: comp.name || "Competitor", options: { fontSize: 12, bold: true, color: COLOR.primary, fontFace: FONT.heading } },
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
    slide.addText(nameLine, { x: x + imgPad, y: innerY, w: colW - imgPad * 2, h: 0.3, fontFace: FONT.heading });
    innerY += 0.32;

    const metrics = [comp.price, comp.rating ? `★ ${comp.rating}` : null].filter(Boolean).join("   |   ");
    if (metrics) {
      slide.addText(metrics, {
        x: x + imgPad, y: innerY, w: colW - imgPad * 2, h: 0.22,
        fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray,
      });
      innerY += 0.25;
    }

    if (comp.image_urls?.length) {
      const maxImages = Math.min(comp.image_urls.length, imgRows * imgCols);
      let imgX = x + imgPad;
      let imgY = innerY;
      let imgCol = 0;
      for (let i = 0; i < maxImages; i++) {
        const imgData = imageCache.get(comp.image_urls[i]);
        if (imgData) {
          slide.addImage({
            data: imgData, x: imgX, y: imgY,
            sizing: { type: "contain", w: imgCellSize, h: imgCellSize },
          });
        }
        imgCol++;
        if (imgCol >= imgCols) { imgCol = 0; imgY += imgCellSize + 0.04; imgX = x + imgPad; }
        else { imgX += imgCellSize + 0.04; }
      }
      innerY += imgGridH + 0.1;
    }

    const kwInfo = [
      comp.intersecting_keywords != null ? `${comp.intersecting_keywords} intersecting kw` : null,
      comp.avg_position != null ? `avg pos ${comp.avg_position}` : null,
    ].filter(Boolean).join("  ·  ");
    if (kwInfo) {
      slide.addText(kwInfo, {
        x: x + imgPad, y: innerY, w: colW - imgPad * 2, h: 0.22,
        fontSize: 8, fontFace: FONT.body, color: COLOR.darkGray,
      });
      innerY += 0.25;
    }

    let remainingH = cardH - (innerY - y) - 0.25;

    if (comp.usps?.length) {
      addSectionLabel(slide, "USPs", x + imgPad, innerY, colW - imgPad * 2);
      const uspH = comp.complaints?.length ? remainingH * 0.55 : remainingH;
      slide.addText(comp.usps.slice(0, 3).map((u) => `·  ${u}`).join("\n"), {
        x: x + imgPad, y: innerY + 0.22, w: colW - imgPad * 2, h: Math.max(uspH - 0.22, 0.3),
        fontSize: 8, fontFace: FONT.body, color: COLOR.bodyText, valign: "top", shrinkText: true,
      });
      innerY += uspH;
    }

    if (comp.complaints?.length) {
      addSectionLabel(slide, "Complaints", x + imgPad, innerY, colW - imgPad * 2);
      const compH = cardH - (innerY - y) - 0.1;
      slide.addText(comp.complaints.slice(0, 3).map((u) => `·  ${u}`).join("\n"), {
        x: x + imgPad, y: innerY + 0.22, w: colW - imgPad * 2, h: Math.max(compH, 0.3),
        fontSize: 8, fontFace: FONT.body, color: COLOR.bodyText, valign: "top", shrinkText: true,
      });
    }
  });

  // Competitor listing images (image-dominant slide)
  const allImages = competitors
    .filter((c) => c.image_urls?.length)
    .map((c) => ({ name: c.name || c.asin || "Competitor", urls: c.image_urls }));

  if (allImages.length) {
    const imgSlide = addContentSlide("Competitor Listing Images");
    const imgsPerRow = 8;
    const imgW = CONTENT_W / imgsPerRow;
    const imgH = imgW;
    let iy = CONTENT_START_Y;
    allImages.forEach((comp) => {
      addSectionLabel(imgSlide, comp.name, MARGIN, iy, CONTENT_W);
      iy += 0.26;
      let ix = MARGIN;
      comp.urls.slice(0, imgsPerRow).forEach((url) => {
        const imgData = imageCache.get(url);
        if (imgData) {
          imgSlide.addImage({
            data: imgData, x: ix, y: iy,
            sizing: { type: "contain", w: imgW, h: imgH },
          });
        }
        ix += imgW;
      });
      iy += imgH + 0.18;
    });
  }
}

// ── Main Image Overview (1 slide, all versions) ──────────────────────────────
function buildMainImageOverview(versions) {
  const slide = addContentSlide("Main Image — All Versions");
  const n = versions.length;
  const gap = 0.15;
  const squareSize = (CONTENT_W - gap * (n - 1)) / n; // 1:1
  const squareY = CONTENT_START_Y + 0.05;
  const labelY = squareY + squareSize + 0.12;
  const labelH = SLIDE_H - labelY - 0.35;

  versions.forEach((v, i) => {
    const x = MARGIN + i * (squareSize + gap);

    slide.addShape(pptx.shapes.RECTANGLE, {
      x, y: squareY, w: squareSize, h: squareSize,
      fill: { color: "F5F5F5" },
      line: { color: "CCCCCC", width: 1 },
    });

    if (v.visual_concept) {
      slide.addText(v.visual_concept, {
        x: x + 0.1, y: squareY + 0.1, w: squareSize - 0.2, h: squareSize - 0.2,
        fontSize: 7, fontFace: FONT.body, color: COLOR.darkGray,
        align: "center", valign: "middle", shrinkText: true,
      });
    }

    slide.addText(String(v.version_number || i + 1), {
      x, y: labelY, w: squareSize, h: 0.42,
      fontSize: 24, fontFace: FONT.heading, color: COLOR.primary,
      bold: true, align: "center",
    });
    if (v.strategy_name) {
      slide.addText(v.strategy_name, {
        x, y: labelY + 0.44, w: squareSize, h: 0.3,
        fontSize: 10, fontFace: FONT.heading, color: COLOR.bodyText,
        bold: true, align: "center", shrinkText: true,
      });
    }
    if (v.feature) {
      slide.addText(v.feature.toUpperCase(), {
        x, y: labelY + 0.76, w: squareSize, h: 0.2,
        fontSize: 7, fontFace: FONT.body, color: COLOR.darkGray,
        bold: true, charSpacing: 1.5, align: "center", shrinkText: true,
      });
    }
    if (v.strategy && labelH > 1.1) {
      slide.addText(v.strategy, {
        x, y: labelY + 1.0, w: squareSize, h: labelH - 1.0,
        fontSize: 8, fontFace: FONT.body, color: COLOR.darkGray,
        align: "center", valign: "top", shrinkText: true,
      });
    }
  });
}

// ── Listing Images Overview (1 slide, all slots) ─────────────────────────────
function buildListingImagesOverview(listing) {
  const slide = addContentSlide("Listing Images — Narrative Sequence");
  const images = listing.images || [];
  const n = images.length;
  const gap = 0.1;
  const squareSize = (CONTENT_W - gap * (n - 1)) / n; // 1:1

  let contentY = CONTENT_START_Y;

  // sequence_strategy as plain text
  if (listing.sequence_strategy) {
    slide.addText(listing.sequence_strategy, {
      x: MARGIN, y: contentY, w: CONTENT_W, h: 0.5,
      fontSize: 10, fontFace: FONT.body, color: COLOR.bodyText,
      italic: true, valign: "top", shrinkText: true,
    });
    contentY += 0.65;
  }

  const squareY = contentY;
  const labelY = squareY + squareSize + 0.1;
  const roleColor = {
    Opening: COLOR.darkGray,
    Middle: COLOR.darkGray,
    Closing: COLOR.darkGray,
  };

  images.forEach((img, i) => {
    const x = MARGIN + i * (squareSize + gap);

    // 1:1 box
    slide.addShape(pptx.shapes.RECTANGLE, {
      x, y: squareY, w: squareSize, h: squareSize,
      fill: { color: "F5F5F5" },
      line: { color: "CCCCCC", width: 1 },
    });

    // Overlay structured copy inside the box
    const copy = img.copy || {};
    if (typeof img.copy === "string" && img.copy.trim()) {
      // Backward compat: old plain-string copy
      slide.addText(`"${img.copy}"`, {
        x: x + 0.05, y: squareY + 0.05, w: squareSize - 0.1, h: squareSize - 0.1,
        fontSize: 7, fontFace: FONT.body, color: COLOR.bodyText,
        italic: true, align: "center", valign: "middle", shrinkText: true,
      });
    } else if (typeof copy === "object") {
      const pad = 0.08;
      const innerW = squareSize - pad * 2;
      let cy = squareY + pad;
      const maxY = squareY + squareSize - pad;

      if (copy.heading) {
        const hH = 0.36;
        slide.addText(copy.heading, {
          x: x + pad, y: cy, w: innerW, h: hH,
          fontSize: 9, fontFace: FONT.heading, color: COLOR.primary,
          bold: true, align: "center", valign: "top", shrinkText: true,
        });
        cy += hH + 0.02;
      }
      if (copy.subheading) {
        const sH = 0.26;
        slide.addText(copy.subheading, {
          x: x + pad, y: cy, w: innerW, h: sH,
          fontSize: 7, fontFace: FONT.body, color: COLOR.bodyText,
          align: "center", valign: "top", shrinkText: true,
        });
        cy += sH + 0.02;
      }
      if (Array.isArray(copy.bullet_points) && copy.bullet_points.length) {
        const bpText = copy.bullet_points.map((bp) => `·  ${bp}`).join("\n");
        const bpH = Math.min(maxY - cy, copy.bullet_points.length * 0.15 + 0.05);
        slide.addText(bpText, {
          x: x + pad, y: cy, w: innerW, h: Math.max(bpH, 0.2),
          fontSize: 6.5, fontFace: FONT.body, color: COLOR.darkGray,
          align: "left", valign: "top", shrinkText: true,
        });
      }
    }

    slide.addText(String(img.slot_number || i + 1), {
      x, y: labelY, w: squareSize, h: 0.36,
      fontSize: 20, fontFace: FONT.heading, color: COLOR.primary,
      bold: true, align: "center",
    });
    if (img.role_in_sequence) {
      slide.addText(img.role_in_sequence.toUpperCase(), {
        x, y: labelY + 0.37, w: squareSize, h: 0.2,
        fontSize: 7, fontFace: FONT.body,
        color: roleColor[img.role_in_sequence] || COLOR.darkGray,
        bold: true, charSpacing: 1.5, align: "center", shrinkText: true,
      });
    }
    if (img.image_type) {
      slide.addText(img.image_type.replace("_", " ").toUpperCase(), {
        x, y: labelY + 0.59, w: squareSize, h: 0.18,
        fontSize: 6, fontFace: FONT.body, color: COLOR.darkGray,
        charSpacing: 1, align: "center", shrinkText: true,
      });
    }
    if (img.strategy) {
      slide.addText(img.strategy, {
        x, y: labelY + 0.80, w: squareSize, h: 0.35,
        fontSize: 6, fontFace: FONT.body, color: COLOR.darkGray,
        align: "center", valign: "top", shrinkText: true,
      });
    }
    if (img.visual_concept) {
      const vcY = img.strategy ? labelY + 1.18 : labelY + 0.80;
      slide.addText(img.visual_concept, {
        x, y: vcY, w: squareSize, h: 0.35,
        fontSize: 6, fontFace: FONT.body, color: COLOR.darkGray,
        italic: true, align: "center", valign: "top", shrinkText: true,
      });
    }
  });
}

// ── A+ Content (1 slide, vertically stacked composite) ───────────────────────
function buildAplusContentSlide(modules) {
  const slide = addContentSlide("A+ Content");
  if (!modules?.length) return;

  // All modules stacked vertically: Module 1 = 1464x1200, Modules 2-6 = 1464x600 each
  // Total pixel height: 1200 + 5*600 = 4200
  const TOTAL_PX_H = 4200;
  const COMP_H = SLIDE_H - 0.9 - 0.35;
  const COMP_W = COMP_H * (1464 / TOTAL_PX_H);
  const compX = MARGIN;
  const compY = 0.9;
  const pxScale = COMP_H / TOTAL_PX_H;

  const mHeights = [1200, 600, 600, 600, 600, 600];

  let pxOffset = 0;
  modules.forEach((mod, i) => {
    if (!mod) return;
    const mh = mHeights[i] ?? 600;
    const rectY = compY + pxOffset * pxScale;
    const rectH = mh * pxScale;
    const rectX = compX;
    const rectW = COMP_W;

    slide.addShape(pptx.shapes.RECTANGLE, {
      x: rectX, y: rectY, w: rectW, h: rectH,
      fill: { color: i === 0 ? "EBEBEB" : "F5F5F5" },
      line: { color: COLOR.accent || "CCCCCC", width: 0.75 },
    });


    // Render copy inside the module box
    const copy = mod.copy || {};
    const pad = 0.04;
    const innerW = rectW - pad * 2;
    let cy = rectY + pad;
    const maxCY = rectY + rectH - pad;

    // Backward compat: old-format copy with tagline/headline/body/icons
    const heading = copy.heading || copy.tagline || copy.headline || null;
    const subheading = copy.subheading || copy.description || copy.body || null;
    const bullets = Array.isArray(copy.bullet_points) ? copy.bullet_points
      : Array.isArray(copy.icons) ? copy.icons.map((ic) => `${ic.label || ""} — ${ic.description || ""}`) : null;

    if (heading) {
      const hH = Math.min(0.26, rectH * 0.25);
      slide.addText(heading, {
        x: rectX + pad, y: cy, w: innerW, h: hH,
        fontSize: 8, fontFace: FONT.heading, color: COLOR.primary,
        bold: true, align: "center", valign: "top", shrinkText: true,
      });
      cy += hH + 0.02;
    }
    if (subheading) {
      const sH = Math.min(0.2, rectH * 0.2);
      slide.addText(subheading, {
        x: rectX + pad, y: cy, w: innerW, h: sH,
        fontSize: 6, fontFace: FONT.body, color: COLOR.bodyText,
        align: "center", valign: "top", shrinkText: true,
      });
      cy += sH + 0.02;
    }
    if (bullets && bullets.length) {
      const bpText = bullets.map((bp) => `·  ${bp}`).join("\n");
      const bpH = Math.max(maxCY - cy, 0.15);
      slide.addText(bpText, {
        x: rectX + pad, y: cy, w: innerW, h: bpH,
        fontSize: 5.5, fontFace: FONT.body, color: COLOR.darkGray,
        align: "left", valign: "top", shrinkText: true,
      });
    }

    // Module number badge (bottom-right corner)
    slide.addText(`${i + 1}`, {
      x: rectX + rectW - 0.22, y: rectY + rectH - 0.18, w: 0.18, h: 0.14,
      fontSize: 6, fontFace: FONT.body, color: COLOR.secondary || "BBBBBB",
      align: "right", valign: "bottom", bold: true,
    });

    pxOffset += mh;
  });

  // Right annotations panel — one row per module, aligned to composite
  const annX = compX + COMP_W + 0.4;
  const annW = SLIDE_W - annX - MARGIN;

  pxOffset = 0;
  modules.forEach((mod, i) => {
    if (!mod) return;
    const mh = mHeights[i] ?? 600;
    const rowY = compY + pxOffset * pxScale;
    const rowH = mh * pxScale;
    const pad = 0.06;

    if (i > 0) addDivider(slide, annX, rowY, annW, COLOR.midGray, 0.5);

    addSectionLabel(slide, (mod.module_role || "").replace(/_/g, " "), annX, rowY + pad, annW, COLOR.primary);

    let annotY = rowY + pad + 0.22;
    const annotBottom = rowY + rowH - pad;

    if (mod.strategy) {
      const stratH = mod.visual_concept
        ? Math.min(0.38, (annotBottom - annotY) * 0.5)
        : Math.max(annotBottom - annotY, 0.1);
      slide.addText("Strategy", {
        x: annX, y: annotY, w: annW, h: 0.14,
        fontSize: 6, fontFace: FONT.body, color: COLOR.bodyText,
        bold: true, valign: "top",
      });
      slide.addText(mod.strategy, {
        x: annX, y: annotY + 0.15, w: annW, h: Math.max(stratH - 0.15, 0.1),
        fontSize: 7, fontFace: FONT.body, color: COLOR.bodyText,
        valign: "top", shrinkText: true,
      });
      annotY += stratH + 0.06;
    }

    if (mod.visual_concept && annotY < annotBottom) {
      // em-rule separator
      slide.addText("— — —", {
        x: annX, y: annotY, w: annW, h: 0.13,
        fontSize: 6, fontFace: FONT.body, color: COLOR.midGray,
        valign: "top",
      });
      annotY += 0.14;
      slide.addText("Visual Concept", {
        x: annX, y: annotY, w: annW, h: 0.14,
        fontSize: 6, fontFace: FONT.body, color: COLOR.darkGray,
        bold: true, italic: true, valign: "top",
      });
      annotY += 0.15;
      slide.addText(mod.visual_concept, {
        x: annX, y: annotY, w: annW, h: Math.max(annotBottom - annotY, 0.1),
        fontSize: 6.5, fontFace: FONT.body, color: COLOR.darkGray,
        italic: true, valign: "top", shrinkText: true,
      });
    }

    pxOffset += mh;
  });
}

// ── Shot List ─────────────────────────────────────────────────────────────────
function buildShotListSection(shotList) {
  const shotsByType = shotList.shots_by_type || {};
  const typeKeys = Object.keys(shotsByType).filter((k) => Array.isArray(shotsByType[k]) && shotsByType[k].length);
  if (!typeKeys.length) return;

  addSectionSlide("Shot List", `${typeKeys.length} shot type${typeKeys.length === 1 ? "" : "s"}`);

  // Visual DNA — 2×3 typographic tile grid
  const vd = shotList.visual_dna || {};
  const dnaRows = [
    ["Color World", vd.color_world],
    ["Lighting Signature", vd.lighting_signature],
    ["Model Direction", vd.model_direction],
    ["Prop Styling", vd.prop_styling],
    ["Environment / Surface", vd.environment_surface_direction],
    ["Mood", vd.mood],
  ].filter(([, v]) => !!v);

  if (dnaRows.length) {
    const dnaSlide = addContentSlide("Visual DNA");
    const tileW = (CONTENT_W - 0.3) / 2;
    const rows = Math.ceil(dnaRows.length / 2);
    const tileH = Math.min(1.4, (SLIDE_H - CONTENT_START_Y - 0.35) / rows);
    const col2X = MARGIN + tileW + 0.3;
    dnaRows.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = col === 0 ? MARGIN : col2X;
      const ty = CONTENT_START_Y + row * (tileH + 0.1);
      addTypographicTile(dnaSlide, label, value, tx, ty, tileW, tileH);
    });
  }

  buildAllShotTypesSlides(shotsByType, typeKeys);
}

function buildAllShotTypesSlides(shotsByType, typeKeys) {
  const AVAIL_H = SLIDE_H - CONTENT_START_Y - 0.35;
  const META_H = 0.22;
  const INDENT = 0.22;
  const TYPE_H = 0.42;

  for (const key of typeKeys) {
    const options = shotsByType[key] || [];
    const typePretty = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const slide = addContentSlide(typePretty);
    let currentY = CONTENT_START_Y;

    // Options count label (top-right)
    slide.addText(`${options.length} option${options.length === 1 ? "" : "s"}`, {
      x: MARGIN + CONTENT_W * 0.65, y: currentY - TYPE_H + 0.08, w: CONTENT_W * 0.35, h: 0.28,
      fontSize: 8, fontFace: FONT.body, color: COLOR.darkGray,
      bold: true, charSpacing: 2, align: "right",
    });

    // Divide available height equally among options
    const optionH = AVAIL_H / Math.max(options.length, 1);
    const promptH = optionH - META_H - 0.14;

    options.forEach((opt, i) => {
      const optY = currentY + i * optionH;

      if (i > 0) {
        addDivider(slide, MARGIN, optY, CONTENT_W, COLOR.midGray, 0.5);
      }

      // Line 1: option_id · AR · lighting
      const metaBits = [
        opt.option_id || "",
        opt.aspect_ratio ? `AR ${opt.aspect_ratio}` : null,
        opt.lighting ? opt.lighting : null,
      ].filter(Boolean).join("  ·  ");

      slide.addText(metaBits, {
        x: MARGIN + INDENT, y: optY + 0.08, w: CONTENT_W - INDENT, h: META_H,
        fontSize: 9, fontFace: FONT.body, color: COLOR.darkGray, shrinkText: true,
      });

      // Line 2: prompt fills remaining height
      if (opt.prompt) {
        slide.addText(opt.prompt, {
          x: MARGIN + INDENT, y: optY + 0.08 + META_H, w: CONTENT_W - INDENT, h: promptH,
          fontSize: 8, fontFace: FONT.body, color: COLOR.bodyText,
          valign: "top", shrinkText: true,
        });
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD DECK
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  imageCache = await prefetchAllImages(brief);

  buildCover();
  buildBrandGuidelines();
  (brief.products || []).forEach((product, i) => buildProduct(product, i));

  const outputPath = resolve(OUTPUT);
  try {
    await pptx.writeFile({ fileName: outputPath });
    console.log(JSON.stringify({ success: true, output: outputPath }));
  } catch (err) {
    console.error(JSON.stringify({ error: `PPTX generation failed: ${err.message}` }));
    process.exit(1);
  }
})();
