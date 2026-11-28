import {
  DocumentPageSize,
  DocumentOrientation,
  DocumentMargins,
  MarginPreset,
} from '@/lib/types';
import { getResolvedMargins, PAPER_SIZES_MM } from './pageMetrics';
import { formatMathExpression } from '../extensions/EquationNode';
import { fetchTrueTypeFontBytes, isTrueTypeBytesBold, normalizeExportFontName, uint8ArrayToBase64 } from './fontLoader';
import { ensureGoogleFontLoaded } from '@/lib/editor/fontCatalog';
import type { jsPDF as JsPdfType } from 'jspdf';

export interface PdfExportOptions {
  jsonContent?: Record<string, any>;
  htmlContent?: string;
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins | MarginPreset;
  columns?: 1 | 2 | 3;
  headerText?: string;
  footerText?: string;
  headerAlign?: 'left' | 'center' | 'right';
  footerAlign?: 'left' | 'center' | 'right';
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  showHeaderLine?: boolean;
  showFooterLine?: boolean;
  showPageNumbers?: boolean;
  pageNumberPosition?: 'bottom-center' | 'bottom-right' | 'top-right';
  differentFirstPage?: boolean;
  watermarkText?: string;
  pageColor?: string;
  pageBorder?: 'none' | 'box' | 'shadow' | 'double' | 'accent';
  pageBorderColor?: string;
  pageBorderWidth?: number;
  pageBorderOffset?: 'edge' | 'margin' | 'wide';
}

type RgbTuple = [number, number, number];
type FontFamilyKey = 'helvetica' | 'times' | 'courier';
type FontStyleKey = 'normal' | 'bold' | 'italic' | 'bolditalic';

interface TextSpan {
  text: string;
  font: FontFamilyKey;
  rawFontName?: string;
  style: FontStyleKey;
  sizePt: number;
  color: RgbTuple;
  bg?: RgbTuple;
  underline?: boolean;
  strike?: boolean;
  href?: string;
  scriptOffsetMm?: number;
}

const PT_TO_MM = 0.352778;
const PX_TO_MM = 25.4 / 96;

const NAMED_COLORS: Record<string, RgbTuple> = {
  black: [23, 28, 25],
  white: [255, 255, 255],
  red: [220, 38, 38],
  darkred: [153, 27, 27],
  green: [22, 163, 74],
  darkgreen: [21, 128, 61],
  blue: [37, 99, 235],
  navy: [30, 58, 138],
  gray: [107, 114, 128],
  grey: [107, 114, 128],
  yellow: [254, 240, 138],
  amber: [245, 158, 11],
  orange: [234, 88, 12],
  purple: [124, 58, 237],
  teal: [13, 148, 136],
  transparent: [255, 255, 255],
};

function parseColor(raw?: string | null, fallback: RgbTuple = [23, 28, 25]): RgbTuple {
  if (!raw) return fallback;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'none' || s === 'inherit' || s === 'transparent') return fallback;
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
    } else if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
    }
  }

  const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [
      Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10))),
      Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10))),
      Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10))),
    ];
  }
  return fallback;
}

function mapFontFamily(raw?: string | null): FontFamilyKey {
  if (!raw) return 'helvetica';
  const candidates = raw
    .split(',')
    .map((p) => p.replace(/['"]/g, '').trim().toLowerCase())
    .filter((p) => p && p !== 'inherit');
  for (const f of candidates) {
    if (
      f.includes('courier') ||
      f.includes('mono') ||
      f.includes('consolas') ||
      f.includes('fira') ||
      f.includes('jetbrains')
    ) {
      return 'courier';
    }
    if (
      f === 'serif' ||
      f.includes('times') ||
      f.includes('georgia') ||
      f.includes('cambria') ||
      f.includes('garamond') ||
      f.includes('palatino') ||
      f.includes('playfair') ||
      f.includes('merriweather') ||
      f.includes('baskerville') ||
      f.includes('lora') ||
      f.includes('book ') ||
      f.includes('didot') ||
      f.includes('bodoni') ||
      f.includes('perpetua') ||
      f.includes('century')
    ) {
      return 'times';
    }
    if (
      f === 'sans-serif' ||
      f === 'system-ui' ||
      f === 'ui-sans-serif' ||
      f.includes('calibri') ||
      f.includes('aptos') ||
      f.includes('arial') ||
      f.includes('helvetica') ||
      f.includes('inter') ||
      f.includes('roboto') ||
      f.includes('segoe') ||
      f.includes('verdana') ||
      f.includes('tahoma') ||
      f.includes('poppins') ||
      f.includes('lato') ||
      f.includes('open sans')
    ) {
      return 'helvetica';
    }
  }
  return 'helvetica';
}

function parseFontSizePt(raw?: string | number | null, fallbackPt: number = 11): number {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.max(6, Math.min(72, raw));
  if (typeof raw === 'string') {
    const m = raw.match(/([\d.]+)\s*(pt|px)?/i);
    if (m) {
      const val = parseFloat(m[1]);
      if (!Number.isNaN(val)) {
        return m[2]?.toLowerCase() === 'px' ? Math.round((val * 0.75) * 10) / 10 : val;
      }
    }
  }
  return fallbackPt;
}

function getFontStyle(bold: boolean, italic: boolean): FontStyleKey {
  if (bold && italic) return 'bolditalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

function collectSpansFromNodes(
  nodes: any[] | undefined,
  defaults: {
    sizePt: number;
    color: RgbTuple;
    bold?: boolean;
    italic?: boolean;
    font?: FontFamilyKey;
  }
): TextSpan[] {
  const spans: TextSpan[] = [];
  if (!Array.isArray(nodes)) return spans;

  for (const child of nodes) {
    if (!child) continue;
    if (child.type === 'hardBreak') {
      spans.push({
        text: '\n',
        font: defaults.font || 'helvetica',
        style: getFontStyle(Boolean(defaults.bold), Boolean(defaults.italic)),
        sizePt: defaults.sizePt,
        color: defaults.color,
      });
      continue;
    }

    if (child.type === 'inlineEquation' || child.type === 'equationNode') {
      const expr = formatMathExpression(String(child.attrs?.latex || ''));
      if (expr) {
        spans.push({
          text: expr,
          font: 'times',
          style: 'italic',
          sizePt: defaults.sizePt,
          color: defaults.color,
        });
      }
      continue;
    }

    if (child.type === 'text' && typeof child.text === 'string') {
      let bold = Boolean(defaults.bold);
      let italic = Boolean(defaults.italic);
      let underline = false;
      let strike = false;
      let font: FontFamilyKey = defaults.font || 'helvetica';
      let rawFontName: string | undefined;
      let sizePt = defaults.sizePt;
      let color = defaults.color;
      let bg: RgbTuple | undefined;
      let href: string | undefined;
      let scriptOffsetMm = 0;

      const marks = Array.isArray(child.marks) ? child.marks : [];
      for (const m of marks) {
        const mt = m?.type;
        const attrs = m?.attrs || {};
        if (mt === 'bold') bold = true;
        else if (mt === 'italic') italic = true;
        else if (mt === 'underline') underline = true;
        else if (mt === 'strike') strike = true;
        else if (mt === 'code') {
          font = 'courier';
          rawFontName = 'Consolas';
          sizePt = Math.max(8.5, sizePt - 1);
          bg = [241, 245, 249];
        } else if (mt === 'link' && attrs.href) {
          href = String(attrs.href);
          color = [36, 92, 69];
          underline = true;
        } else if (mt === 'highlight' && attrs.color) {
          bg = parseColor(String(attrs.color), [254, 240, 138]);
        } else if (mt === 'subscript') {
          sizePt = Math.max(7, sizePt * 0.72);
          scriptOffsetMm = 1.1;
        } else if (mt === 'superscript') {
          sizePt = Math.max(7, sizePt * 0.72);
          scriptOffsetMm = -1.3;
        } else if (mt === 'textStyle') {
          if (attrs.color) color = parseColor(String(attrs.color), color);
          if (attrs.fontFamily) {
            font = mapFontFamily(String(attrs.fontFamily));
            rawFontName = normalizeExportFontName(String(attrs.fontFamily));
          }
          if (attrs.fontSize) sizePt = parseFontSizePt(attrs.fontSize, sizePt);
        } else if (mt === 'fontSize' && attrs.size) {
          sizePt = parseFontSizePt(attrs.size, sizePt);
        } else if (mt === 'fontFamily' && attrs.font) {
          font = mapFontFamily(String(attrs.font));
          rawFontName = normalizeExportFontName(String(attrs.font));
        }
      }

      spans.push({
        text: child.text,
        font,
        rawFontName,
        style: getFontStyle(bold, italic),
        sizePt,
        color,
        bg,
        underline,
        strike,
        href,
        scriptOffsetMm: scriptOffsetMm || undefined,
      });
    } else if (Array.isArray(child.content)) {
      spans.push(...collectSpansFromNodes(child.content, defaults));
    }
  }

  return spans;
}

interface WrappedToken {
  text: string;
  span: TextSpan;
  widthMm: number;
}

interface WrappedLine {
  tokens: WrappedToken[];
  widthMm: number;
  maxSizePt: number;
  endsWithHardBreak?: boolean;
}

function wrapSpansToLines(pdf: JsPdfType, spans: TextSpan[], maxWidthMm: number): WrappedLine[] {
  const safeMaxW = Math.max(20, maxWidthMm);
  const lines: WrappedLine[] = [];
  let curTokens: WrappedToken[] = [];
  let curWidth = 0;
  let curMaxPt = spans[0]?.sizePt || 11;

  const pushLine = (hardBreak = false) => {
    // Trim trailing spaces at end of soft-wrapped lines
    while (curTokens.length > 0 && curTokens[curTokens.length - 1].text === ' ' && !hardBreak) {
      const pop = curTokens.pop()!;
      curWidth = Math.max(0, curWidth - pop.widthMm);
    }
    lines.push({
      tokens: curTokens,
      widthMm: curWidth,
      maxSizePt: curMaxPt,
      endsWithHardBreak: hardBreak,
    });
    curTokens = [];
    curWidth = 0;
    curMaxPt = 11;
  };

  for (const span of spans) {
    pdf.setFont(span.font, span.style);
    pdf.setFontSize(span.sizePt);

    const paragraphs = span.text.split('\n');
    paragraphs.forEach((part, pIdx) => {
      if (pIdx > 0) {
        pushLine(true);
      }
      if (!part) return;

      // Tokenize preserving spaces cleanly
      const rawTokens = part.match(/\S+|\s+/g) || [];
      for (const tok of rawTokens) {
        const w = pdf.getTextWidth(tok);
        if (curTokens.length === 0 && /^\s+$/.test(tok)) {
          // Skip leading whitespace on newly wrapped line
          continue;
        }
        if (curWidth + w > safeMaxW && curTokens.length > 0) {
          pushLine(false);
          if (/^\s+$/.test(tok)) continue;
        }
        if (w > safeMaxW && !/^\s+$/.test(tok)) {
          // Split long unbroken word cleanly character by character
          let buf = '';
          for (const ch of tok) {
            const nextW = pdf.getTextWidth(buf + ch);
            if (curWidth + nextW > safeMaxW && (buf.length > 0 || curTokens.length > 0)) {
              if (buf) {
                const bw = pdf.getTextWidth(buf);
                curTokens.push({ text: buf, span, widthMm: bw });
                curWidth += bw;
                curMaxPt = Math.max(curMaxPt, span.sizePt);
              }
              pushLine(false);
              buf = ch;
            } else {
              buf += ch;
            }
          }
          if (buf) {
            const bw = pdf.getTextWidth(buf);
            curTokens.push({ text: buf, span, widthMm: bw });
            curWidth += bw;
            curMaxPt = Math.max(curMaxPt, span.sizePt);
          }
        } else {
          curTokens.push({ text: tok, span, widthMm: w });
          curWidth += w;
          curMaxPt = Math.max(curMaxPt, span.sizePt);
        }
      }
    });
  }

  pushLine(true);
  return lines;
}

async function loadImageForPdf(
  src: string
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG'; width: number; height: number } | null> {
  if (!src) return null;
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width || 400;
          const h = img.naturalHeight || img.height || 260;
          if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
            resolve({ dataUrl: src, format: 'JPEG', width: w, height: h });
            return;
          }
          if (src.startsWith('data:image/png')) {
            resolve({ dataUrl: src, format: 'PNG', width: w, height: h });
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            format: 'PNG',
            width: w,
            height: h,
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  } catch {
    return null;
  }
}

function htmlFallbackToJson(html: string): Record<string, any> {
  if (typeof window === 'undefined' || !html) {
    return { type: 'doc', content: [] };
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: any[] = [];

  const toTextNodes = (el: Node, activeMarks: any[] = []): any[] => {
    const out: any[] = [];
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) {
          out.push({ type: 'text', text: child.textContent, ...(activeMarks.length ? { marks: activeMarks } : {}) });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (tag === 'br') {
          out.push({ type: 'hardBreak' });
          return;
        }
        const nextMarks = [...activeMarks];
        if (tag === 'strong' || tag === 'b') nextMarks.push({ type: 'bold' });
        else if (tag === 'em' || tag === 'i') nextMarks.push({ type: 'italic' });
        else if (tag === 'u') nextMarks.push({ type: 'underline' });
        else if (tag === 's' || tag === 'del') nextMarks.push({ type: 'strike' });
        else if (tag === 'code') nextMarks.push({ type: 'code' });
        else if (tag === 'a') nextMarks.push({ type: 'link', attrs: { href: (child as HTMLAnchorElement).getAttribute('href') || '' } });
        out.push(...toTextNodes(child, nextMarks));
      }
    });
    return out;
  };

  Array.from(doc.body.children).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: 'heading', attrs: { level: Number(tag[1]) }, content: toTextNodes(el) });
    } else if (tag === 'hr') {
      blocks.push({ type: 'horizontalRule' });
    } else if (tag === 'pre') {
      blocks.push({ type: 'codeBlock', content: [{ type: 'text', text: el.textContent || '' }] });
    } else if (tag === 'ul' || tag === 'ol') {
      blocks.push({
        type: tag === 'ul' ? 'bulletList' : 'orderedList',
        content: Array.from(el.children).map((li) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: toTextNodes(li) }],
        })),
      });
    } else if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) => ({
        type: 'tableRow',
        content: Array.from(tr.children).map((cell) => ({
          type: cell.tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell',
          content: [{ type: 'paragraph', content: toTextNodes(cell) }],
        })),
      }));
      blocks.push({ type: 'table', content: rows });
    } else if (tag === 'img') {
      blocks.push({ type: 'image', attrs: { src: el.getAttribute('src') || '' } });
    } else {
      blocks.push({ type: 'paragraph', content: toTextNodes(el) });
    }
  });

  return { type: 'doc', content: blocks };
}

function mergeSplitTables(nodes: any[]): any[] {
  const merged: any[] = [];
  for (const n of nodes) {
    if (!n) continue;
    const prev = merged[merged.length - 1];
    if (
      n.type === 'table' &&
      n.attrs?.isContinuation &&
      prev &&
      prev.type === 'table' &&
      Array.isArray(prev.content) &&
      Array.isArray(n.content)
    ) {
      merged[merged.length - 1] = {
        ...prev,
        content: [...prev.content, ...n.content],
      };
    } else {
      merged.push(n);
    }
  }
  return merged;
}

function resolvePageTokens(rawText: string, pageNum: number, totalPages: number): string {
  if (!rawText) return '';
  return rawText
    .replace(/\{page\}/gi, pageNum.toString())
    .replace(/\{pages\}/gi, totalPages.toString());
}

/**
 * High-speed native vector PDF exporter.
 * Renders real selectable vector text, links, highlights, tables, lists, headings,
 * page borders, headers/footers (including Different First Page), watermarks, and
 * embeds raster images/diagrams cleanly without full-page DOM screenshot lag.
 */
export async function buildVectorPdf(
  title: string,
  options?: PdfExportOptions
): Promise<{ pdf: JsPdfType; filename: string }> {
  const orientation = options?.orientation || 'portrait';
  const pageSize = options?.pageSize || 'A4';
  const safeTitle = (title || 'Untitled_Document').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '_') || 'Untitled_Document';

  const sizeSpec = PAPER_SIZES_MM[pageSize as keyof typeof PAPER_SIZES_MM] || PAPER_SIZES_MM.A4;
  const pdfWidthMm = orientation === 'portrait' ? Math.min(sizeSpec.width, sizeSpec.height) : Math.max(sizeSpec.width, sizeSpec.height);
  const pdfHeightMm = orientation === 'portrait' ? Math.max(sizeSpec.width, sizeSpec.height) : Math.min(sizeSpec.width, sizeSpec.height);
  const margins = getResolvedMargins(options?.margins);
  const columns = options?.columns || 1;
  const pageColor = (options?.pageColor || '#ffffff').trim();
  const pageBgRgb = parseColor(pageColor, [255, 255, 255]);
  const isNonWhiteBg = pageColor.toLowerCase() !== '#ffffff' && pageColor.toLowerCase() !== '#fff';

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pdfWidthMm, pdfHeightMm],
    compress: true,
  });

  const paintPageBg = () => {
    if (isNonWhiteBg) {
      pdf.setFillColor(pageBgRgb[0], pageBgRgb[1], pageBgRgb[2]);
      pdf.rect(0, 0, pdfWidthMm, pdfHeightMm, 'F');
    }
  };
  paintPageBg();

  const headerReserveMm = Math.max(margins.top, 11);
  const footerReserveMm = Math.max(margins.bottom, 11);
  const contentTopMm = headerReserveMm;
  const contentBottomMm = pdfHeightMm - footerReserveMm;
  const printableTotalWidthMm = Math.max(40, pdfWidthMm - margins.left - margins.right);
  const colGapMm = columns > 1 ? 7.4 : 0;
  const colWidthMm = (printableTotalWidthMm - colGapMm * (columns - 1)) / columns;

  let currentCol = 0;
  let cursorY = contentTopMm;

  const getColX = (col = currentCol) => margins.left + col * (colWidthMm + colGapMm);
  let resolveFallbackFont: FontResolverFn = (rawFont, bold, italic) => ({
    fontName: mapFontFamily(rawFont),
    style: getFontStyle(bold, italic),
  });

  const advancePageOrColumn = () => {
    if (currentCol < columns - 1) {
      currentCol += 1;
      cursorY = contentTopMm;
    } else {
      pdf.addPage([pdfWidthMm, pdfHeightMm], orientation);
      paintPageBg();
      currentCol = 0;
      cursorY = contentTopMm;
    }
  };

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > contentBottomMm && cursorY > contentTopMm + 1) {
      advancePageOrColumn();
    }
  };

  const renderLines = (
    lines: WrappedLine[],
    opts: {
      x: number;
      widthMm: number;
      align?: 'left' | 'center' | 'right' | 'justify';
      lineHeightFactor?: number;
    }
  ) => {
    const lhFactor = opts.lineHeightFactor || 1.35;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lineHeightMm = Math.max(4.4, line.maxSizePt * PT_TO_MM * lhFactor);
      const baselineOffsetMm = line.maxSizePt * PT_TO_MM * 0.85;
      ensureSpace(lineHeightMm);

      let drawX = opts.x;
      if (opts.align === 'center') {
        drawX = opts.x + Math.max(0, (opts.widthMm - line.widthMm) / 2);
      } else if (opts.align === 'right') {
        drawX = opts.x + Math.max(0, opts.widthMm - line.widthMm);
      }

      const baselineY = cursorY + baselineOffsetMm;

      // Justify extra gap calculation for non-last soft-wrapped lines
      let extraSpaceGapMm = 0;
      const spaceCount = line.tokens.filter((t) => /^\s+$/.test(t.text)).length;
      if (opts.align === 'justify' && !line.endsWithHardBreak && spaceCount > 0 && line.widthMm < opts.widthMm * 0.96) {
        extraSpaceGapMm = Math.min(4, (opts.widthMm - line.widthMm) / spaceCount);
      }

      let runX = drawX;
      for (const tok of line.tokens) {
        const { span, widthMm } = tok;
        const isSpace = /^\s+$/.test(tok.text);

        if (span.bg && !isSpace) {
          pdf.setFillColor(span.bg[0], span.bg[1], span.bg[2]);
          const rectH = Math.max(3.6, span.sizePt * PT_TO_MM * 1.15);
          pdf.rect(runX, baselineY - span.sizePt * PT_TO_MM * 0.85, widthMm, rectH, 'F');
        }

        const activeFont = span.rawFontName ? resolveFallbackFont(span.rawFontName, span.style.includes('bold'), span.style.includes('italic')) : { fontName: span.font, style: span.style };
        pdf.setFont(activeFont.fontName, activeFont.style);
        pdf.setFontSize(span.sizePt);
        pdf.setTextColor(span.color[0], span.color[1], span.color[2]);

        const drawY = baselineY + (span.scriptOffsetMm || 0);
        if (!isSpace) {
          const textForPdf = toWinAnsiOrRenderSafe(tok.text);
          if (span.href) {
            pdf.textWithLink(textForPdf, runX, drawY, { url: span.href });
          } else {
            pdf.text(textForPdf, runX, drawY);
          }

          if (span.underline) {
            pdf.setDrawColor(span.color[0], span.color[1], span.color[2]);
            pdf.setLineWidth(0.2);
            pdf.line(runX, drawY + 0.65, runX + widthMm, drawY + 0.65);
          }
          if (span.strike) {
            pdf.setDrawColor(span.color[0], span.color[1], span.color[2]);
            pdf.setLineWidth(0.2);
            const strikeY = drawY - span.sizePt * PT_TO_MM * 0.3;
            pdf.line(runX, strikeY, runX + widthMm, strikeY);
          }
        }

        runX += widthMm + (isSpace ? extraSpaceGapMm : 0);
      }

      cursorY += lineHeightMm;
    }
  };

  const renderNode = async (node: any, listDepth = 0, listOrderedStart = 1): Promise<void> => {
    if (!node || !node.type) return;
    const baseX = getColX();

    if (node.type === 'pageBreak' || node.type === 'sectionBreak') {
      advancePageOrColumn();
      return;
    }

    if (node.type === 'horizontalRule') {
      ensureSpace(4);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.35);
      pdf.line(baseX, cursorY + 2, baseX + colWidthMm, cursorY + 2);
      cursorY += 4.5;
      return;
    }

    if (node.type === 'heading') {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level || 1)));
      const levelPt = [20, 15, 12.5, 11, 10.5, 10][level - 1] || 12;
      const defaultColor: RgbTuple = level <= 2 ? [36, 92, 69] : [23, 28, 25];
      const spans = collectSpansFromNodes(node.content, {
        sizePt: levelPt,
        color: defaultColor,
        bold: true,
      });
      const lines = wrapSpansToLines(pdf, spans.length ? spans : [{ text: ' ', font: 'helvetica', style: 'bold', sizePt: levelPt, color: defaultColor }], colWidthMm);
      const totalH = lines.length * Math.max(5.5, levelPt * PT_TO_MM * 1.32);
      ensureSpace(Math.min(contentBottomMm - contentTopMm - 2, totalH + 6));
      if (cursorY > contentTopMm + 0.5) cursorY += level === 1 ? 3 : 2;
      renderLines(lines, {
        x: baseX,
        widthMm: colWidthMm,
        align: node.attrs?.textAlign || 'left',
        lineHeightFactor: 1.28,
      });
      cursorY += level === 1 ? 2.2 : 1.4;
      return;
    }

    if (node.type === 'paragraph') {
      const indentLevel = Number(node.attrs?.indent || 0);
      const indentMm = Math.max(0, indentLevel) * 7.5 + listDepth * 5.5;
      const widthMm = Math.max(20, colWidthMm - indentMm);
      const lh = Math.max(1.15, parseFloat(String(node.attrs?.lineHeight || '1.35')) || 1.35);
      const spans = collectSpansFromNodes(node.content, {
        sizePt: 11,
        color: [23, 28, 25],
      });
      if (spans.length === 0) {
        cursorY += 3.5;
        return;
      }
      const lines = wrapSpansToLines(pdf, spans, widthMm);
      renderLines(lines, {
        x: baseX + indentMm,
        widthMm,
        align: node.attrs?.textAlign || 'left',
        lineHeightFactor: Math.min(2.2, Math.max(1.15, lh * 1.12)),
      });
      cursorY += 1.6;
      return;
    }

    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      const items = Array.isArray(node.content) ? node.content : [];
      const startNum = Number(node.attrs?.start || listOrderedStart || 1);
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const marker =
          node.type === 'bulletList'
            ? listDepth % 2 === 0
              ? '•'
              : '◦'
            : node.type === 'orderedList'
            ? `${startNum + idx}.`
            : item.attrs?.checked
            ? '[x]'
            : '[ ]';

        const markerIndentMm = (listDepth + 1) * 5.5;
        const itemChildren = Array.isArray(item?.content) ? item.content : [];
        let markerDrawn = false;

        for (const childBlock of itemChildren) {
          if (childBlock.type === 'paragraph') {
            const widthMm = Math.max(20, colWidthMm - markerIndentMm - 3.5);
            const spans = collectSpansFromNodes(childBlock.content, { sizePt: 11, color: [23, 28, 25] });
            const lines = wrapSpansToLines(pdf, spans.length ? spans : [{ text: '', font: 'helvetica', style: 'normal', sizePt: 11, color: [23, 28, 25] }], widthMm);
            if (!markerDrawn && lines.length > 0) {
              const firstLineH = Math.max(4.5, lines[0].maxSizePt * PT_TO_MM * 1.35);
              ensureSpace(firstLineH);
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(10.5);
              pdf.setTextColor(36, 92, 69);
              pdf.text(marker, baseX + listDepth * 5.5, cursorY + firstLineH * 0.65);
              markerDrawn = true;
            }
            renderLines(lines, {
              x: baseX + markerIndentMm,
              widthMm,
              align: childBlock.attrs?.textAlign || 'left',
              lineHeightFactor: 1.32,
            });
            cursorY += 0.9;
          } else {
            await renderNode(childBlock, listDepth + 1, 1);
          }
        }
      }
      cursorY += 1.4;
      return;
    }

    if (node.type === 'blockquote' || node.type === 'callout') {
      const innerBlocks = Array.isArray(node.content) ? node.content : [];
      const padMm = 3.5;
      const boxW = Math.max(24, colWidthMm - 2);
      const startY = cursorY;

      const allParagraphLines: WrappedLine[][] = [];
      let totalInnerH = padMm * 2;
      for (const blk of innerBlocks) {
        const spans = collectSpansFromNodes(blk.content || [], { sizePt: 10.5, color: [31, 41, 55], italic: node.type === 'blockquote' });
        const lines = wrapSpansToLines(pdf, spans, boxW - padMm * 2 - 2);
        allParagraphLines.push(lines);
        totalInnerH += lines.reduce((sum, l) => sum + Math.max(4.4, l.maxSizePt * PT_TO_MM * 1.32), 0) + 1;
      }

      ensureSpace(Math.min(totalInnerH, contentBottomMm - contentTopMm - 2));
      const boxY = cursorY;
      const bg: RgbTuple = node.attrs?.type === 'warning' ? [254, 243, 199] : node.attrs?.type === 'danger' ? [254, 226, 226] : [244, 248, 245];
      const bar: RgbTuple = node.attrs?.type === 'warning' ? [217, 119, 6] : node.attrs?.type === 'danger' ? [220, 38, 38] : [36, 92, 69];

      if (boxY + totalInnerH <= contentBottomMm) {
        pdf.setFillColor(bg[0], bg[1], bg[2]);
        pdf.roundedRect(baseX, boxY, boxW, totalInnerH, 1.5, 1.5, 'F');
        pdf.setFillColor(bar[0], bar[1], bar[2]);
        pdf.rect(baseX, boxY, 1.2, totalInnerH, 'F');
      }

      cursorY = boxY + padMm;
      for (const lines of allParagraphLines) {
        renderLines(lines, { x: baseX + padMm + 1.5, widthMm: boxW - padMm * 2 - 2, align: 'left', lineHeightFactor: 1.32 });
        cursorY += 0.8;
      }
      cursorY = Math.max(cursorY + padMm * 0.5, startY === cursorY ? cursorY + 4 : cursorY + 1.8);
      return;
    }

    if (node.type === 'codeBlock') {
      const rawCode = (node.content || []).map((c: any) => c.text || '').join('');
      const rawLines = rawCode.split(/\r?\n/);
      const padMm = 3.2;
      const lineH = 4.1;
      const codeInnerW = colWidthMm - padMm * 2;
      const wrappedCode: string[] = [];
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(8.8);
      for (const rl of rawLines) {
        const split = pdf.splitTextToSize(rl || ' ', codeInnerW) as string[];
        wrappedCode.push(...split);
      }

      let idx = 0;
      while (idx < wrappedCode.length) {
        const availH = contentBottomMm - cursorY;
        const maxLinesFit = Math.floor((availH - padMm * 2) / lineH);
        if (maxLinesFit < 2) {
          advancePageOrColumn();
          continue;
        }
        const chunk = wrappedCode.slice(idx, idx + maxLinesFit);
        const boxH = chunk.length * lineH + padMm * 2;
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.25);
        pdf.roundedRect(baseX, cursorY, colWidthMm, boxH, 1.5, 1.5, 'FD');

        pdf.setFont('courier', 'normal');
        pdf.setFontSize(8.8);
        pdf.setTextColor(30, 41, 59);
        chunk.forEach((lineStr, cIdx) => {
          pdf.text(lineStr, baseX + padMm, cursorY + padMm + (cIdx + 0.78) * lineH);
        });

        cursorY += boxH + 2;
        idx += chunk.length;
        if (idx < wrappedCode.length) {
          advancePageOrColumn();
        }
      }
      return;
    }

    if (node.type === 'table') {
      const rows = Array.isArray(node.content) ? node.content : [];
      if (rows.length === 0) return;

      // Determine grid column count cleanly
      let colCount = 0;
      for (const row of rows) {
        const cells = Array.isArray(row?.content) ? row.content : [];
        const spanSum = cells.reduce((acc: number, c: any) => acc + Math.max(1, Number(c?.attrs?.colspan || 1)), 0);
        if (spanSum > colCount) colCount = spanSum;
      }
      if (colCount === 0) return;

      // Collect column widths from first row or split evenly
      const rawWeights: number[] = new Array(colCount).fill(1);
      const firstRowCells = Array.isArray(rows[0]?.content) ? rows[0].content : [];
      let wIdx = 0;
      for (const c of firstRowCells) {
        const cw = Array.isArray(c?.attrs?.colwidth) ? c.attrs.colwidth : null;
        const span = Math.max(1, Number(c?.attrs?.colspan || 1));
        for (let k = 0; k < span && wIdx < colCount; k++) {
          if (cw && typeof cw[k] === 'number' && cw[k] > 0) {
            rawWeights[wIdx] = cw[k];
          }
          wIdx++;
        }
      }
      const totalWeight = rawWeights.reduce((a, b) => a + b, 0) || colCount;
      const colWidthsMm = rawWeights.map((w) => (w / totalWeight) * colWidthMm);

      const cellPadX = 2.4;
      const cellPadY = 2.0;

      const buildRowLayout = (rowNode: any) => {
        const cells = Array.isArray(rowNode?.content) ? rowNode.content : [];
        const renderedCells: Array<{
          xOffsetMm: number;
          widthMm: number;
          isHeader: boolean;
          bg?: RgbTuple;
          textAlign: 'left' | 'center' | 'right' | 'justify';
          paragraphs: WrappedLine[][];
        }> = [];
        let cOffset = 0;
        let maxRowHeightMm = 7.2;

        for (const cell of cells) {
          const span = Math.max(1, Number(cell?.attrs?.colspan || 1));
          let cellW = 0;
          let xOff = 0;
          for (let ci = 0; ci < cOffset; ci++) xOff += colWidthsMm[ci] || 0;
          for (let ci = cOffset; ci < Math.min(colCount, cOffset + span); ci++) cellW += colWidthsMm[ci] || 0;
          cOffset += span;

          const isHeader = cell?.type === 'tableHeader';
          const bg = cell?.attrs?.backgroundColor ? parseColor(String(cell.attrs.backgroundColor)) : isHeader ? [241, 245, 249] as RgbTuple : undefined;
          const innerW = Math.max(10, cellW - cellPadX * 2);
          const cellBlocks = Array.isArray(cell?.content) ? cell.content : [];
          const paragraphs: WrappedLine[][] = [];
          let cellH = cellPadY * 2;
          let firstAlign: 'left' | 'center' | 'right' | 'justify' = 'left';

          cellBlocks.forEach((blk: any, bi: number) => {
            if (bi === 0 && blk?.attrs?.textAlign) firstAlign = blk.attrs.textAlign;
            const spans = collectSpansFromNodes(blk?.content, {
              sizePt: isHeader ? 10 : 9.8,
              color: isHeader && bg && bg[0] + bg[1] + bg[2] < 360 ? [255, 255, 255] : [23, 28, 25],
              bold: isHeader,
            });
            const wrapped = wrapSpansToLines(
              pdf,
              spans.length ? spans : [{ text: ' ', font: 'helvetica', style: isHeader ? 'bold' : 'normal', sizePt: 9.8, color: [23, 28, 25] }],
              innerW
            );
            paragraphs.push(wrapped);
            cellH += wrapped.reduce((s, l) => s + Math.max(4.1, l.maxSizePt * PT_TO_MM * 1.28), 0);
          });

          if (cellH > maxRowHeightMm) maxRowHeightMm = cellH;
          renderedCells.push({ xOffsetMm: xOff, widthMm: cellW, isHeader, bg, textAlign: firstAlign, paragraphs });
        }

        return { renderedCells, rowHeightMm: maxRowHeightMm };
      };

      const headerLayout =
        rows[0]?.content?.some((c: any) => c?.type === 'tableHeader') ? buildRowLayout(rows[0]) : null;

      const drawRowLayout = (layout: ReturnType<typeof buildRowLayout>, rowX: number, rowY: number) => {
        const savedCursor = cursorY;
        for (const c of layout.renderedCells) {
          const cx = rowX + c.xOffsetMm;
          if (c.bg) {
            pdf.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
            pdf.rect(cx, rowY, c.widthMm, layout.rowHeightMm, 'F');
          }
          pdf.setDrawColor(203, 213, 225);
          pdf.setLineWidth(0.22);
          pdf.rect(cx, rowY, c.widthMm, layout.rowHeightMm, 'S');

          cursorY = rowY + cellPadY;
          for (const lines of c.paragraphs) {
            renderLines(lines, {
              x: cx + cellPadX,
              widthMm: Math.max(8, c.widthMm - cellPadX * 2),
              align: c.textAlign,
              lineHeightFactor: 1.28,
            });
          }
        }
        cursorY = Math.max(savedCursor, rowY + layout.rowHeightMm);
      };

      for (let ri = 0; ri < rows.length; ri++) {
        const rowLayout = buildRowLayout(rows[ri]);
        if (cursorY + rowLayout.rowHeightMm > contentBottomMm && cursorY > contentTopMm + 1) {
          advancePageOrColumn();
          if (headerLayout && ri > 0) {
            drawRowLayout(headerLayout, getColX(), cursorY);
          }
        }
        drawRowLayout(rowLayout, getColX(), cursorY);
      }
      cursorY += 2.5;
      return;
    }

    if (node.type === 'image' && node.attrs?.src) {
      const imgData = await loadImageForPdf(String(node.attrs.src));
      if (imgData) {
        const requestedW = node.attrs.width ? Number(node.attrs.width) * PX_TO_MM : colWidthMm * 0.85;
        const drawW = Math.min(colWidthMm, Math.max(20, requestedW));
        const aspect = imgData.height / Math.max(1, imgData.width);
        let drawH = drawW * aspect;
        const maxPageBodyH = contentBottomMm - contentTopMm - 2;
        let finalW = drawW;
        if (drawH > maxPageBodyH) {
          drawH = maxPageBodyH;
          finalW = drawH / Math.max(0.05, aspect);
        }
        ensureSpace(drawH + 2);
        const align = node.attrs?.alignment || 'center';
        const imgX =
          align === 'right'
            ? baseX + colWidthMm - finalW
            : align === 'left'
            ? baseX
            : baseX + (colWidthMm - finalW) / 2;
        pdf.addImage(imgData.dataUrl, imgData.format, imgX, cursorY, finalW, drawH, undefined, 'FAST');
        cursorY += drawH + 3;
      }
      return;
    }

    if (node.type === 'textBox') {
      const innerBlocks = Array.isArray(node.content) ? node.content : [];
      const padMm = 4;
      const boxW = Math.min(colWidthMm, node.attrs?.width > 0 ? Number(node.attrs.width) * PX_TO_MM : colWidthMm);
      const startY = cursorY;
      const fillRgb = parseColor(node.attrs?.fill || '#F8FAFC', [248, 250, 252]);
      const borderRgb = parseColor(node.attrs?.borderColor || '#245C45', [36, 92, 69]);
      ensureSpace(16);
      const boxTopY = cursorY;

      // Measure first by rendering lines into temp array
      const measured: Array<{ lines: WrappedLine[]; align: 'left' | 'center' | 'right' | 'justify' }> = [];
      let totalH = padMm * 2;
      for (const blk of innerBlocks) {
        const isH = blk.type === 'heading';
        const pt = isH ? 14 : 11;
        const spans = collectSpansFromNodes(blk.content || [], { sizePt: pt, color: [23, 28, 25], bold: isH });
        const lines = wrapSpansToLines(pdf, spans, boxW - padMm * 2);
        measured.push({ lines, align: blk.attrs?.textAlign || 'left' });
        totalH += lines.reduce((s, l) => s + Math.max(4.4, l.maxSizePt * PT_TO_MM * 1.32), 0) + 1;
      }

      ensureSpace(Math.min(contentBottomMm - contentTopMm - 2, totalH));
      const actualTop = cursorY;
      pdf.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
      pdf.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
      pdf.setLineWidth(Math.max(0.25, Number(node.attrs?.borderWidth || 1) * PX_TO_MM));
      pdf.roundedRect(baseX, actualTop, boxW, totalH, 1.5, 1.5, 'FD');

      cursorY = actualTop + padMm;
      for (const item of measured) {
        renderLines(item.lines, { x: baseX + padMm, widthMm: boxW - padMm * 2, align: item.align, lineHeightFactor: 1.32 });
      }
      cursorY = Math.max(actualTop + totalH + 2.5, startY + 6);
      return;
    }

    if (node.type === 'shape' || node.type === 'shapeNode') {
      const wMm = Math.min(colWidthMm, Math.max(24, Number(node.attrs?.width || 180) * PX_TO_MM));
      const hMm = Math.max(10, Number(node.attrs?.height || 90) * PX_TO_MM);
      ensureSpace(hMm + 3);
      const shapeX = baseX + (colWidthMm - wMm) / 2;
      const shapeY = cursorY;
      const fill = parseColor(node.attrs?.fill || '#EAF2ED', [234, 242, 237]);
      const stroke = parseColor(node.attrs?.stroke || '#245C45', [36, 92, 69]);
      pdf.setFillColor(fill[0], fill[1], fill[2]);
      pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
      pdf.setLineWidth(0.5);

      const st = String(node.attrs?.shapeType || 'rectangle');
      if (st === 'ellipse' || st === 'circle') {
        pdf.ellipse(shapeX + wMm / 2, shapeY + hMm / 2, wMm / 2, hMm / 2, 'FD');
      } else {
        pdf.roundedRect(shapeX, shapeY, wMm, hMm, st.includes('rounded') ? 3 : 0.8, st.includes('rounded') ? 3 : 0.8, 'FD');
      }

      if (node.attrs?.label) {
        const spans = [{ text: String(node.attrs.label), font: 'helvetica' as const, style: 'bold' as const, sizePt: 10.5, color: stroke }];
        const lines = wrapSpansToLines(pdf, spans, wMm - 6);
        const savedY = cursorY;
        cursorY = shapeY + Math.max(2, (hMm - lines.length * 4.5) / 2);
        renderLines(lines, { x: shapeX + 3, widthMm: wMm - 6, align: 'center', lineHeightFactor: 1.25 });
        cursorY = Math.max(cursorY, savedY);
      }
      cursorY = shapeY + hMm + 3;
      return;
    }

    if (node.type === 'equation' || node.type === 'equationNode') {
      const expr = formatMathExpression(String(node.attrs?.latex || ''));
      if (expr) {
        const spans: TextSpan[] = [{ text: expr, font: 'times', style: 'italic', sizePt: 13, color: [23, 28, 25] }];
        const lines = wrapSpansToLines(pdf, spans, colWidthMm - 8);
        ensureSpace(lines.length * 6 + 4);
        renderLines(lines, { x: baseX, widthMm: colWidthMm, align: 'center', lineHeightFactor: 1.35 });
        cursorY += 2;
      }
      return;
    }

    // Fallback for generic containers
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        await renderNode(child, listDepth, listOrderedStart);
      }
    }
  };

  const docJson =
    options?.jsonContent && Array.isArray(options.jsonContent.content)
      ? options.jsonContent
      : htmlFallbackToJson(options?.htmlContent || '');

  const topNodes = mergeSplitTables(Array.isArray(docJson.content) ? docJson.content : []);

  const fallbackFontReqs: Array<{ rawFont: string; bold: boolean; italic: boolean }> = [
    { rawFont: 'Calibri', bold: false, italic: false },
    { rawFont: 'Calibri', bold: true, italic: false },
  ];
  const collectFontsFromJson = (nodes: any[]) => {
    for (const n of nodes) {
      if (!n) continue;
      if (n.type === 'text' && Array.isArray(n.marks)) {
        let isB = false;
        let isI = false;
        let rf = 'Calibri';
        for (const m of n.marks) {
          if (m?.type === 'bold') isB = true;
          else if (m?.type === 'italic') isI = true;
          else if (m?.type === 'fontFamily' && m.attrs?.font) rf = String(m.attrs.font);
          else if (m?.type === 'textStyle' && m.attrs?.fontFamily) rf = String(m.attrs.fontFamily);
          else if (m?.type === 'code') rf = 'Consolas';
        }
        fallbackFontReqs.push({ rawFont: rf, bold: isB, italic: isI });
      } else if (Array.isArray(n.content)) {
        collectFontsFromJson(n.content);
      }
    }
  };
  collectFontsFromJson(topNodes);
  resolveFallbackFont = await buildTrueTypeFontResolver(pdf, fallbackFontReqs);

  for (const node of topNodes) {
    await renderNode(node);
  }

  const totalPages = pdf.getNumberOfPages();
  renderPdfChromePass(pdf, totalPages, pdfWidthMm, pdfHeightMm, margins, options, resolveFallbackFont, 'Calibri');

  return { pdf, filename: `${safeTitle}.pdf` };
}

function isWinAnsiCodeUnit(code: number): boolean {
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  switch (code) {
    case 0x20ac:
    case 0x201a:
    case 0x0192:
    case 0x201e:
    case 0x2026:
    case 0x2020:
    case 0x2021:
    case 0x02c6:
    case 0x2030:
    case 0x0160:
    case 0x2039:
    case 0x0152:
    case 0x017d:
    case 0x2018:
    case 0x2019:
    case 0x201c:
    case 0x201d:
    case 0x2022:
    case 0x2013:
    case 0x2014:
    case 0x02dc:
    case 0x2122:
    case 0x0161:
    case 0x203a:
    case 0x0153:
    case 0x017e:
    case 0x0178:
      return true;
    default:
      return false;
  }
}

function toWinAnsiOrRenderSafe(text: string): string {
  const cleaned = text.replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
  let out = '';
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (isWinAnsiCodeUnit(code) || code === 0x0a || code === 0x0d || code === 0x09) {
      out += cleaned[i];
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair in headless mode
      out += ' ';
      i++;
    } else {
      out += ' ';
    }
  }
  return out;
}

function splitTextByWinAnsi(text: string): Array<{ start: number; end: number; text: string; winAnsi: boolean }> {
  const result: Array<{ start: number; end: number; text: string; winAnsi: boolean }> = [];
  let i = 0;
  let curStart = 0;
  let curMode: boolean | null = null;

  while (i < text.length) {
    const code = text.charCodeAt(i);
    const isSurrogate = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length;
    const step = isSurrogate ? 2 : 1;
    const isWa = !isSurrogate && isWinAnsiCodeUnit(code);

    if (curMode === null) {
      curMode = isWa;
    } else if (curMode !== isWa) {
      result.push({
        start: curStart,
        end: i,
        text: text.slice(curStart, i),
        winAnsi: curMode,
      });
      curStart = i;
      curMode = isWa;
    }
    i += step;
  }

  if (curStart < text.length && curMode !== null) {
    result.push({
      start: curStart,
      end: text.length,
      text: text.slice(curStart),
      winAnsi: curMode,
    });
  }

  return result;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseCssColorRgba(raw?: string | null): RgbaColor | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'none') return null;

  const rgbaMatch = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgbaMatch) {
    const a = rgbaMatch[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgbaMatch[4]))) : 1;
    if (a <= 0.005) return null;
    return {
      r: Math.max(0, Math.min(255, Math.round(parseFloat(rgbaMatch[1])))),
      g: Math.max(0, Math.min(255, Math.round(parseFloat(rgbaMatch[2])))),
      b: Math.max(0, Math.min(255, Math.round(parseFloat(rgbaMatch[3])))),
      a,
    };
  }

  const rgb = parseColor(s, [-1, -1, -1] as unknown as RgbTuple);
  if (rgb[0] >= 0) {
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 };
  }
  return null;
}

function drawMicroGlyphSprite(
  pdf: JsPdfType,
  text: string,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  fontCss: string,
  colorCss: string
) {
  if (typeof document === 'undefined' || wMm <= 0 || hMm <= 0) return;
  const pxW = Math.max(8, Math.ceil((wMm * 96) / 25.4));
  const pxH = Math.max(8, Math.ceil((hMm * 96) / 25.4));
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = pxW * scale;
  canvas.height = pxH * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.font = fontCss;
  ctx.fillStyle = colorCss;
  ctx.textBaseline = 'top';
  ctx.fillText(text, 0, Math.max(0, (pxH - parseFloat(fontCss.match(/([\d.]+)px/)?.[1] || `${pxH * 0.85}`)) * 0.45));
  try {
    const dataUrl = canvas.toDataURL('image/png');
    pdf.addImage(dataUrl, 'PNG', xMm, yMm, wMm, hMm, undefined, 'FAST');
  } catch {
    // ignore canvas failure
  }
}

function drawMixedStringOnPdf(
  pdf: JsPdfType,
  text: string,
  xMm: number,
  baselineYMm: number,
  align: 'left' | 'center' | 'right',
  fontSizePt: number,
  colorRgb: RgbTuple
) {
  const safeRuns = splitTextByWinAnsi(text);
  const hasNonWinAnsi = safeRuns.some((r) => !r.winAnsi);
  if (!hasNonWinAnsi || typeof document === 'undefined') {
    pdf.text(toWinAnsiOrRenderSafe(text), xMm, baselineYMm, { align });
    return;
  }

  // Measure total width of mixed WinAnsi + Unicode glyphs
  const fontCss = `normal ${Math.round((fontSizePt * 96) / 72)}px Calibri, Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const glyphWidthMm = (txt: string, winAnsi: boolean): number => {
    if (winAnsi) return pdf.getTextWidth(txt);
    if (ctx) {
      ctx.font = fontCss;
      return (ctx.measureText(txt).width * 25.4) / 96;
    }
    return fontSizePt * PT_TO_MM;
  };

  let totalW = 0;
  const measured = safeRuns.map((r) => {
    const w = glyphWidthMm(r.text, r.winAnsi);
    totalW += w;
    return { ...r, w };
  });

  let cursorX = align === 'center' ? xMm - totalW / 2 : align === 'right' ? xMm - totalW : xMm;
  const lineH = fontSizePt * PT_TO_MM * 1.15;
  const topY = baselineYMm - fontSizePt * PT_TO_MM * 0.82;

  for (const seg of measured) {
    if (seg.winAnsi) {
      pdf.text(seg.text, cursorX, baselineYMm);
    } else {
      drawMicroGlyphSprite(
        pdf,
        seg.text,
        cursorX,
        topY,
        Math.max(seg.w, fontSizePt * PT_TO_MM * 0.9),
        lineH,
        fontCss,
        `rgb(${colorRgb[0]}, ${colorRgb[1]}, ${colorRgb[2]})`
      );
    }
    cursorX += seg.w;
  }
}

type FontResolverFn = (
  rawFont: string | undefined,
  bold: boolean,
  italic: boolean
) => { fontName: string; style: FontStyleKey; needsSyntheticBold?: boolean };

async function buildTrueTypeFontResolver(
  pdf: JsPdfType,
  requests: Array<{ rawFont: string; bold: boolean; italic: boolean }>
): Promise<FontResolverFn> {
  const registered = new Map<string, { fontName: string; style: FontStyleKey; needsSyntheticBold?: boolean }>();

  if (typeof window !== 'undefined' && requests.length > 0) {
    const deduped = new Map<string, { primary: string; rawFont: string; bold: boolean; italic: boolean; style: FontStyleKey }>();
    for (const req of requests) {
      const primary = normalizeExportFontName(req.rawFont, 'Calibri');
      const style = getFontStyle(req.bold, req.italic);
      const key = `${primary.toLowerCase()}|${style}`;
      if (!deduped.has(key)) {
        deduped.set(key, { primary, rawFont: req.rawFont || primary, bold: req.bold, italic: req.italic, style });
      }
    }

    await Promise.all(
      Array.from(deduped.entries()).map(async ([key, item]) => {
        const bytes = await fetchTrueTypeFontBytes(item.rawFont, item.bold, item.italic, false);
        if (!bytes) return;
        const alias = `ttf_${item.primary.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        const vfsName = `${alias}_${item.style}.ttf`;
        const needsSyntheticBold = item.bold && !isTrueTypeBytesBold(bytes);
        try {
          pdf.addFileToVFS(vfsName, uint8ArrayToBase64(bytes));
          pdf.addFont(vfsName, alias, item.style, undefined, 'Identity-H');
          registered.set(key, { fontName: alias, style: item.style, needsSyntheticBold });
        } catch {
          // fallback to standard PDF font if font table rejects file
        }
      })
    );
  }

  return (rawFont: string | undefined, bold: boolean, italic: boolean) => {
    const primary = normalizeExportFontName(rawFont, 'Calibri');
    const style = getFontStyle(bold, italic);
    const famKey = primary.toLowerCase();
    const exact = registered.get(`${famKey}|${style}`);
    if (exact) return exact;
    if (style === 'bolditalic') {
      const boldOnly = registered.get(`${famKey}|bold`);
      if (boldOnly) return boldOnly;
      const italicOnly = registered.get(`${famKey}|italic`);
      if (italicOnly) return { ...italicOnly, needsSyntheticBold: true };
    }
    const normalFallback = registered.get(`${famKey}|normal`);
    if (normalFallback) return { ...normalFallback, needsSyntheticBold: bold || normalFallback.needsSyntheticBold };
    return { fontName: mapFontFamily(rawFont), style };
  };
}

function renderPdfChromePass(
  pdf: JsPdfType,
  totalPages: number,
  pdfWidthMm: number,
  pdfHeightMm: number,
  margins: { top: number; bottom: number; left: number; right: number },
  options?: PdfExportOptions,
  resolveFont?: FontResolverFn,
  chromeFontFamily = 'Calibri'
) {
  const diffFirst = Boolean(options?.differentFirstPage);
  const borderStyle = options?.pageBorder || 'none';
  const borderRgb = parseColor(options?.pageBorderColor || '#1e293b', [30, 41, 59]);
  const borderWidthMm = Math.max(0.25, Math.min(2, Number(options?.pageBorderWidth || 1) * 0.3));
  const borderOffset = options?.pageBorderOffset || 'edge';

  const headerLineY = Math.max(36 * PX_TO_MM, margins.top);
  const footerLineY = pdfHeightMm - Math.max(36 * PX_TO_MM, margins.bottom);

  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    const isFirst = p === 1;

    // 1. Page Border
    if (borderStyle !== 'none') {
      const inset =
        borderOffset === 'margin'
          ? {
              left: Math.max(4, margins.left - 3),
              right: Math.max(4, margins.right - 3),
              top: Math.max(4, margins.top - 3),
              bottom: Math.max(4, margins.bottom - 3),
            }
          : borderOffset === 'wide'
          ? { left: 3.2, right: 3.2, top: 3.2, bottom: 3.2 }
          : { left: 5.3, right: 5.3, top: 5.3, bottom: 5.3 };

      const bx = inset.left;
      const by = inset.top;
      const bw = Math.max(20, pdfWidthMm - inset.left - inset.right);
      const bh = Math.max(20, pdfHeightMm - inset.top - inset.bottom);

      pdf.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
      pdf.setLineWidth(borderWidthMm);
      pdf.rect(bx, by, bw, bh, 'S');
      if (borderStyle === 'double') {
        pdf.setLineWidth(Math.max(0.2, borderWidthMm * 0.7));
        pdf.rect(bx + 1.4, by + 1.4, bw - 2.8, bh - 2.8, 'S');
      } else if (borderStyle === 'accent') {
        pdf.setLineWidth(borderWidthMm * 1.8);
        pdf.line(bx, by, bx + bw, by);
      }
    }

    // 2. Running or First-Page Header
    const rawHeader = isFirst && diffFirst ? options?.firstPageHeaderText || '' : options?.headerText || '';
    const resolvedHeader = resolvePageTokens(rawHeader, p, totalPages).trim();
    const hdrFont = resolveFont ? resolveFont(chromeFontFamily, false, false) : { fontName: 'helvetica', style: 'normal' as FontStyleKey };
    if (resolvedHeader) {
      pdf.setFont(hdrFont.fontName, hdrFont.style);
      pdf.setFontSize(9.5);
      pdf.setTextColor(107, 114, 128);
      const hY = Math.max(5.5, headerLineY - 2.6);
      const hAlign = options?.headerAlign || 'left';
      const hX =
        hAlign === 'center'
          ? pdfWidthMm / 2
          : hAlign === 'right'
          ? pdfWidthMm - margins.right
          : margins.left;
      drawMixedStringOnPdf(pdf, resolvedHeader, hX, hY, hAlign, 9.5, [107, 114, 128]);
      if (options?.showHeaderLine) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.2);
        pdf.line(margins.left, headerLineY, pdfWidthMm - margins.right, headerLineY);
      }
    }

    // 3. Running or First-Page Footer & Page Numbers
    const rawFooter = isFirst && diffFirst ? options?.firstPageFooterText || '' : options?.footerText || '';
    const resolvedFooter = resolvePageTokens(rawFooter, p, totalPages).trim();
    const showPageNum = Boolean(options?.showPageNumbers) && !rawFooter.includes('{page}');
    const fY = Math.min(pdfHeightMm - 4.5, footerLineY + 5.2);

    if (resolvedFooter || showPageNum) {
      if (options?.showFooterLine) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.2);
        pdf.line(margins.left, footerLineY, pdfWidthMm - margins.right, footerLineY);
      }

      pdf.setFont(hdrFont.fontName, hdrFont.style);
      pdf.setFontSize(9.5);
      pdf.setTextColor(107, 114, 128);

      if (resolvedFooter) {
        const fAlign = options?.footerAlign || 'left';
        const fX =
          fAlign === 'center'
            ? pdfWidthMm / 2
            : fAlign === 'right'
            ? pdfWidthMm - margins.right
            : margins.left;
        drawMixedStringOnPdf(pdf, resolvedFooter, fX, fY, fAlign, 9.5, [107, 114, 128]);
      }

      if (showPageNum) {
        const numText = `Page ${p} of ${totalPages}`;
        const pos = options?.pageNumberPosition || 'bottom-right';
        if (pos === 'top-right') {
          pdf.text(numText, pdfWidthMm - margins.right, Math.max(5.5, headerLineY - 2.6), { align: 'right' });
        } else if (pos === 'bottom-center') {
          pdf.text(numText, pdfWidthMm / 2, fY, { align: 'center' });
        } else {
          pdf.text(numText, pdfWidthMm - margins.right, fY, { align: 'right' });
        }
      }
    }

    // 4. Translucent Diagonal Watermark
    const wm = options?.watermarkText?.trim();
    if (wm) {
      const wmFont = resolveFont ? resolveFont(chromeFontFamily, true, false) : { fontName: 'helvetica', style: 'bold' as FontStyleKey };
      pdf.saveGraphicsState();
      const GState = (pdf as any).GState;
      if (GState) {
        pdf.setGState(new GState({ opacity: 0.085 }));
      }
      pdf.setFont(wmFont.fontName, wmFont.style);
      pdf.setFontSize(Math.max(38, Math.min(72, Math.floor(420 / Math.max(4, wm.length)))));
      pdf.setTextColor(36, 92, 69);
      pdf.text(toWinAnsiOrRenderSafe(wm.toUpperCase()), pdfWidthMm / 2, pdfHeightMm / 2, {
        align: 'center',
        angle: 38,
      });
      pdf.restoreGraphicsState();
    }
  }
}

async function svgElementToPngDataUrl(svgEl: SVGSVGElement, wPx: number, hPx: number): Promise<string | null> {
  try {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', `${Math.max(1, Math.round(wPx))}`);
    clone.setAttribute('height', `${Math.max(1, Math.round(hPx))}`);
    const cs = window.getComputedStyle(svgEl);
    if (!clone.style.color) clone.style.color = cs.color || '#171c19';
    if (!clone.style.fontFamily) clone.style.fontFamily = cs.fontFamily || 'Calibri, Arial, sans-serif';

    // Inline computed typography on any foreignObject HTML nodes (e.g. Mermaid labels)
    const srcForeigns = svgEl.querySelectorAll('foreignObject *');
    const dstForeigns = clone.querySelectorAll('foreignObject *');
    srcForeigns.forEach((srcNode, i) => {
      const dstNode = dstForeigns[i] as HTMLElement | undefined;
      if (!dstNode || !(dstNode instanceof HTMLElement)) return;
      const fcs = window.getComputedStyle(srcNode);
      dstNode.style.fontFamily = fcs.fontFamily;
      dstNode.style.fontSize = fcs.fontSize;
      dstNode.style.fontWeight = fcs.fontWeight;
      dstNode.style.color = fcs.color;
      dstNode.style.lineHeight = fcs.lineHeight;
    });

    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    return await new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = 3;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(4, Math.round(wPx * scale));
        canvas.height = Math.max(4, Math.round(hPx * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, wPx, hPx);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = svgUrl;
    });
  } catch {
    return null;
  }
}

async function imgElementToPngDataUrl(imgEl: HTMLImageElement): Promise<string | null> {
  try {
    const src = imgEl.currentSrc || imgEl.src;
    if (!src) return null;
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      const natW = imgEl.naturalWidth;
      const natH = imgEl.naturalHeight;
      const scale = natW < 800 ? 2 : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(natW * scale));
      canvas.height = Math.max(2, Math.round(natH * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        try {
          return canvas.toDataURL('image/png');
        } catch {
          // cross-origin canvas tainted; try fetch below
        }
      }
    }
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve) => {
        const tmp = new window.Image();
        tmp.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(2, tmp.naturalWidth);
          canvas.height = Math.max(2, tmp.naturalHeight);
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(tmp, 0, 0);
          try {
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        tmp.onerror = () => resolve(null);
        tmp.src = objUrl;
      });
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

function splitTextNodeIntoVisualLines(node: Text): Array<{ start: number; end: number; rect: DOMRect }> {
  const len = node.data.length;
  if (len === 0) return [];
  const range = document.createRange();
  range.selectNodeContents(node);
  const allRects = Array.from(range.getClientRects()).filter((r) => r.width > 0.05 || r.height > 0.5);
  if (allRects.length === 0) return [];

  // Check if all rects sit on the same horizontal row
  const minTop = Math.min(...allRects.map((r) => r.top));
  const maxTop = Math.max(...allRects.map((r) => r.top));
  if (allRects.length === 1 || Math.abs(maxTop - minTop) < 4) {
    return [{ start: 0, end: len, rect: range.getBoundingClientRect() }];
  }

  const lines: Array<{ start: number; end: number; rect: DOMRect }> = [];
  let pos = 0;

  while (pos < len) {
    const ch = node.data[pos];
    if (ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }

    // Advance safely on UTF-16 code unit boundaries (never cut surrogate pairs)
    const adjustValidIndex = (idx: number): number => {
      if (idx <= pos || idx >= len) return idx;
      const prev = node.data.charCodeAt(idx - 1);
      if (prev >= 0xd800 && prev <= 0xdbff) return idx + 1;
      return idx;
    };

    const nextNewlineIdx = node.data.indexOf('\n', pos);
    const maxLineIdx = nextNewlineIdx >= 0 ? nextNewlineIdx : len;

    range.setStart(node, pos);
    range.setEnd(node, Math.min(maxLineIdx, adjustValidIndex(pos + 1)));
    const firstBox = range.getBoundingClientRect();
    const baseTop = firstBox.top;

    let lo = Math.min(maxLineIdx, adjustValidIndex(pos + 1));
    let hi = maxLineIdx;
    let best = lo;

    while (lo <= hi) {
      const midRaw = (lo + hi) >> 1;
      const mid = adjustValidIndex(midRaw);
      range.setStart(node, pos);
      range.setEnd(node, mid);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.05 || r.height > 0.5);
      const wraps = rects.some((r) => Math.abs(r.top - baseTop) >= Math.max(4, firstBox.height * 0.45));
      if (!wraps) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = midRaw - 1;
      }
    }

    best = Math.max(Math.min(maxLineIdx, adjustValidIndex(pos + 1)), best);
    range.setStart(node, pos);
    range.setEnd(node, best);
    const lineRect = range.getBoundingClientRect();
    if (lineRect.width > 0.05 && lineRect.height > 0.5) {
      lines.push({ start: pos, end: best, rect: lineRect });
    }
    pos = best;
  }

  return lines;
}

/**
 * DOM-Measured Exact WYSIWYG Vector PDF Compositor.
 * Reads exact laid-out positions from the rendered workspace sheets so text remains real selectable vector text,
 * tables/columns/page breaks match the workspace 1:1, and images/SVGs/charts/emojis embed crisply at exact locations.
 */
async function renderDomWorkspaceToPdf(
  title: string,
  options?: PdfExportOptions
): Promise<{ pdf: JsPdfType; filename: string } | null> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof document.getElementById !== 'function'
  ) {
    return null;
  }

  const paginatedSheet = document.getElementById('docium-paginated-sheet');
  const continuousSheet = document.getElementById('docium-page-1');
  const docRoot = paginatedSheet || continuousSheet;
  if (!docRoot) return null;

  const contentEl =
    (paginatedSheet?.querySelector('.docium-paper-content') as HTMLElement | null) ||
    (continuousSheet?.querySelector('.docium-paper-content') as HTMLElement | null);
  if (!contentEl) return null;

  const isPaginated = Boolean(paginatedSheet);
  const sheetEls = isPaginated
    ? (Array.from(paginatedSheet!.querySelectorAll('.docium-paper-sheet')) as HTMLElement[])
    : [continuousSheet!];
  if (sheetEls.length === 0) return null;

  const scalerEl = docRoot.closest('.docium-zoom-scaler') as HTMLElement | null;
  const prevTransform = scalerEl?.style.transform || '';
  const prevTransition = scalerEl?.style.transition || '';
  if (scalerEl) {
    scalerEl.style.transition = 'none';
    scalerEl.style.transform = 'scale(1)';
    void scalerEl.offsetHeight;
  }

  try {
    // Ensure all catalog @font-face rules used inside the document are registered and ready before measuring DOM rects
    contentEl.querySelectorAll<HTMLElement>('[style*="font-family"]').forEach((el) => {
      if (el.style?.fontFamily) ensureGoogleFontLoaded(el.style.fontFamily);
    });
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      await Promise.race([
        (document as any).fonts.ready,
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      void contentEl.offsetHeight;
    }
    const orientation = options?.orientation || 'portrait';
    const pageSize = options?.pageSize || 'A4';
    const safeTitle = (title || 'Untitled_Document').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '_') || 'Untitled_Document';

    const sizeSpec = PAPER_SIZES_MM[pageSize as keyof typeof PAPER_SIZES_MM] || PAPER_SIZES_MM.A4;
    const pdfWidthMm =
      orientation === 'portrait'
        ? Math.min(sizeSpec.width, sizeSpec.height)
        : Math.max(sizeSpec.width, sizeSpec.height);
    const pdfHeightMm =
      orientation === 'portrait'
        ? Math.max(sizeSpec.width, sizeSpec.height)
        : Math.min(sizeSpec.width, sizeSpec.height);
    const margins = getResolvedMargins(options?.margins);

    const contentStyle = window.getComputedStyle(contentEl);
    const computedHeaderPx = isPaginated ? parseFloat(contentStyle.paddingTop || '0') : 0;
    const computedFooterPx = isPaginated ? parseFloat(contentStyle.paddingBottom || '0') : 0;
    const headerBandPx =
      computedHeaderPx > 0 ? computedHeaderPx : Math.max(36, Math.round((margins.top * 96) / 25.4));
    const footerBandPx =
      computedFooterPx > 0 ? computedFooterPx : Math.max(36, Math.round((margins.bottom * 96) / 25.4));
    const pagePxH = Math.round((pdfHeightMm * 96) / 25.4);
    const continuousBodyWindowPx = Math.max(200, pagePxH - headerBandPx - footerBandPx);

    const cRect = contentEl.getBoundingClientRect();
    const totalPages = isPaginated
      ? sheetEls.length
      : Math.max(1, Math.ceil(contentEl.scrollHeight / continuousBodyWindowPx));

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pdfWidthMm, pdfHeightMm],
      compress: true,
    });

    const isSkippedEl = (el: Element | null): boolean => {
      if (!el) return true;
      return Boolean(
        el.closest(
          '[data-docium-ui-only="true"], [data-codeblock-ui="true"], .katex-mathml, .sr-only, .docium-page-break, script, style, .ProseMirror-separator, .ProseMirror-trailingBreak'
        )
      );
    };

    // Font metric ascent cache so DOM text lines up on baseline cleanly
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    const ascentCache = new Map<string, number>();
    const getAscentPx = (fontCss: string, fontSizePx: number): number => {
      const cached = ascentCache.get(fontCss);
      if (cached !== undefined) return cached;
      let asc = fontSizePx * 0.8;
      if (measureCtx) {
        measureCtx.font = fontCss;
        const m = measureCtx.measureText('HgM');
        if (m.fontBoundingBoxAscent) {
          asc = m.fontBoundingBoxAscent;
        }
      }
      ascentCache.set(fontCss, asc);
      return asc;
    };

    // 1. Snapshot visual Boxes (backgrounds, borders, rules, checkboxes) once
    interface BoxSnapshot {
      rect: DOMRect;
      bg: RgbaColor | null;
      borders: {
        top: { w: number; style: string; color: RgbaColor | null };
        right: { w: number; style: string; color: RgbaColor | null };
        bottom: { w: number; style: string; color: RgbaColor | null };
        left: { w: number; style: string; color: RgbaColor | null };
      };
      radiusPx: number;
      isCheckbox: boolean;
      checked: boolean;
    }

    const boxSnapshots: BoxSnapshot[] = [];
    const rasterSnapshots: Array<{ rect: DOMRect; dataUrl: string }> = [];
    const imgCache = new Map<string, string | null>();

    const allEls = Array.from(contentEl.querySelectorAll('*'));
    for (const el of allEls) {
      if (isSkippedEl(el)) continue;
      if (el instanceof SVGElement) {
        if (el.parentElement?.closest('svg')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const dataUrl = await svgElementToPngDataUrl(el as SVGSVGElement, r.width, r.height);
        if (dataUrl) rasterSnapshots.push({ rect: r, dataUrl });
        continue;
      }

      if (el instanceof HTMLImageElement) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const key = el.currentSrc || el.src;
        let dataUrl = key ? imgCache.get(key) : undefined;
        if (dataUrl === undefined) {
          dataUrl = await imgElementToPngDataUrl(el);
          if (key) imgCache.set(key, dataUrl);
        }
        if (dataUrl) rasterSnapshots.push({ rect: r, dataUrl });
        continue;
      }

      if (el instanceof HTMLCanvasElement) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        try {
          rasterSnapshots.push({ rect: r, dataUrl: el.toDataURL('image/png') });
        } catch {
          // ignore tainted canvas
        }
        continue;
      }

      const r = el.getBoundingClientRect();
      if (r.width < 0.2 || r.height < 0.2) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) {
        continue;
      }

      const tag = el.tagName.toUpperCase();
      const rawBg = parseCssColorRgba(cs.backgroundColor);
      const isExplicitBgHolder =
        tag === 'TD' ||
        tag === 'TH' ||
        tag === 'PRE' ||
        tag === 'CODE' ||
        tag === 'MARK' ||
        tag === 'BLOCKQUOTE' ||
        tag === 'HR' ||
        el.matches('[data-type="docium-textbox"], [data-type="docium-callout"], [data-type="docium-codeblock"], .frac-line');
      const isPureWhite = rawBg && rawBg.r >= 253 && rawBg.g >= 253 && rawBg.b >= 253;
      const bg = rawBg && (isExplicitBgHolder || !isPureWhite) ? rawBg : null;

      const parseSide = (wStr: string, st: string, colStr: string) => {
        const w = st === 'none' ? 0 : parseFloat(wStr || '0');
        return { w, style: st, color: w > 0.05 ? parseCssColorRgba(colStr) : null };
      };
      const borders = {
        top: parseSide(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor),
        right: parseSide(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor),
        bottom: parseSide(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor),
        left: parseSide(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor),
      };
      const hasAnyBorder =
        Boolean(borders.top.color) ||
        Boolean(borders.right.color) ||
        Boolean(borders.bottom.color) ||
        Boolean(borders.left.color);
      const isCheckbox = tag === 'INPUT' && (el as HTMLInputElement).type === 'checkbox';

      if (bg || hasAnyBorder || isCheckbox) {
        boxSnapshots.push({
          rect: r,
          bg,
          borders,
          radiusPx: parseFloat(cs.borderTopLeftRadius || '0') || 0,
          isCheckbox,
          checked: isCheckbox ? Boolean((el as HTMLInputElement).checked) : false,
        });
      }
    }

    // 2. Snapshot List Markers (<ul>/<ol>)
    interface MarkerSnapshot {
      rect: DOMRect;
      kind: 'ol' | 'ul';
      label: string;
      depth: number;
      fontSizePx: number;
      color: RgbaColor;
      rawFont: string;
    }
    const markerSnapshots: MarkerSnapshot[] = [];
    const listItems = Array.from(contentEl.querySelectorAll('li'));
    for (const li of listItems) {
      if (isSkippedEl(li) || li.getAttribute('data-type') === 'taskItem') continue;
      const parentList = li.parentElement;
      if (!parentList) continue;
      const tag = parentList.tagName.toUpperCase();
      if (tag !== 'OL' && tag !== 'UL') continue;

      // Measure first text/paragraph rect inside li
      const firstPara = li.querySelector('p') || li;
      const r = firstPara.getBoundingClientRect();
      if (r.width < 0.2 || r.height < 0.2) continue;

      let depth = 0;
      let ancestor = parentList.parentElement;
      while (ancestor && ancestor !== contentEl) {
        if (ancestor.tagName === 'UL' || ancestor.tagName === 'OL') depth++;
        ancestor = ancestor.parentElement;
      }

      const cs = window.getComputedStyle(firstPara);
      const siblings = Array.from(parentList.children).filter((c) => c.tagName === 'LI');
      const startAttr = tag === 'OL' ? parseInt(parentList.getAttribute('start') || '1', 10) || 1 : 1;
      const idx = siblings.indexOf(li);
      const label = tag === 'OL' ? `${startAttr + Math.max(0, idx)}.` : '';

      markerSnapshots.push({
        rect: r,
        kind: tag === 'OL' ? 'ol' : 'ul',
        label,
        depth,
        fontSizePx: parseFloat(cs.fontSize || '14.67') || 14.67,
        color: parseCssColorRgba(cs.color) || { r: 23, g: 28, b: 25, a: 1 },
        rawFont: cs.fontFamily || 'Calibri',
      });
    }

    // 3. Snapshot all visible Text segments
    interface TextRunSnapshot {
      rect: DOMRect;
      text: string;
      winAnsi: boolean;
      rawFont: string;
      isBold: boolean;
      isItalic: boolean;
      fontSizePt: number;
      fontSizePx: number;
      ascentPx: number;
      fontCss: string;
      color: RgbaColor;
      underline: boolean;
      strike: boolean;
      href?: string;
    }

    const textSnapshots: TextRunSnapshot[] = [];
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    let currentTextNode: Node | null;
    while ((currentTextNode = walker.nextNode())) {
      const textNode = currentTextNode as Text;
      const parentEl = textNode.parentElement;
      if (!parentEl || parentEl.closest('svg') || isSkippedEl(parentEl)) continue;
      if (!textNode.data || !textNode.data.replace(/\u200B/g, '').trim()) continue;

      const cs = window.getComputedStyle(parentEl);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) {
        continue;
      }

      const rawFont = cs.fontFamily || 'Calibri';
      const isBold = parseInt(cs.fontWeight || '400', 10) >= 600 || cs.fontWeight === 'bold';
      const isItalic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
      const fontSizePx = parseFloat(cs.fontSize || '14.67') || 14.67;
      const fontSizePt = fontSizePx * (72 / 96);
      const fontCss = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      const ascentPx = getAscentPx(fontCss, fontSizePx);
      const color = parseCssColorRgba(cs.color) || { r: 23, g: 28, b: 25, a: 1 };
      const deco = cs.textDecorationLine || '';
      const anchor = parentEl.closest('a[href]') as HTMLAnchorElement | null;
      const href = anchor?.getAttribute('href') || undefined;
      const textTransform = cs.textTransform || 'none';

      const applyTextTransform = (s: string): string => {
        if (textTransform === 'uppercase') return s.toUpperCase();
        if (textTransform === 'lowercase') return s.toLowerCase();
        return s;
      };

      const visualLines = splitTextNodeIntoVisualLines(textNode);
      const range = document.createRange();

      for (const line of visualLines) {
        const lineStr = textNode.data.slice(line.start, line.end);
        if (!lineStr.replace(/\u200B/g, '').trim()) continue;
        const segments = splitTextByWinAnsi(lineStr);

        for (const seg of segments) {
          const cleanSeg = seg.text.replace(/\u200B/g, '');
          if (!cleanSeg.trim()) continue;
          range.setStart(textNode, line.start + seg.start);
          range.setEnd(textNode, line.start + seg.end);
          const segRect = range.getBoundingClientRect();
          if (segRect.width < 0.05 || segRect.height < 0.5) continue;

          textSnapshots.push({
            rect: segRect,
            text: applyTextTransform(cleanSeg),
            winAnsi: seg.winAnsi,
            rawFont,
            isBold,
            isItalic,
            fontSizePt,
            fontSizePx,
            ascentPx,
            fontCss,
            color,
            underline: deco.includes('underline') || Boolean(href),
            strike: deco.includes('line-through'),
            href,
          });
        }
      }
    }

    // 3b. Embed real TrueType (.ttf) fonts for every typeface & style present in the document
    const fontRequests: Array<{ rawFont: string; bold: boolean; italic: boolean }> = [
      { rawFont: 'Calibri', bold: false, italic: false },
      { rawFont: 'Calibri', bold: true, italic: false },
    ];
    for (const mk of markerSnapshots) {
      fontRequests.push({ rawFont: mk.rawFont, bold: false, italic: false });
    }
    for (const run of textSnapshots) {
      if (run.winAnsi) {
        fontRequests.push({ rawFont: run.rawFont, bold: run.isBold, italic: run.isItalic });
      }
    }
    const resolveFont = await buildTrueTypeFontResolver(pdf, fontRequests);

    // 4. Render every page from the measured DOM snapshots
    const pageColor = (options?.pageColor || '#ffffff').trim();
    const pageBgRgb = parseColor(pageColor, [255, 255, 255]);
    const isNonWhiteBg = pageColor.toLowerCase() !== '#ffffff' && pageColor.toLowerCase() !== '#fff';

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      if (pIdx > 0) pdf.addPage([pdfWidthMm, pdfHeightMm], orientation);

      if (isNonWhiteBg) {
        pdf.setFillColor(pageBgRgb[0], pageBgRgb[1], pageBgRgb[2]);
        pdf.rect(0, 0, pdfWidthMm, pdfHeightMm, 'F');
      }

      const sheetEl = isPaginated ? sheetEls[pIdx] : sheetEls[0];
      const sRect = sheetEl.getBoundingClientRect();
      const pxToMmX = pdfWidthMm / Math.max(1, sRect.width);
      const pxToMmY = isPaginated
        ? pdfHeightMm / Math.max(1, sRect.height)
        : pdfWidthMm / Math.max(1, sRect.width);

      const bandTop = isPaginated
        ? sRect.top + headerBandPx
        : cRect.top + pIdx * continuousBodyWindowPx;
      const bandBottom = isPaginated
        ? sRect.bottom - footerBandPx
        : cRect.top + (pIdx + 1) * continuousBodyWindowPx;

      const toPdfX = (px: number) => (px - sRect.left) * pxToMmX;
      const toPdfY = (px: number) =>
        isPaginated ? (px - sRect.top) * pxToMmY : margins.top + (px - bandTop) * pxToMmY;

      const clipTopMm = isPaginated ? headerBandPx * pxToMmY : margins.top;
      const clipHeightMm = isPaginated
        ? (sRect.height - headerBandPx - footerBandPx) * pxToMmY
        : continuousBodyWindowPx * pxToMmY;

      const canClip =
        typeof (pdf as any).clip === 'function' && typeof (pdf as any).discardPath === 'function';
      if (canClip) {
        pdf.saveGraphicsState();
        (pdf as any).rect(0, clipTopMm, pdfWidthMm, clipHeightMm, null);
        (pdf as any).clip();
        (pdf as any).discardPath();
      }

      const inBand = (r: DOMRect) =>
        r.width > 0.1 && r.height > 0.1 && r.bottom > bandTop + 0.5 && r.top < bandBottom - 0.5;

      // Pass A: Boxes, Backgrounds, Table Cells, Borders, Checkboxes
      for (const box of boxSnapshots) {
        if (!inBand(box.rect)) continue;
        const xMm = toPdfX(box.rect.left);
        const yMm = toPdfY(box.rect.top);
        const wMm = box.rect.width * pxToMmX;
        const hMm = box.rect.height * pxToMmY;
        const rMm = Math.min(wMm / 2, hMm / 2, box.radiusPx * pxToMmX);

        if (box.isCheckbox) {
          pdf.setFillColor(box.checked ? 36 : 255, box.checked ? 92 : 255, box.checked ? 69 : 255);
          pdf.setDrawColor(box.checked ? 36 : 148, box.checked ? 92 : 163, box.checked ? 69 : 184);
          pdf.setLineWidth(0.35);
          pdf.roundedRect(xMm, yMm, wMm, hMm, 0.7, 0.7, 'FD');
          if (box.checked) {
            pdf.setDrawColor(255, 255, 255);
            pdf.setLineWidth(0.45);
            pdf.line(xMm + wMm * 0.22, yMm + hMm * 0.52, xMm + wMm * 0.44, yMm + hMm * 0.74);
            pdf.line(xMm + wMm * 0.44, yMm + hMm * 0.74, xMm + wMm * 0.8, yMm + hMm * 0.28);
          }
          continue;
        }

        if (box.bg) {
          const GState = (pdf as any).GState;
          const useAlpha = box.bg.a < 0.99 && GState;
          if (useAlpha) {
            pdf.saveGraphicsState();
            pdf.setGState(new GState({ opacity: box.bg.a }));
          }
          pdf.setFillColor(box.bg.r, box.bg.g, box.bg.b);
          if (rMm > 0.35) {
            pdf.roundedRect(xMm, yMm, wMm, hMm, rMm, rMm, 'F');
          } else {
            pdf.rect(xMm, yMm, wMm, hMm, 'F');
          }
          if (useAlpha) pdf.restoreGraphicsState();
        }

        const { top, right, bottom, left } = box.borders;
        const uniformSides =
          top.color &&
          right.color &&
          bottom.color &&
          left.color &&
          top.w === right.w &&
          top.w === bottom.w &&
          top.w === left.w &&
          top.style === right.style &&
          top.style === bottom.style &&
          top.style === left.style &&
          top.color.r === right.color.r &&
          top.color.g === right.color.g &&
          top.color.b === right.color.b;

        if (uniformSides && top.color) {
          pdf.setDrawColor(top.color.r, top.color.g, top.color.b);
          pdf.setLineWidth(Math.max(0.18, top.w * pxToMmX));
          if (top.style === 'dashed') pdf.setLineDashPattern([1.6, 1.2], 0);
          else if (top.style === 'dotted') pdf.setLineDashPattern([0.5, 0.7], 0);
          else pdf.setLineDashPattern([], 0);
          if (rMm > 0.35) {
            pdf.roundedRect(xMm, yMm, wMm, hMm, rMm, rMm, 'S');
          } else {
            pdf.rect(xMm, yMm, wMm, hMm, 'S');
          }
          pdf.setLineDashPattern([], 0);
        } else {
          const drawEdge = (
            side: { w: number; style: string; color: RgbaColor | null },
            x1: number,
            y1: number,
            x2: number,
            y2: number
          ) => {
            if (!side.color || side.w <= 0.05) return;
            pdf.setDrawColor(side.color.r, side.color.g, side.color.b);
            pdf.setLineWidth(Math.max(0.18, side.w * pxToMmX));
            if (side.style === 'dashed') pdf.setLineDashPattern([1.6, 1.2], 0);
            else if (side.style === 'dotted') pdf.setLineDashPattern([0.5, 0.7], 0);
            else pdf.setLineDashPattern([], 0);
            pdf.line(x1, y1, x2, y2);
            pdf.setLineDashPattern([], 0);
          };
          drawEdge(top, xMm, yMm, xMm + wMm, yMm);
          drawEdge(bottom, xMm, yMm + hMm, xMm + wMm, yMm + hMm);
          drawEdge(left, xMm, yMm, xMm, yMm + hMm);
          drawEdge(right, xMm + wMm, yMm, xMm + wMm, yMm + hMm);
        }
      }

      // Pass B: Rasterized Images, SVG Diagrams, Charts, Math Radicals
      for (const item of rasterSnapshots) {
        if (!inBand(item.rect)) continue;
        const xMm = toPdfX(item.rect.left);
        const yMm = toPdfY(item.rect.top);
        const wMm = item.rect.width * pxToMmX;
        const hMm = item.rect.height * pxToMmY;
        try {
          pdf.addImage(item.dataUrl, 'PNG', xMm, yMm, wMm, hMm, undefined, 'FAST');
        } catch {
          // skip corrupt image
        }
      }

      // Pass C: Native List Markers (bullets & numbers)
      for (const mk of markerSnapshots) {
        if (!inBand(mk.rect)) continue;
        const fPt = mk.fontSizePx * (72 / 96);
        const yMidMm = toPdfY(mk.rect.top) + Math.min(mk.rect.height * pxToMmY * 0.48, fPt * PT_TO_MM * 0.45);
        const yBaseMm = toPdfY(mk.rect.top) + Math.min(mk.rect.height * pxToMmY * 0.8, fPt * PT_TO_MM * 0.8);
        const xRightMm = toPdfX(mk.rect.left) - 1.8;

        if (mk.kind === 'ol') {
          const resolvedMkFont = resolveFont(mk.rawFont, false, false);
          pdf.setFont(resolvedMkFont.fontName, resolvedMkFont.style);
          pdf.setFontSize(fPt);
          pdf.setTextColor(mk.color.r, mk.color.g, mk.color.b);
          pdf.text(mk.label, xRightMm, yBaseMm, { align: 'right' });
        } else {
          pdf.setFillColor(mk.color.r, mk.color.g, mk.color.b);
          pdf.setDrawColor(mk.color.r, mk.color.g, mk.color.b);
          pdf.setLineWidth(0.22);
          const bx = xRightMm - 0.8;
          if (mk.depth % 3 === 1) {
            pdf.circle(bx, yMidMm, 0.72, 'S');
          } else if (mk.depth % 3 === 2) {
            pdf.rect(bx - 0.65, yMidMm - 0.65, 1.3, 1.3, 'F');
          } else {
            pdf.circle(bx, yMidMm, 0.72, 'F');
          }
        }
      }

      // Pass D: Selectable Vector Text + Crisp Inline Non-WinAnsi / Emoji Micro-Sprites
      for (const run of textSnapshots) {
        if (!inBand(run.rect)) continue;
        const xMm = toPdfX(run.rect.left);
        const yTopMm = toPdfY(run.rect.top);
        const wMm = run.rect.width * pxToMmX;
        const hMm = run.rect.height * pxToMmY;

        if (run.winAnsi) {
          const resolvedRunFont = resolveFont(run.rawFont, run.isBold, run.isItalic);
          pdf.setFont(resolvedRunFont.fontName, resolvedRunFont.style);
          pdf.setFontSize(run.fontSizePt);
          pdf.setTextColor(run.color.r, run.color.g, run.color.b);

          const useSyntheticBold = Boolean(resolvedRunFont.needsSyntheticBold);
          if (useSyntheticBold) {
            pdf.setDrawColor(run.color.r, run.color.g, run.color.b);
            pdf.setLineWidth(Math.max(0.11, run.fontSizePt * PT_TO_MM * 0.032));
            (pdf as any).internal?.write?.('2 Tr');
            try {
              const pdfW = pdf.getTextWidth(run.text);
              if (run.text.length > 1 && wMm > pdfW + 0.15) {
                const charDelta = Math.min(run.fontSizePt * PT_TO_MM * 0.08, (wMm - pdfW) / run.text.length);
                pdf.setCharSpace(charDelta);
              }
            } catch {
              // ignore charSpace calculation fallback
            }
          }

          const baselineMm = yTopMm + Math.min(hMm * 0.84, run.ascentPx * pxToMmY);
          if (run.href) {
            pdf.textWithLink(run.text, xMm, baselineMm, { url: run.href });
          } else {
            pdf.text(run.text, xMm, baselineMm);
          }

          if (useSyntheticBold) {
            try {
              pdf.setCharSpace(0);
            } catch {
              // ignore
            }
            (pdf as any).internal?.write?.('0 Tr');
          }

          if (run.underline) {
            pdf.setDrawColor(run.color.r, run.color.g, run.color.b);
            pdf.setLineWidth(0.2);
            pdf.line(xMm, baselineMm + 0.55, xMm + wMm, baselineMm + 0.55);
          }
          if (run.strike) {
            pdf.setDrawColor(run.color.r, run.color.g, run.color.b);
            pdf.setLineWidth(0.2);
            const strikeY = baselineMm - run.fontSizePt * PT_TO_MM * 0.3;
            pdf.line(xMm, strikeY, xMm + wMm, strikeY);
          }
        } else {
          drawMicroGlyphSprite(
            pdf,
            run.text,
            xMm,
            yTopMm,
            wMm,
            hMm,
            run.fontCss,
            `rgb(${run.color.r}, ${run.color.g}, ${run.color.b})`
          );
        }
      }

      if (canClip) {
        pdf.restoreGraphicsState();
      }
    }

    // 5. Final Chrome Pass: Borders, Headers, Footers, Page Numbers, Watermark
    renderPdfChromePass(pdf, totalPages, pdfWidthMm, pdfHeightMm, margins, options, resolveFont, 'Calibri');
    return { pdf, filename: `${safeTitle}.pdf` };
  } finally {
    if (scalerEl) {
      scalerEl.style.transform = prevTransform;
      scalerEl.style.transition = prevTransition;
    }
  }
}

export async function exportToPdf(
  title: string,
  options?: PdfExportOptions
): Promise<void> {
  const domResult = await renderDomWorkspaceToPdf(title, options);
  if (domResult) {
    domResult.pdf.save(domResult.filename);
    return;
  }
  const { pdf, filename } = await buildVectorPdf(title, options);
  pdf.save(filename);
}

export function triggerPrintPdf(options?: {
  title?: string;
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins | MarginPreset;
}) {
  const orientation = options?.orientation || 'portrait';
  const pageSize = options?.pageSize || 'A4';

  const styleId = 'docium-print-page-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  const sizeSpec = PAPER_SIZES_MM[pageSize as keyof typeof PAPER_SIZES_MM] || PAPER_SIZES_MM.A4;
  const wMm = orientation === 'portrait' ? Math.min(sizeSpec.width, sizeSpec.height) : Math.max(sizeSpec.width, sizeSpec.height);
  const hMm = orientation === 'portrait' ? Math.max(sizeSpec.width, sizeSpec.height) : Math.min(sizeSpec.width, sizeSpec.height);

  // Use zero page margin in @page because physical .docium-paper-sheet already carries its exact WYSIWYG dimensions & margins
  const printCss = `
    @media print {
      @page {
        size: ${wMm}mm ${hMm}mm;
        margin: 0 !important;
      }
    }
  `;

  styleEl.textContent = printCss;

  setTimeout(() => {
    window.print();
  }, 80);
}
