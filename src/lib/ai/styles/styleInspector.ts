/**
 * DOCIUM Attached Source Style & Design-Token Inspector
 *
 * Extracts deterministic typography, colors, margins, page setup, table styles,
 * and quote/callout styling from uploaded workspace files:
 *  - DOCX (word/theme/theme1.xml, word/styles.xml, word/document.xml via JSZip)
 *  - HTML / HTM (CSS stylesheets & inline style histograms)
 *  - PDF (unpdf/pdfjs viewports, font/size clusters, color operator streams + sharp visual fallback)
 *  - Standalone Images (sharp quantized palette + optional VLM design-token refinement)
 */

import { ProviderId } from '@/lib/types';
import { getOriginalFile } from '@/lib/storage/sourceStorage';
import { isPdfBuffer, renderPdfPageToImage, optimizeImageBufferForVision } from '../pdf/pdfService';
import { executeVisionInspection } from '../vision/visionRunner';
import { isVisionCapableModel } from '../providers';

export interface HeadingStyleSpec {
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface SourceStyleInspectionResult {
  success: boolean;
  sourceId: string;
  title: string;
  sourceType: 'docx' | 'pdf' | 'html' | 'image' | 'unknown';
  extractionMethod:
    | 'exact_ooxml'
    | 'exact_css'
    | 'pdf_objects'
    | 'pdf_visual_plus_objects'
    | 'visual_palette'
    | 'fallback';
  confidence: 'high' | 'medium' | 'low';
  pageSetup?: {
    pageSize?: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | 'Tabloid' | 'custom';
    dimensionsMm?: { width: number; height: number };
    orientation?: 'portrait' | 'landscape';
    marginsMm?: { top: number; bottom: number; left: number; right: number };
    columns?: number;
    pageColor?: string;
    pageBorder?: { enabled: boolean; color?: string; widthPt?: number; style?: string };
  };
  typography?: {
    body?: {
      fontFamily?: string;
      fontSizePt?: number;
      color?: string;
      lineSpacing?: number;
      spaceAfterPt?: number;
      alignment?: 'left' | 'center' | 'right' | 'justify';
    };
    headings?: Partial<Record<'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4', HeadingStyleSpec>>;
    allDetectedFonts?: string[];
  };
  palette?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    text?: string;
    muted?: string;
    background?: string;
    highlight?: string;
    tableHeaderFill?: string;
    tableHeaderText?: string;
    tableStripeFill?: string;
    quoteBorderColor?: string;
    detectedHexColors?: string[];
  };
  components?: {
    blockquote?: {
      borderLeftColor?: string;
      borderLeftWidthPt?: number;
      backgroundColor?: string;
      italic?: boolean;
      textColor?: string;
    };
    table?: {
      borderStyle?: string;
      borderColor?: string;
      headerFill?: string;
      headerTextColor?: string;
      alternatingRowFill?: string;
    };
  };
  recommendedDociumActions?: string[];
  visualNotes?: string;
  error?: string;
}

export interface InspectStylesOptions {
  workspaceId: string;
  sourceId: string;
  sourceTitle?: string;
  mimeType?: string;
  pages?: number[];
  visionAuth?: {
    providerId?: ProviderId;
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
    accountId?: string;
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((x) => x.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}

function normalizeHex(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const clean = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean.toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
  }
  const rgbMatch = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }
  return undefined;
}

function classifyPageSize(widthMm: number, heightMm: number): 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | 'Tabloid' | 'custom' {
  const shortSide = Math.min(widthMm, heightMm);
  const longSide = Math.max(widthMm, heightMm);
  const closeTo = (a: number, b: number, tol = 5) => Math.abs(shortSide - a) <= tol && Math.abs(longSide - b) <= tol;
  if (closeTo(210, 297)) return 'A4';
  if (closeTo(215.9, 279.4)) return 'Letter';
  if (closeTo(215.9, 355.6)) return 'Legal';
  if (closeTo(297, 420)) return 'A3';
  if (closeTo(148, 210)) return 'A5';
  if (closeTo(279.4, 431.8)) return 'Tabloid';
  return 'custom';
}

function isNearWhiteOrBlack(hex: string): 'white' | 'black' | 'neutral' | 'chromatic' {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (r > 240 && g > 240 && b > 240) return 'white';
  if (r < 35 && g < 35 && b < 35 && sat < 0.25) return 'black';
  if (sat < 0.14) return 'neutral';
  return 'chromatic';
}

function cleanPdfFontName(rawFont: string): { family: string; bold: boolean; italic: boolean } {
  const stripped = rawFont.replace(/^[A-Z]{6}\+/, '').trim();
  const bold = /bold|black|heavy|semibold|demi|medi/i.test(stripped);
  const italic = /italic|oblique|slant/i.test(stripped);
  const family = stripped
    .replace(/[-_,](Bold|Italic|Oblique|Regular|Medium|Light|Semibold|SemiBold|Heavy|Black|MT|PS|Std)+/gi, '')
    .replace(/(BoldItalic|Bold|Italic|Regular|MT|PS)$/i, '')
    .replace(/[-_]+$/, '')
    .trim();
  return { family: family || stripped, bold, italic };
}

function buildRecommendedActions(result: SourceStyleInspectionResult): string[] {
  const actions: string[] = [];
  if (result.typography?.body?.fontFamily) {
    actions.push(`set_font_family({ fontFamily: "${result.typography.body.fontFamily}" })`);
  }
  if (result.typography?.body?.fontSizePt) {
    actions.push(`set_font_size({ fontSize: ${Math.round(result.typography.body.fontSizePt)} })`);
  }
  if (result.typography?.body?.lineSpacing) {
    actions.push(`set_line_spacing({ lineSpacing: ${Number(result.typography.body.lineSpacing.toFixed(2))} })`);
  }
  const h1 = result.typography?.headings?.h1;
  if (h1) {
    actions.push(
      `format_all_headings({ level: 1, ${h1.fontFamily ? `fontFamily: "${h1.fontFamily}", ` : ''}${h1.fontSizePt ? `fontSize: ${Math.round(h1.fontSizePt)}, ` : ''}${h1.color ? `color: "${h1.color}"` : ''} })`
    );
  }
  const h2 = result.typography?.headings?.h2;
  if (h2) {
    actions.push(
      `format_all_headings({ level: 2, ${h2.fontFamily ? `fontFamily: "${h2.fontFamily}", ` : ''}${h2.fontSizePt ? `fontSize: ${Math.round(h2.fontSizePt)}, ` : ''}${h2.color ? `color: "${h2.color}"` : ''} })`
    );
  }
  if (result.pageSetup?.pageSize && result.pageSetup.pageSize !== 'custom') {
    actions.push(`set_page_size({ pageSize: "${result.pageSetup.pageSize}" })`);
  }
  if (result.pageSetup?.orientation) {
    actions.push(`set_page_orientation({ orientation: "${result.pageSetup.orientation}" })`);
  }
  if (result.pageSetup?.marginsMm) {
    const m = result.pageSetup.marginsMm;
    actions.push(`set_page_margins({ top: ${m.top}, bottom: ${m.bottom}, left: ${m.left}, right: ${m.right} })`);
  }
  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DOCX OOXML Style Inspector
// ─────────────────────────────────────────────────────────────────────────────

function extractAttr(xml: string, attrName: string): string | undefined {
  const re = new RegExp(`\\b${attrName}="([^"]+)"`, 'i');
  return xml.match(re)?.[1];
}

function applyThemeTintShade(hex: string, tintHex?: string, shadeHex?: string): string {
  const clean = hex.replace('#', '');
  let r = parseInt(clean.slice(0, 2), 16);
  let g = parseInt(clean.slice(2, 4), 16);
  let b = parseInt(clean.slice(4, 6), 16);
  if (tintHex && /^[0-9a-f]{1,2}$/i.test(tintHex)) {
    const t = parseInt(tintHex, 16) / 255;
    r = Math.round(r * t + 255 * (1 - t));
    g = Math.round(g * t + 255 * (1 - t));
    b = Math.round(b * t + 255 * (1 - t));
  }
  if (shadeHex && /^[0-9a-f]{1,2}$/i.test(shadeHex)) {
    const s = parseInt(shadeHex, 16) / 255;
    r = Math.round(r * s);
    g = Math.round(g * s);
    b = Math.round(b * s);
  }
  return rgbToHex(r, g, b);
}

interface ParsedDocxStyleBlock {
  styleId: string;
  name: string;
  type: string;
  basedOn?: string;
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  lineSpacing?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  borderLeftColor?: string;
  borderLeftWidthPt?: number;
  shadingFill?: string;
}

async function extractDocxStyles(
  buffer: Buffer,
  sourceId: string,
  title: string
): Promise<SourceStyleInspectionResult> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);

  // A. Parse theme1.xml (theme color scheme & major/minor theme fonts)
  const themeColors: Record<string, string> = {
    text1: '#000000',
    background1: '#FFFFFF',
    dk1: '#000000',
    lt1: '#FFFFFF',
  };
  let majorThemeFont = '';
  let minorThemeFont = '';

  const themeFile = zip.file('word/theme/theme1.xml');
  if (themeFile) {
    const themeXml = await themeFile.async('string');
    const colorKeys = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    for (const key of colorKeys) {
      const m = themeXml.match(new RegExp(`<a:${key}>([\\s\\S]*?)<\\/a:${key}>`, 'i'));
      if (m) {
        const srgb = m[1].match(/<a:srgbClr\b[^>]*val="([0-9a-f]{6})"/i)?.[1];
        const sys = m[1].match(/<a:sysClr\b[^>]*lastClr="([0-9a-f]{6})"/i)?.[1];
        const hex = normalizeHex(srgb || sys);
        if (hex) themeColors[key] = hex;
      }
    }
    if (themeColors.dk1) themeColors.text1 = themeColors.dk1;
    if (themeColors.lt1) themeColors.background1 = themeColors.lt1;
    if (themeColors.dk2) themeColors.text2 = themeColors.dk2;
    if (themeColors.lt2) themeColors.background2 = themeColors.lt2;

    const majorBlock = themeXml.match(/<a:majorFont>([\s\S]*?)<\/a:majorFont>/i)?.[1] || '';
    const minorBlock = themeXml.match(/<a:minorFont>([\s\S]*?)<\/a:minorFont>/i)?.[1] || '';
    majorThemeFont = majorBlock.match(/<a:latin\b[^>]*typeface="([^"]+)"/i)?.[1] || '';
    minorThemeFont = minorBlock.match(/<a:latin\b[^>]*typeface="([^"]+)"/i)?.[1] || '';
  }

  const resolveFontFromRPr = (rPrXml: string): string | undefined => {
    const rFonts = rPrXml.match(/<w:rFonts\b[^>]*>/i)?.[0];
    if (!rFonts) return undefined;
    const asciiTheme = extractAttr(rFonts, 'w:asciiTheme') || extractAttr(rFonts, 'w:hAnsiTheme');
    if (asciiTheme) {
      if (asciiTheme.startsWith('major') && majorThemeFont) return majorThemeFont;
      if (asciiTheme.startsWith('minor') && minorThemeFont) return minorThemeFont;
    }
    return extractAttr(rFonts, 'w:ascii') || extractAttr(rFonts, 'w:hAnsi') || extractAttr(rFonts, 'w:cs');
  };

  const resolveColorFromTag = (tagXml?: string): string | undefined => {
    if (!tagXml) return undefined;
    const tColor = extractAttr(tagXml, 'w:themeColor');
    if (tColor && themeColors[tColor]) {
      const baseHex = themeColors[tColor];
      return applyThemeTintShade(baseHex, extractAttr(tagXml, 'w:themeTint'), extractAttr(tagXml, 'w:themeShade'));
    }
    const val = extractAttr(tagXml, 'w:val') || extractAttr(tagXml, 'w:color');
    if (val && val !== 'auto' && val !== 'none') return normalizeHex(val);
    return undefined;
  };

  const parseAlignment = (pPrXml: string): 'left' | 'center' | 'right' | 'justify' | undefined => {
    const jc = pPrXml.match(/<w:jc\b[^>]*w:val="([^"]+)"/i)?.[1]?.toLowerCase();
    if (jc === 'center' || jc === 'right' || jc === 'left') return jc;
    if (jc === 'both' || jc === 'distribute') return 'justify';
    if (jc === 'start') return 'left';
    if (jc === 'end') return 'right';
    return undefined;
  };

  // B. Parse word/styles.xml (docDefaults + named styles + table styles)
  const docDefaults: ParsedDocxStyleBlock = {
    styleId: '__defaults__',
    name: 'Defaults',
    type: 'paragraph',
    fontFamily: minorThemeFont || undefined,
  };
  const stylesById = new Map<string, ParsedDocxStyleBlock>();
  const stylesByName = new Map<string, ParsedDocxStyleBlock>();
  const allFonts = new Set<string>();
  const detectedColors = new Set<string>();
  let tableHeaderFill: string | undefined;
  let tableHeaderText: string | undefined;
  let tableStripeFill: string | undefined;
  let tableBorderColor: string | undefined;

  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    const stylesXml = await stylesFile.async('string');

    // docDefaults
    const defBlock = stylesXml.match(/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/i)?.[1] || '';
    const defRPr = defBlock.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/i)?.[1] || '';
    const defPPr = defBlock.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/i)?.[1] || '';
    const defFont = resolveFontFromRPr(defRPr);
    if (defFont) {
      docDefaults.fontFamily = defFont;
      allFonts.add(defFont);
    }
    const defSz = defRPr.match(/<w:sz\b[^>]*w:val="(\d+)"/i)?.[1];
    if (defSz) docDefaults.fontSizePt = Number(defSz) / 2;
    const defClr = resolveColorFromTag(defRPr.match(/<w:color\b[^>]*>/i)?.[0]);
    if (defClr) docDefaults.color = defClr;
    const defSp = defPPr.match(/<w:spacing\b[^>]*>/i)?.[0];
    if (defSp) {
      const lineVal = extractAttr(defSp, 'w:line');
      const lineRule = extractAttr(defSp, 'w:lineRule') || 'auto';
      if (lineVal && lineRule === 'auto') docDefaults.lineSpacing = Number((Number(lineVal) / 240).toFixed(2));
      const afterVal = extractAttr(defSp, 'w:after');
      if (afterVal) docDefaults.spaceAfterPt = Number((Number(afterVal) / 20).toFixed(1));
    }

    // Individual <w:style> definitions
    const styleBlocks = stylesXml.match(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/gi) || [];
    for (const block of styleBlocks) {
      const headerTag = block.match(/<w:style\b([^>]*)>/i)?.[1] || '';
      const styleId = extractAttr(headerTag, 'w:styleId') || '';
      const styleType = extractAttr(headerTag, 'w:type') || 'paragraph';
      const name = block.match(/<w:name\b[^>]*w:val="([^"]+)"/i)?.[1] || styleId;
      const basedOn = block.match(/<w:basedOn\b[^>]*w:val="([^"]+)"/i)?.[1];

      const pPr = block.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/i)?.[1] || '';
      const rPr = block.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/i)?.[1] || '';

      const fontFamily = resolveFontFromRPr(rPr);
      if (fontFamily) allFonts.add(fontFamily);

      const szVal = rPr.match(/<w:sz\b[^>]*w:val="(\d+)"/i)?.[1];
      const bold = /<w:b\b(?![^>]*w:val="(?:0|false)")/i.test(rPr) ? true : /<w:b\b[^>]*w:val="(?:0|false)"/i.test(rPr) ? false : undefined;
      const italic = /<w:i\b(?![^>]*w:val="(?:0|false)")/i.test(rPr) ? true : undefined;
      const color = resolveColorFromTag(rPr.match(/<w:color\b[^>]*>/i)?.[0]);
      if (color) detectedColors.add(color);

      const spTag = pPr.match(/<w:spacing\b[^>]*>/i)?.[0];
      let lineSpacing: number | undefined;
      let spaceBeforePt: number | undefined;
      let spaceAfterPt: number | undefined;
      if (spTag) {
        const lineVal = extractAttr(spTag, 'w:line');
        const lineRule = extractAttr(spTag, 'w:lineRule') || 'auto';
        if (lineVal && lineRule === 'auto') lineSpacing = Number((Number(lineVal) / 240).toFixed(2));
        const beforeVal = extractAttr(spTag, 'w:before');
        if (beforeVal) spaceBeforePt = Number((Number(beforeVal) / 20).toFixed(1));
        const afterVal = extractAttr(spTag, 'w:after');
        if (afterVal) spaceAfterPt = Number((Number(afterVal) / 20).toFixed(1));
      }

      const leftBorderTag = pPr.match(/<w:left\b[^>]*>/i)?.[0];
      const borderLeftColor = resolveColorFromTag(leftBorderTag);
      const borderLeftSz = leftBorderTag ? extractAttr(leftBorderTag, 'w:sz') : undefined;
      const shdTag = pPr.match(/<w:shd\b[^>]*>/i)?.[0];
      const shadingFill = shdTag ? normalizeHex(extractAttr(shdTag, 'w:fill')) : undefined;
      if (shadingFill) detectedColors.add(shadingFill);

      // Table style inspection
      if (styleType === 'table') {
        const tblBorderTag = block.match(/<w:tblBorders>([\s\S]*?)<\/w:tblBorders>/i)?.[1]?.match(/<w:(?:top|insideH|left)\b[^>]*>/i)?.[0];
        if (tblBorderTag) {
          const bClr = resolveColorFromTag(tblBorderTag);
          if (bClr && !tableBorderColor) tableBorderColor = bClr;
        }
        const firstRow = block.match(/<w:tblStylePr\b[^>]*w:type="firstRow"[^>]*>([\s\S]*?)<\/w:tblStylePr>/i)?.[1];
        if (firstRow) {
          const frFill = resolveColorFromTag(firstRow.match(/<w:shd\b[^>]*>/i)?.[0]) || normalizeHex(extractAttr(firstRow.match(/<w:shd\b[^>]*>/i)?.[0] || '', 'w:fill'));
          const frText = resolveColorFromTag(firstRow.match(/<w:color\b[^>]*>/i)?.[0]);
          if (frFill && !tableHeaderFill) tableHeaderFill = frFill;
          if (frText && !tableHeaderText) tableHeaderText = frText;
        }
        const bandRow = block.match(/<w:tblStylePr\b[^>]*w:type="band1Horz"[^>]*>([\s\S]*?)<\/w:tblStylePr>/i)?.[1];
        if (bandRow) {
          const brFill = resolveColorFromTag(bandRow.match(/<w:shd\b[^>]*>/i)?.[0]) || normalizeHex(extractAttr(bandRow.match(/<w:shd\b[^>]*>/i)?.[0] || '', 'w:fill'));
          if (brFill && !tableStripeFill) tableStripeFill = brFill;
        }
      }

      const parsedBlock: ParsedDocxStyleBlock = {
        styleId,
        name,
        type: styleType,
        basedOn,
        fontFamily,
        fontSizePt: szVal ? Number(szVal) / 2 : undefined,
        bold,
        italic,
        color,
        lineSpacing,
        spaceBeforePt,
        spaceAfterPt,
        alignment: parseAlignment(pPr),
        borderLeftColor,
        borderLeftWidthPt: borderLeftSz ? Number((Number(borderLeftSz) / 8).toFixed(1)) : undefined,
        shadingFill,
      };
      if (styleId) stylesById.set(styleId.toLowerCase(), parsedBlock);
      if (name) stylesByName.set(name.toLowerCase(), parsedBlock);
    }
  }

  const resolveStyleWithChain = (lookupKey: string): ParsedDocxStyleBlock | undefined => {
    const start = stylesById.get(lookupKey.toLowerCase()) || stylesByName.get(lookupKey.toLowerCase());
    if (!start) return undefined;
    const chain: ParsedDocxStyleBlock[] = [docDefaults];
    const visited = new Set<string>();
    const walk = (blk: ParsedDocxStyleBlock, depth = 0) => {
      if (depth > 5 || visited.has(blk.styleId)) return;
      visited.add(blk.styleId);
      if (blk.basedOn) {
        const parent = stylesById.get(blk.basedOn.toLowerCase()) || stylesByName.get(blk.basedOn.toLowerCase());
        if (parent) walk(parent, depth + 1);
      }
      chain.push(blk);
    };
    walk(start);

    const merged: ParsedDocxStyleBlock = { ...start };
    for (const layer of chain) {
      if (layer.fontFamily) merged.fontFamily = layer.fontFamily;
      if (layer.fontSizePt !== undefined) merged.fontSizePt = layer.fontSizePt;
      if (layer.bold !== undefined) merged.bold = layer.bold;
      if (layer.italic !== undefined) merged.italic = layer.italic;
      if (layer.color) merged.color = layer.color;
      if (layer.lineSpacing !== undefined) merged.lineSpacing = layer.lineSpacing;
      if (layer.spaceBeforePt !== undefined) merged.spaceBeforePt = layer.spaceBeforePt;
      if (layer.spaceAfterPt !== undefined) merged.spaceAfterPt = layer.spaceAfterPt;
      if (layer.alignment) merged.alignment = layer.alignment;
      if (layer.borderLeftColor) merged.borderLeftColor = layer.borderLeftColor;
      if (layer.borderLeftWidthPt !== undefined) merged.borderLeftWidthPt = layer.borderLeftWidthPt;
      if (layer.shadingFill) merged.shadingFill = layer.shadingFill;
    }
    return merged;
  };

  // C. Parse word/document.xml (<w:sectPr>, background, direct inline run frequency, table cell fills)
  let pageSetup: SourceStyleInspectionResult['pageSetup'] = undefined;
  const runColorCounts = new Map<string, number>();
  const runFontCounts = new Map<string, number>();
  const runSizeCounts = new Map<number, number>();
  const tableCellFills: string[] = [];

  const docFile = zip.file('word/document.xml');
  if (docFile) {
    const docXml = await docFile.async('string');

    // Last sectPr governs main section setup
    const sectMatches = docXml.match(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/gi);
    const sectXml = sectMatches ? sectMatches[sectMatches.length - 1] : '';
    if (sectXml) {
      const pgSzTag = sectXml.match(/<w:pgSz\b[^>]*>/i)?.[0] || '';
      const wTwips = Number(extractAttr(pgSzTag, 'w:w') || 0);
      const hTwips = Number(extractAttr(pgSzTag, 'w:h') || 0);
      const orientAttr = extractAttr(pgSzTag, 'w:orient');
      const widthMm = wTwips > 0 ? Math.round(wTwips / 56.6929) : 210;
      const heightMm = hTwips > 0 ? Math.round(hTwips / 56.6929) : 297;
      const orientation: 'portrait' | 'landscape' =
        orientAttr === 'landscape' || widthMm > heightMm ? 'landscape' : 'portrait';

      const pgMarTag = sectXml.match(/<w:pgMar\b[^>]*>/i)?.[0] || '';
      const topMm = Math.round((Number(extractAttr(pgMarTag, 'w:top') || 1440)) / 56.6929);
      const bottomMm = Math.round((Number(extractAttr(pgMarTag, 'w:bottom') || 1440)) / 56.6929);
      const leftMm = Math.round((Number(extractAttr(pgMarTag, 'w:left') || 1440)) / 56.6929);
      const rightMm = Math.round((Number(extractAttr(pgMarTag, 'w:right') || 1440)) / 56.6929);

      const colsVal = Number(extractAttr(sectXml.match(/<w:cols\b[^>]*>/i)?.[0] || '', 'w:num') || 1);
      const bgTag = docXml.match(/<w:background\b[^>]*>/i)?.[0];
      const pageColor = bgTag ? resolveColorFromTag(bgTag) || normalizeHex(extractAttr(bgTag, 'w:color')) : '#FFFFFF';

      const pgBorders = sectXml.match(/<w:pgBorders\b[^>]*>([\s\S]*?)<\/w:pgBorders>/i)?.[1];
      const firstBorderTag = pgBorders?.match(/<w:(?:top|left|bottom|right)\b[^>]*>/i)?.[0];
      const borderColor = firstBorderTag ? resolveColorFromTag(firstBorderTag) : undefined;
      const borderWidth = firstBorderTag ? Number(extractAttr(firstBorderTag, 'w:sz') || 0) / 8 : undefined;
      const borderVal = firstBorderTag ? extractAttr(firstBorderTag, 'w:val') : undefined;

      pageSetup = {
        pageSize: classifyPageSize(widthMm, heightMm),
        dimensionsMm: { width: widthMm, height: heightMm },
        orientation,
        marginsMm: { top: topMm, bottom: bottomMm, left: leftMm, right: rightMm },
        columns: colsVal || 1,
        pageColor: pageColor || '#FFFFFF',
        pageBorder: {
          enabled: Boolean(pgBorders && borderVal && borderVal !== 'none'),
          color: borderColor,
          widthPt: borderWidth || undefined,
          style: borderVal,
        },
      };
    }

    // Inline run frequency sample (first ~250KB of document.xml for speed)
    const sampleXml = docXml.slice(0, 260000);
    for (const rPrMatch of sampleXml.matchAll(/<w:rPr>([\s\S]*?)<\/w:rPr>/gi)) {
      const rPr = rPrMatch[1];
      const f = resolveFontFromRPr(rPr);
      if (f) {
        allFonts.add(f);
        runFontCounts.set(f, (runFontCounts.get(f) || 0) + 1);
      }
      const sz = rPr.match(/<w:sz\b[^>]*w:val="(\d+)"/i)?.[1];
      if (sz) {
        const pt = Number(sz) / 2;
        runSizeCounts.set(pt, (runSizeCounts.get(pt) || 0) + 1);
      }
      const clr = resolveColorFromTag(rPr.match(/<w:color\b[^>]*>/i)?.[0]);
      if (clr) {
        detectedColors.add(clr);
        runColorCounts.set(clr, (runColorCounts.get(clr) || 0) + 1);
      }
    }

    for (const tcShdMatch of sampleXml.matchAll(/<w:tcPr>[\s\S]*?<w:shd\b([^>]*)>[\s\S]*?<\/w:tcPr>/gi)) {
      const shdFill = resolveColorFromTag(`<w:shd ${tcShdMatch[1]}>`) || normalizeHex(extractAttr(tcShdMatch[1], 'w:fill'));
      if (shdFill && shdFill !== '#FFFFFF') {
        tableCellFills.push(shdFill);
        detectedColors.add(shdFill);
      }
    }
  }

  const normal = resolveStyleWithChain('Normal') || docDefaults;
  const titleStyle = resolveStyleWithChain('Title');
  const subtitleStyle = resolveStyleWithChain('Subtitle');
  const h1 = resolveStyleWithChain('Heading1') || resolveStyleWithChain('Heading 1');
  const h2 = resolveStyleWithChain('Heading2') || resolveStyleWithChain('Heading 2');
  const h3 = resolveStyleWithChain('Heading3') || resolveStyleWithChain('Heading 3');
  const h4 = resolveStyleWithChain('Heading4') || resolveStyleWithChain('Heading 4');
  const quote = resolveStyleWithChain('Quote') || resolveStyleWithChain('Intense Quote');

  const topInlineFont = Array.from(runFontCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topInlineSize = Array.from(runSizeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  const allColorList = Array.from(new Set([
    ...detectedColors,
    ...Object.values(themeColors).filter((c) => c !== '#000000' && c !== '#FFFFFF'),
  ]));
  const chromaticColors = allColorList.filter((c) => isNearWhiteOrBlack(c) === 'chromatic');

  const toHeadingSpec = (blk?: ParsedDocxStyleBlock): HeadingStyleSpec | undefined =>
    blk
      ? {
          fontFamily: blk.fontFamily,
          fontSizePt: blk.fontSizePt,
          bold: blk.bold,
          italic: blk.italic,
          color: blk.color,
          spaceBeforePt: blk.spaceBeforePt,
          spaceAfterPt: blk.spaceAfterPt,
          alignment: blk.alignment,
        }
      : undefined;

  const result: SourceStyleInspectionResult = {
    success: true,
    sourceId,
    title,
    sourceType: 'docx',
    extractionMethod: 'exact_ooxml',
    confidence: 'high',
    pageSetup,
    typography: {
      body: {
        fontFamily: normal.fontFamily || topInlineFont || minorThemeFont || 'Calibri',
        fontSizePt: normal.fontSizePt || topInlineSize || 11,
        color: normal.color || themeColors.dk1 || '#000000',
        lineSpacing: normal.lineSpacing || 1.15,
        spaceAfterPt: normal.spaceAfterPt,
        alignment: normal.alignment || 'left',
      },
      headings: {
        title: toHeadingSpec(titleStyle),
        subtitle: toHeadingSpec(subtitleStyle),
        h1: toHeadingSpec(h1),
        h2: toHeadingSpec(h2),
        h3: toHeadingSpec(h3),
        h4: toHeadingSpec(h4),
      },
      allDetectedFonts: Array.from(allFonts),
    },
    palette: {
      primary: h1?.color || themeColors.accent1 || chromaticColors[0],
      secondary: h2?.color || themeColors.accent2 || chromaticColors[1],
      accent: themeColors.accent1 || chromaticColors[0],
      text: normal.color || themeColors.dk1 || '#111827',
      muted: themeColors.dk2 || '#6B7280',
      background: pageSetup?.pageColor || '#FFFFFF',
      tableHeaderFill: tableHeaderFill || tableCellFills[0] || themeColors.accent1,
      tableHeaderText: tableHeaderText,
      tableStripeFill: tableStripeFill || tableCellFills[1],
      quoteBorderColor: quote?.borderLeftColor || h1?.color || themeColors.accent1,
      detectedHexColors: allColorList.slice(0, 20),
    },
    components: {
      blockquote: quote
        ? {
            borderLeftColor: quote.borderLeftColor || themeColors.accent1,
            borderLeftWidthPt: quote.borderLeftWidthPt,
            backgroundColor: quote.shadingFill,
            italic: quote.italic,
            textColor: quote.color,
          }
        : undefined,
      table: {
        borderColor: tableBorderColor,
        headerFill: tableHeaderFill || tableCellFills[0],
        headerTextColor: tableHeaderText,
        alternatingRowFill: tableStripeFill || tableCellFills[1],
      },
    },
  };
  result.recommendedDociumActions = buildRecommendedActions(result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. HTML / CSS Style Inspector
// ─────────────────────────────────────────────────────────────────────────────

function parseCssRuleBlock(cssText: string, selectorRegex: RegExp): Record<string, string> {
  const props: Record<string, string> = {};
  for (const m of cssText.matchAll(/([^{}]+)\{([^}]+)\}/g)) {
    const sel = m[1].trim();
    if (!selectorRegex.test(sel)) continue;
    for (const decl of m[2].split(';')) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) continue;
      const k = decl.slice(0, colonIdx).trim().toLowerCase();
      const v = decl.slice(colonIdx + 1).trim();
      if (k && v) props[k] = v;
    }
  }
  return props;
}

function extractHtmlStyles(html: string, sourceId: string, title: string): SourceStyleInspectionResult {
  const styleBlocks = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1]).join('\n');
  const bodyProps = parseCssRuleBlock(styleBlocks, /(?:^|,|\s)(?:body|:root)(?:$|\s|,)/i);
  const h1Props = parseCssRuleBlock(styleBlocks, /\bh1\b/i);
  const h2Props = parseCssRuleBlock(styleBlocks, /\bh2\b/i);
  const h3Props = parseCssRuleBlock(styleBlocks, /\bh3\b/i);
  const bqProps = parseCssRuleBlock(styleBlocks, /\bblockquote\b/i);
  const thProps = parseCssRuleBlock(styleBlocks, /\bth\b/i);

  const hexMatches = Array.from(new Set(
    (styleBlocks + ' ' + html.slice(0, 40000).match(/style="[^"]*"/gi)?.join(' ') || '')
      .match(/#[0-9a-f]{3,6}\b/gi)
      ?.map((h) => normalizeHex(h)!)
      .filter(Boolean) || []
  ));
  const chromatic = hexMatches.filter((c) => isNearWhiteOrBlack(c) === 'chromatic');

  const parsePxOrPt = (v?: string): number | undefined => {
    if (!v) return undefined;
    const pt = v.match(/([\d.]+)\s*pt/i);
    if (pt) return Number(pt[1]);
    const px = v.match(/([\d.]+)\s*px/i);
    if (px) return Number((Number(px[1]) * 0.75).toFixed(1));
    return undefined;
  };
  const cleanFont = (v?: string) => v?.split(',')[0]?.replace(/["']/g, '').trim();

  const result: SourceStyleInspectionResult = {
    success: true,
    sourceId,
    title,
    sourceType: 'html',
    extractionMethod: 'exact_css',
    confidence: styleBlocks ? 'high' : 'medium',
    pageSetup: {
      pageColor: normalizeHex(bodyProps['background-color'] || bodyProps['background']) || '#FFFFFF',
    },
    typography: {
      body: {
        fontFamily: cleanFont(bodyProps['font-family']),
        fontSizePt: parsePxOrPt(bodyProps['font-size']),
        color: normalizeHex(bodyProps['color']),
        lineSpacing: bodyProps['line-height'] && !isNaN(Number(bodyProps['line-height'])) ? Number(bodyProps['line-height']) : undefined,
      },
      headings: {
        h1: Object.keys(h1Props).length > 0 ? { fontFamily: cleanFont(h1Props['font-family']), fontSizePt: parsePxOrPt(h1Props['font-size']), color: normalizeHex(h1Props['color']) } : undefined,
        h2: Object.keys(h2Props).length > 0 ? { fontFamily: cleanFont(h2Props['font-family']), fontSizePt: parsePxOrPt(h2Props['font-size']), color: normalizeHex(h2Props['color']) } : undefined,
        h3: Object.keys(h3Props).length > 0 ? { fontFamily: cleanFont(h3Props['font-family']), fontSizePt: parsePxOrPt(h3Props['font-size']), color: normalizeHex(h3Props['color']) } : undefined,
      },
    },
    palette: {
      primary: normalizeHex(h1Props['color']) || chromatic[0],
      accent: chromatic[1] || chromatic[0],
      text: normalizeHex(bodyProps['color']),
      background: normalizeHex(bodyProps['background-color'] || bodyProps['background']) || '#FFFFFF',
      tableHeaderFill: normalizeHex(thProps['background-color'] || thProps['background']),
      tableHeaderText: normalizeHex(thProps['color']),
      quoteBorderColor: normalizeHex(bqProps['border-left-color'] || bqProps['border-left']),
      detectedHexColors: hexMatches.slice(0, 20),
    },
    components: {
      blockquote: Object.keys(bqProps).length > 0
        ? {
            borderLeftColor: normalizeHex(bqProps['border-left-color'] || bqProps['border-left']),
            backgroundColor: normalizeHex(bqProps['background-color'] || bqProps['background']),
          }
        : undefined,
    },
  };
  result.recommendedDociumActions = buildRecommendedActions(result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sharp Dominant Palette Extractor + PDF & Image Inspectors
// ─────────────────────────────────────────────────────────────────────────────

async function extractPaletteFromImageBuffer(buffer: Buffer): Promise<{
  background?: string;
  text?: string;
  primaryAccent?: string;
  secondaryAccent?: string;
  allColors: string[];
}> {
  try {
    const sharp = (await import('sharp')).default;
    const raw = await sharp(buffer)
      .resize(72, 72, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorBuckets = new Map<string, number>();
    const data = raw.data;
    for (let i = 0; i + 2 < data.length; i += 3) {
      // Quantize RGB channels to nearest multiple of 16 for clean dominant clustering
      const r = Math.min(255, Math.round(data[i] / 16) * 16);
      const g = Math.min(255, Math.round(data[i + 1] / 16) * 16);
      const b = Math.min(255, Math.round(data[i + 2] / 16) * 16);
      const hex = rgbToHex(r, g, b);
      colorBuckets.set(hex, (colorBuckets.get(hex) || 0) + 1);
    }

    const sorted = Array.from(colorBuckets.entries()).sort((a, b) => b[1] - a[1]);
    const background = sorted[0]?.[0];
    const darkText = sorted.find(([hex]) => isNearWhiteOrBlack(hex) === 'black')?.[0];
    const chromatics = sorted.filter(([hex]) => isNearWhiteOrBlack(hex) === 'chromatic').map(([hex]) => hex);

    return {
      background,
      text: darkText,
      primaryAccent: chromatics[0],
      secondaryAccent: chromatics[1],
      allColors: sorted.slice(0, 14).map(([hex]) => hex),
    };
  } catch {
    return { allColors: [] };
  }
}

async function extractPdfStyles(
  buffer: Buffer,
  options: InspectStylesOptions
): Promise<SourceStyleInspectionResult> {
  const unpdf = await import('unpdf');
  const uint8 = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const doc = await unpdf.getDocumentProxy(uint8);

  const samplePages = (options.pages && options.pages.length > 0 ? options.pages : [1, 2])
    .filter((p) => p >= 1 && p <= doc.numPages)
    .slice(0, 3);
  if (samplePages.length === 0 && doc.numPages >= 1) samplePages.push(1);

  // A. Page Geometry & Margins from page 1
  const firstPage = await doc.getPage(samplePages[0]);
  const viewport = firstPage.getViewport({ scale: 1.0 });
  const ptToMm = 0.352778;
  const widthMm = Math.round(viewport.width * ptToMm);
  const heightMm = Math.round(viewport.height * ptToMm);
  const orientation: 'portrait' | 'landscape' = widthMm > heightMm ? 'landscape' : 'portrait';

  // B. Text Font, FontSize, & Margin Bounds
  const { items: allPageItems } = await unpdf.extractTextItems(doc);
  const fontChars = new Map<string, number>();
  const sizeChars = new Map<number, { count: number; fonts: Map<string, number>; boldCount: number }>();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let totalSampleItems = 0;

  for (const pNum of samplePages) {
    const items = allPageItems[pNum - 1] || [];
    totalSampleItems += items.length;
    for (const item of items) {
      const txt = (item.str || '').trim();
      if (!txt) continue;
      const chars = txt.length;
      const cleanedFont = cleanPdfFontName(item.fontFamily || '');
      if (cleanedFont.family) {
        fontChars.set(cleanedFont.family, (fontChars.get(cleanedFont.family) || 0) + chars);
      }

      const sz = Math.round((item.fontSize || 11) * 2) / 2;
      if (sz >= 6 && sz <= 72) {
        if (!sizeChars.has(sz)) {
          sizeChars.set(sz, { count: 0, fonts: new Map(), boldCount: 0 });
        }
        const entry = sizeChars.get(sz)!;
        entry.count += chars;
        if (cleanedFont.family) entry.fonts.set(cleanedFont.family, (entry.fonts.get(cleanedFont.family) || 0) + chars);
        if (cleanedFont.bold) entry.boldCount += chars;
      }

      if (pNum === samplePages[0]) {
        minX = Math.min(minX, item.x);
        maxX = Math.max(maxX, item.x + (item.width || 0));
        minY = Math.min(minY, item.y);
        maxY = Math.max(maxY, item.y + (item.height || item.fontSize || 0));
      }
    }
  }

  let marginsMm: { top: number; bottom: number; left: number; right: number } | undefined;
  if (minX < maxX && minY < maxY) {
    marginsMm = {
      left: Math.max(8, Math.min(50, Math.round(minX * ptToMm))),
      right: Math.max(8, Math.min(50, Math.round((viewport.width - maxX) * ptToMm))),
      bottom: Math.max(8, Math.min(50, Math.round(minY * ptToMm))),
      top: Math.max(8, Math.min(50, Math.round((viewport.height - maxY) * ptToMm))),
    };
  }

  // Modal font-size with highest total characters = body text
  const byCharVolume = Array.from(sizeChars.entries()).sort((a, b) => b[1].count - a[1].count);
  const bodySize = byCharVolume[0]?.[0] || 11;
  const bodyFont =
    (byCharVolume[0] && Array.from(byCharVolume[0][1].fonts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]) ||
    Array.from(fontChars.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  const largerSizes = Array.from(sizeChars.entries())
    .filter(([sz, stats]) => sz > bodySize + 1.5 && stats.count >= 4)
    .sort((a, b) => b[0] - a[0]);

  const toHeadingSpecFromCluster = (cluster?: [number, { count: number; fonts: Map<string, number>; boldCount: number }]): HeadingStyleSpec | undefined => {
    if (!cluster) return undefined;
    const [sz, stats] = cluster;
    const domFont = Array.from(stats.fonts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      fontFamily: domFont || bodyFont,
      fontSizePt: sz,
      bold: stats.boldCount > stats.count * 0.4,
    };
  };

  // C. PDF Operator Color Stream Inspection (RGB / CMYK / Gray)
  const opColors = new Map<string, number>();
  try {
    const pdfjs = await unpdf.getResolvedPDFJS();
    const ops = pdfjs.OPS as unknown as Record<string, number>;
    for (const pNum of samplePages.slice(0, 2)) {
      const p = await doc.getPage(pNum);
      const opList = await p.getOperatorList();
      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];
        if (!args) continue;
        if (fn === ops.setFillRGBColor || fn === ops.setStrokeRGBColor) {
          let hex: string | undefined;
          const first = (args as unknown[])[0];
          if (typeof first === 'string') {
            hex = normalizeHex(first);
          } else if (first && typeof first === 'object' && 'length' in (first as any) && (first as any).length >= 3) {
            const arr = first as ArrayLike<number>;
            hex =
              arr[0] <= 1 && arr[1] <= 1 && arr[2] <= 1
                ? rgbToHex(arr[0] * 255, arr[1] * 255, arr[2] * 255)
                : rgbToHex(arr[0], arr[1], arr[2]);
          } else if (args.length >= 3) {
            hex =
              args[0] <= 1 && args[1] <= 1 && args[2] <= 1
                ? rgbToHex(args[0] * 255, args[1] * 255, args[2] * 255)
                : rgbToHex(Number(args[0]), Number(args[1]), Number(args[2]));
          }
          if (hex) opColors.set(hex, (opColors.get(hex) || 0) + 1);
        } else if (fn === ops.setFillCMYKColor && args.length >= 4) {
          const [c, m, y, k] = args.map(Number);
          const hex = rgbToHex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));
          opColors.set(hex, (opColors.get(hex) || 0) + 1);
        }
      }
      p.cleanup?.();
    }
  } catch {
    // fallback safely to sharp raster sampling below
  }

  // D. Visual raster palette sampling from page 1 (essential for scanned PDFs / backgrounds / banners)
  const rendered = await renderPdfPageToImage(buffer, samplePages[0], { format: 'jpeg', width: 700, scale: 1.0 });
  const visualPalette = rendered.success ? await extractPaletteFromImageBuffer(rendered.buffer) : { allColors: [] };

  const sortedOpColors = Array.from(opColors.entries()).sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const combinedColors = Array.from(new Set([...sortedOpColors, ...visualPalette.allColors]));
  const chromatic = combinedColors.filter((c) => isNearWhiteOrBlack(c) === 'chromatic');
  const darkText = combinedColors.find((c) => isNearWhiteOrBlack(c) === 'black') || '#111827';

  const result: SourceStyleInspectionResult = {
    success: true,
    sourceId: options.sourceId,
    title: options.sourceTitle || options.sourceId,
    sourceType: 'pdf',
    extractionMethod: totalSampleItems < 15 || chromatic.length > 0 ? 'pdf_visual_plus_objects' : 'pdf_objects',
    confidence: totalSampleItems >= 20 ? 'high' : 'medium',
    pageSetup: {
      pageSize: classifyPageSize(widthMm, heightMm),
      dimensionsMm: { width: widthMm, height: heightMm },
      orientation,
      marginsMm,
      pageColor: visualPalette.background || '#FFFFFF',
    },
    typography: {
      body: {
        fontFamily: bodyFont,
        fontSizePt: totalSampleItems > 0 ? bodySize : undefined,
        color: darkText,
      },
      headings: {
        h1: toHeadingSpecFromCluster(largerSizes[0]),
        h2: toHeadingSpecFromCluster(largerSizes[1]),
        h3: toHeadingSpecFromCluster(largerSizes[2]),
      },
      allDetectedFonts: Array.from(fontChars.keys()),
    },
    palette: {
      primary: chromatic[0] || darkText,
      secondary: chromatic[1],
      accent: chromatic[0],
      text: darkText,
      background: visualPalette.background || '#FFFFFF',
      detectedHexColors: combinedColors.slice(0, 18),
    },
  };

  // Optional VLM layout/style observation when scanned / sparse PDF & vision auth exists
  if (
    totalSampleItems < 20 &&
    rendered.success &&
    options.visionAuth?.providerId &&
    options.visionAuth.apiKey &&
    isVisionCapableModel(options.visionAuth.modelId || '', options.visionAuth.providerId)
  ) {
    const vis = await executeVisionInspection(
      [
        {
          sourceId: `${options.sourceId}:style-p1`,
          filename: `${result.title} (Page ${samplePages[0]})`,
          mimeType: rendered.mimeType,
          dataUrl: rendered.dataUrl,
          byteLength: rendered.byteLength,
        },
      ],
      'Describe only the document visual design & layout tokens: font style category (serif/sans/mono), heading color, background tint, header/footer band style, callout/table borders, and alignment.',
      {
        providerId: options.visionAuth.providerId,
        modelId: options.visionAuth.modelId!,
        apiKey: options.visionAuth.apiKey,
        baseUrl: options.visionAuth.baseUrl,
        accountId: options.visionAuth.accountId,
        workspaceId: options.workspaceId,
      }
    );
    if (vis.success && vis.analysis) {
      result.visualNotes = vis.analysis.visualDescription || vis.analysis.extractedText.slice(0, 600);
    }
  }

  result.recommendedDociumActions = buildRecommendedActions(result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export async function inspectSourceStyles(options: InspectStylesOptions): Promise<SourceStyleInspectionResult> {
  const stored =
    getOriginalFile(options.workspaceId, options.sourceId) ||
    (options.sourceTitle ? getOriginalFile(options.workspaceId, options.sourceTitle) : null);

  if (!stored || !stored.buffer || stored.buffer.length === 0) {
    return {
      success: false,
      sourceId: options.sourceId,
      title: options.sourceTitle || options.sourceId,
      sourceType: 'unknown',
      extractionMethod: 'fallback',
      confidence: 'low',
      error: `Original binary file for "${options.sourceTitle || options.sourceId}" was not found in workspace storage. Re-upload the file to inspect its exact styles.`,
    };
  }

  const filename = stored.filename || options.sourceTitle || options.sourceId;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mime = (stored.mimeType || options.mimeType || '').toLowerCase();

  // 1. DOCX
  if (
    ext === 'docx' ||
    mime.includes('wordprocessingml') ||
    (stored.buffer.length >= 4 && stored.buffer[0] === 0x50 && stored.buffer[1] === 0x4b && ext !== 'xlsx' && ext !== 'pptx')
  ) {
    try {
      return await extractDocxStyles(stored.buffer, stored.sourceId, filename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        sourceId: stored.sourceId,
        title: filename,
        sourceType: 'docx',
        extractionMethod: 'fallback',
        confidence: 'low',
        error: `DOCX style extraction failed: ${msg}`,
      };
    }
  }

  // 2. PDF
  if (ext === 'pdf' || mime === 'application/pdf' || isPdfBuffer(stored.buffer)) {
    try {
      return await extractPdfStyles(stored.buffer, { ...options, sourceId: stored.sourceId, sourceTitle: filename });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        sourceId: stored.sourceId,
        title: filename,
        sourceType: 'pdf',
        extractionMethod: 'fallback',
        confidence: 'low',
        error: `PDF style extraction failed: ${msg}`,
      };
    }
  }

  // 3. HTML / HTM
  if (ext === 'html' || ext === 'htm' || mime.includes('text/html')) {
    const html = stored.buffer.toString('utf-8');
    return extractHtmlStyles(html, stored.sourceId, filename);
  }

  // 4. Images (PNG, JPG, WEBP, GIF)
  if (mime.startsWith('image/') || /^(png|jpe?g|webp|gif)$/i.test(ext)) {
    const palette = await extractPaletteFromImageBuffer(stored.buffer);
    const res: SourceStyleInspectionResult = {
      success: true,
      sourceId: stored.sourceId,
      title: filename,
      sourceType: 'image',
      extractionMethod: 'visual_palette',
      confidence: 'medium',
      palette: {
        primary: palette.primaryAccent || palette.text,
        secondary: palette.secondaryAccent,
        accent: palette.primaryAccent,
        text: palette.text,
        background: palette.background || '#FFFFFF',
        detectedHexColors: palette.allColors,
      },
    };

    if (
      options.visionAuth?.providerId &&
      options.visionAuth.apiKey &&
      isVisionCapableModel(options.visionAuth.modelId || '', options.visionAuth.providerId)
    ) {
      const opt = await optimizeImageBufferForVision(stored.buffer, mime || 'image/jpeg', {
        maxDimension: 1280,
        maxBytes: 700 * 1024,
      });
      const vis = await executeVisionInspection(
        [
          {
            sourceId: stored.sourceId,
            filename,
            mimeType: opt.mimeType,
            dataUrl: `data:${opt.mimeType};base64,${opt.buffer.toString('base64')}`,
            byteLength: opt.buffer.length,
          },
        ],
        'Analyze this document/design image strictly for styling & layout tokens: typography category (serif/sans-serif/mono), approximate heading vs body sizing, header/footer style, table/callout borders, alignment, and whitespace.',
        {
          providerId: options.visionAuth.providerId,
          modelId: options.visionAuth.modelId!,
          apiKey: options.visionAuth.apiKey,
          baseUrl: options.visionAuth.baseUrl,
          accountId: options.visionAuth.accountId,
          workspaceId: options.workspaceId,
        }
      );
      if (vis.success && vis.analysis) {
        res.visualNotes = vis.analysis.visualDescription || vis.analysis.extractedText.slice(0, 700);
      }
    }
    return res;
  }

  return {
    success: false,
    sourceId: stored.sourceId,
    title: filename,
    sourceType: 'unknown',
    extractionMethod: 'fallback',
    confidence: 'low',
    error: `File format ".${ext || 'unknown'}" does not carry rich styling metadata (supported: .docx, .pdf, .html, images).`,
  };
}

