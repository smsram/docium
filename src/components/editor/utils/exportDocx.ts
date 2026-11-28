/**
 * Native OpenXML (.docx) & Document Exporter Utility
 *
 * Generates genuine ISO/IEC 29500 OpenXML (.docx) files via `docx` so that:
 * - Page size, orientation, margins, columns, page borders, page background color, headers, footers,
 *   page numbers, and diagonal watermarks match the workspace page 1:1.
 * - Typography (Calibri 11pt default, H1-H6 sizes & colors, inline fonts, sizes, colors, highlights,
 *   links, sub/superscript, line spacing, paragraph spacing, and indentation) matches the editor 1:1.
 * - Tables export as native adjustable Word tables (auto-merging pagination-split continuation tables,
 *   preserving column widths, merged cells, cell shading, borders, and repeating header rows).
 * - Shapes & Text Boxes export as native editable DrawingML shapes (`ShapeRun`) adjustable in Word.
 * - Images, Charts & Drawings export as native resizable `ImageRun` pictures in Word.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Math as DocxMath,
  MathFraction,
  MathIntegral,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
  Packer,
  PageBreak as DocxPageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table as DocxTable,
  TableCell as DocxTableCell,
  TableLayoutType,
  TableRow as DocxTableRow,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  UnderlineType,
  VerticalAlign,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx';
import { ShapeRun, type PresetShapeType, type ShapeFloating, type LineDash } from 'docx/shapes';
import { TextWatermark } from 'docx/watermarks';
import {
  DocumentMargins,
  DocumentOrientation,
  DocumentPageSize,
  MarginPreset,
} from '@/lib/types';
import { PAPER_SIZES_MM, getResolvedMargins } from './pageMetrics';
import { formatMathExpression } from '../extensions/EquationNode';
import { fetchTrueTypeFontBytes, normalizeExportFontName } from './fontLoader';

export interface DocxExportOptions {
  jsonContent?: Record<string, any>;
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
  defaultFontFamily?: string;
}

const MM_TO_TWIPS = 56.6929134; // 1 inch = 25.4mm = 1440 twips -> 56.6929 twips/mm
const PT_TO_HALF_PT = 2;
const PT_TO_TWIPS = 20;

function cleanHex(color: string | null | undefined, fallback = '171C19'): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return hex
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase();
    }
    if (hex.length >= 6) {
      return hex.slice(0, 6).toUpperCase();
    }
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1], 10)).toString(16).padStart(2, '0');
    const g = Math.min(255, parseInt(rgbMatch[2], 10)).toString(16).padStart(2, '0');
    const b = Math.min(255, parseInt(rgbMatch[3], 10)).toString(16).padStart(2, '0');
    return `${r}${g}${b}`.toUpperCase();
  }
  return fallback;
}

function parsePtSize(raw: string | number | null | undefined, fallbackPt: number): number {
  if (raw === null || raw === undefined || raw === '') return fallbackPt;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s.endsWith('pt')) {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : fallbackPt;
  }
  if (s.endsWith('px')) {
    const px = parseFloat(s);
    return Number.isFinite(px) ? Math.round((px * 72) / 96 * 2) / 2 : fallbackPt;
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallbackPt;
}

function primaryFontName(raw: string | null | undefined, fallback = 'Calibri'): string {
  return normalizeExportFontName(raw, fallback);
}

function mapAlignment(align?: string | null) {
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  if (align === 'justify') return AlignmentType.BOTH;
  return AlignmentType.LEFT;
}

function mapDociumShapeToPreset(shapeType: string): PresetShapeType {
  const map: Record<string, PresetShapeType> = {
    rectangle: 'rectangle',
    'rounded-rectangle': 'roundedRectangle',
    ellipse: 'ellipse',
    triangle: 'triangle',
    'right-triangle': 'rightTriangle',
    diamond: 'diamond',
    pentagon: 'pentagon',
    hexagon: 'hexagon',
    octagon: 'octagon',
    cross: 'cross',
    heart: 'heart',
    cloud: 'cloud',
    star: 'star5',
    'star-4': 'star4',
    banner: 'chevron',
    callout: 'rectangularCallout',
    'oval-callout': 'ellipticalCallout',
    line: 'line',
    arrow: 'line',
    'left-arrow': 'line',
    'double-arrow': 'line',
    'block-arrow-right': 'rightArrow',
    'block-arrow-left': 'leftArrow',
    'block-arrow-up': 'upArrow',
    'block-arrow-down': 'downArrow',
    connector: 'elbowConnector',
    process: 'flowChartProcess',
    decision: 'flowChartDecision',
    terminator: 'flowChartTerminator',
    document: 'flowChartDocument',
    data: 'flowChartInputOutput',
    database: 'cylinder',
  };
  return map[shapeType] || 'rectangle';
}

function buildFloatingSpec(alignMode: string): ShapeFloating | undefined {
  if (alignMode === 'float-left') {
    return {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.MARGIN,
        align: HorizontalPositionAlign.LEFT,
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PARAGRAPH,
        offset: 0,
      },
      wrap: {
        type: TextWrappingType.SQUARE,
        side: TextWrappingSide.RIGHT,
      },
      margins: { top: 45720, bottom: 45720, left: 0, right: 114300 },
    };
  }
  if (alignMode === 'float-right') {
    return {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.MARGIN,
        align: HorizontalPositionAlign.RIGHT,
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PARAGRAPH,
        offset: 0,
      },
      wrap: {
        type: TextWrappingType.SQUARE,
        side: TextWrappingSide.LEFT,
      },
      margins: { top: 45720, bottom: 45720, left: 114300, right: 0 },
    };
  }
  return undefined;
}

async function rasterizeImageViaDom(
  src: string,
  targetW?: number,
  targetH?: number
): Promise<{ data: Uint8Array; type: 'png'; width: number; height: number } | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return await new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const natW = img.naturalWidth || targetW || 400;
      const natH = img.naturalHeight || targetH || 260;
      const outW = targetW && targetW > 0 ? targetW : Math.min(560, natW);
      const outH =
        targetH && targetH > 0
          ? targetH
          : Math.max(24, Math.round(outW * (natH / Math.max(1, natW))));
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(natW * scale));
      canvas.height = Math.max(2, Math.round(natH * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        blob.arrayBuffer().then((buf) => {
          resolve({ data: new Uint8Array(buf), type: 'png', width: outW, height: outH });
        });
      }, 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function resolveImageBytes(
  src: string,
  targetW = 400,
  targetH?: number
): Promise<{ data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number } | null> {
  if (!src || typeof window === 'undefined') return null;

  try {
    // Rasterize SVG, WebP, AVIF, etc. to crisp 2x PNG so every version of Word displays them reliably
    if (
      src.startsWith('data:image/svg+xml') ||
      src.startsWith('data:image/webp') ||
      src.startsWith('data:image/avif')
    ) {
      return await rasterizeImageViaDom(src, targetW, targetH);
    }

    if (src.startsWith('data:image/')) {
      const mimeMatch = src.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.*)$/);
      if (mimeMatch) {
        const rawExt = mimeMatch[1].toLowerCase();
        if (rawExt !== 'png' && rawExt !== 'jpeg' && rawExt !== 'jpg' && rawExt !== 'gif' && rawExt !== 'bmp') {
          return await rasterizeImageViaDom(src, targetW, targetH);
        }
        const type: 'png' | 'jpg' | 'gif' | 'bmp' =
          rawExt === 'jpeg' || rawExt === 'jpg'
            ? 'jpg'
            : rawExt === 'gif'
            ? 'gif'
            : rawExt === 'bmp'
            ? 'bmp'
            : 'png';
        const binary = atob(mimeMatch[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        let resolvedW = targetW;
        let resolvedH = targetH || 0;
        if (!resolvedH && typeof window !== 'undefined') {
          const measured = await new Promise<{ w: number; h: number } | null>((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = src;
          });
          resolvedH =
            measured && measured.w > 0
              ? Math.max(24, Math.round(resolvedW * (measured.h / measured.w)))
              : Math.round(resolvedW * 0.62);
        }
        return { data: bytes, type, width: resolvedW, height: resolvedH || Math.round(resolvedW * 0.62) };
      }
    }

    const resp = await fetch(src);
    if (!resp.ok) return null;
    const contentType = (resp.headers.get('content-type') || 'image/png').toLowerCase();
    if (contentType.includes('svg') || contentType.includes('webp') || contentType.includes('avif')) {
      return await rasterizeImageViaDom(src, targetW, targetH);
    }
    const buf = await resp.arrayBuffer();
    const type: 'png' | 'jpg' | 'gif' | 'bmp' = contentType.includes('jpeg') || contentType.includes('jpg')
      ? 'jpg'
      : contentType.includes('gif')
      ? 'gif'
      : contentType.includes('bmp')
      ? 'bmp'
      : 'png';
    let resolvedH = targetH || 0;
    if (!resolvedH && typeof window !== 'undefined') {
      const measured = await new Promise<{ w: number; h: number } | null>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = src;
      });
      resolvedH =
        measured && measured.w > 0
          ? Math.max(24, Math.round(targetW * (measured.h / measured.w)))
          : Math.round(targetW * 0.62);
    }
    return { data: new Uint8Array(buf), type, width: targetW, height: resolvedH || Math.round(targetW * 0.62) };
  } catch {
    return null;
  }
}

/**
 * Fallback minimal HTML -> ProseMirror-like JSON converter when exportToDocx is called with raw HTML string only.
 */
function parseHtmlFallbackToJson(html: string): Record<string, any> {
  if (typeof DOMParser === 'undefined') {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: html.replace(/<[^>]+>/g, '') }] }] };
  }
  const dom = new DOMParser().parseFromString(html, 'text/html');

  const parseInlineNodes = (el: Element, activeMarks: any[] = []): any[] => {
    const out: any[] = [];
    el.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        const txt = child.textContent || '';
        if (txt) {
          out.push({ type: 'text', text: txt, marks: activeMarks });
        }
      } else if (child.nodeType === 1) {
        const cel = child as HTMLElement;
        const tag = cel.tagName.toLowerCase();
        if (tag === 'br') {
          out.push({ type: 'hardBreak' });
          return;
        }
        if (cel.getAttribute('data-type') === 'docium-inline-equation') {
          out.push({
            type: 'inlineEquation',
            attrs: { latex: cel.getAttribute('data-latex') || cel.textContent || '' },
          });
          return;
        }
        const nextMarks = [...activeMarks];
        if (tag === 'strong' || tag === 'b') nextMarks.push({ type: 'bold' });
        if (tag === 'em' || tag === 'i') nextMarks.push({ type: 'italic' });
        if (tag === 'u') nextMarks.push({ type: 'underline' });
        if (tag === 's' || tag === 'strike' || tag === 'del') nextMarks.push({ type: 'strike' });
        if (tag === 'code') nextMarks.push({ type: 'code' });
        if (tag === 'sub') nextMarks.push({ type: 'subscript' });
        if (tag === 'sup') nextMarks.push({ type: 'superscript' });
        if (tag === 'a' && cel.getAttribute('href')) {
          nextMarks.push({ type: 'link', attrs: { href: cel.getAttribute('href') } });
        }
        if (tag === 'mark') {
          nextMarks.push({ type: 'highlight', attrs: { color: cel.style.backgroundColor || '#FEF08A' } });
        }
        if (cel.style?.color) {
          nextMarks.push({ type: 'textStyle', attrs: { color: cel.style.color } });
        }
        if (cel.style?.fontSize) {
          nextMarks.push({ type: 'fontSize', attrs: { size: cel.style.fontSize } });
        }
        if (cel.style?.fontFamily) {
          nextMarks.push({ type: 'fontFamily', attrs: { font: cel.style.fontFamily } });
        }
        out.push(...parseInlineNodes(cel, nextMarks));
      }
    });
    return out;
  };

  interface InheritedInlineStyle {
    fontFamily?: string;
    fontSize?: string;
    color?: string;
  }

  function mergeInheritedStyle(base: InheritedInlineStyle | undefined, el: HTMLElement): InheritedInlineStyle {
    return {
      fontFamily: el.style?.fontFamily || base?.fontFamily,
      fontSize: el.style?.fontSize || base?.fontSize,
      color: el.style?.color || base?.color,
    };
  }

  function applyInheritedInlineMarks(nodes: any[], inherited?: InheritedInlineStyle): any[] {
    if (!inherited || (!inherited.fontFamily && !inherited.fontSize && !inherited.color)) return nodes;
    return nodes.map((n) => {
      if (n.type !== 'text') return n;
      const marks = Array.isArray(n.marks) ? [...n.marks] : [];
      const hasFont = marks.some((m) => (m.type === 'fontFamily' && m.attrs?.font) || (m.type === 'textStyle' && m.attrs?.fontFamily));
      const hasSize = marks.some((m) => (m.type === 'fontSize' && m.attrs?.size) || (m.type === 'textStyle' && m.attrs?.fontSize));
      const hasColor = marks.some((m) => m.type === 'textStyle' && m.attrs?.color);
      if (!hasFont && inherited.fontFamily) marks.push({ type: 'fontFamily', attrs: { font: inherited.fontFamily } });
      if (!hasSize && inherited.fontSize) marks.push({ type: 'fontSize', attrs: { size: inherited.fontSize } });
      if (!hasColor && inherited.color) marks.push({ type: 'textStyle', attrs: { color: inherited.color } });
      return marks.length > 0 ? { ...n, marks } : n;
    });
  }

  const parseBlockElements = (parent: Element, inherited?: InheritedInlineStyle): any[] => {
    const blocks: any[] = [];
    Array.from(parent.children).forEach((el) => {
      const hel = el as HTMLElement;
      const tag = hel.tagName.toLowerCase();
      const dataType = hel.getAttribute('data-type');
      const nextInherited = mergeInheritedStyle(inherited, hel);

      if (dataType === 'page-break' || hel.classList.contains('docium-page-break')) {
        blocks.push({ type: 'pageBreak' });
      } else if (dataType === 'docium-shape') {
        blocks.push({
          type: 'shape',
          attrs: {
            shapeType: hel.getAttribute('data-shape-type') || 'rectangle',
            width: parseInt(hel.getAttribute('data-width') || '180', 10),
            height: parseInt(hel.getAttribute('data-height') || '110', 10),
            fill: hel.getAttribute('data-fill') || '#EAF2ED',
            stroke: hel.getAttribute('data-stroke') || '#245C45',
            strokeWidth: parseInt(hel.getAttribute('data-stroke-width') || '2', 10),
            strokeStyle: hel.getAttribute('data-stroke-style') || 'solid',
            rotation: parseInt(hel.getAttribute('data-rotation') || '0', 10),
            alignment: hel.getAttribute('data-alignment') || 'center',
            text: hel.getAttribute('data-text') || '',
            textColor: hel.getAttribute('data-text-color') || '#171C19',
          },
        });
      } else if (dataType === 'docium-textbox') {
        blocks.push({
          type: 'textBox',
          attrs: {
            width: parseInt(hel.getAttribute('data-width') || '0', 10),
            minHeight: parseInt(hel.getAttribute('data-min-height') || '64', 10),
            fill: hel.getAttribute('data-fill') || '#FFFFFF',
            borderColor: hel.getAttribute('data-border-color') || '#245C45',
            borderWidth: parseInt(hel.getAttribute('data-border-width') || '1', 10),
            borderStyle: hel.getAttribute('data-border-style') || 'solid',
            alignment: hel.getAttribute('data-alignment') || 'full',
          },
          content: parseBlockElements(hel, nextInherited),
        });
      } else if (dataType === 'callout') {
        blocks.push({
          type: 'callout',
          attrs: { type: hel.getAttribute('data-callout-type') || 'info' },
          content: parseBlockElements(hel, nextInherited),
        });
      } else if (dataType === 'docium-equation') {
        blocks.push({
          type: 'equation',
          attrs: { latex: hel.getAttribute('data-latex') || hel.textContent || '' },
        });
      } else if (/^h[1-6]$/.test(tag)) {
        blocks.push({
          type: 'heading',
          attrs: { level: parseInt(tag[1], 10), textAlign: hel.style.textAlign || 'left' },
          content: applyInheritedInlineMarks(parseInlineNodes(hel), nextInherited),
        });
      } else if (tag === 'p') {
        blocks.push({
          type: 'paragraph',
          attrs: { textAlign: hel.style.textAlign || 'left' },
          content: applyInheritedInlineMarks(parseInlineNodes(hel), nextInherited),
        });
      } else if (tag === 'ul' || tag === 'ol') {
        const isTask = hel.getAttribute('data-type') === 'taskList';
        const items = Array.from(hel.children)
          .filter((li) => li.tagName.toLowerCase() === 'li')
          .map((li) => {
            const liEl = li as HTMLElement;
            const liInherited = mergeInheritedStyle(nextInherited, liEl);
            return {
              type: isTask ? 'taskItem' : 'listItem',
              attrs: isTask ? { checked: liEl.getAttribute('data-checked') === 'true' } : {},
              content:
                liEl.querySelector('p')
                  ? parseBlockElements(liEl, liInherited)
                  : [{ type: 'paragraph', content: applyInheritedInlineMarks(parseInlineNodes(liEl), liInherited) }],
            };
          });
        blocks.push({
          type: isTask ? 'taskList' : tag === 'ol' ? 'orderedList' : 'bulletList',
          content: items,
        });
      } else if (tag === 'blockquote') {
        blocks.push({
          type: 'blockquote',
          content:
            hel.children.length > 0
              ? parseBlockElements(hel, nextInherited)
              : [{ type: 'paragraph', content: applyInheritedInlineMarks(parseInlineNodes(hel), nextInherited) }],
        });
      } else if (tag === 'pre' || hel.getAttribute('data-type') === 'docium-codeblock') {
        const clone = hel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-docium-ui-only="true"], [data-codeblock-ui="true"]').forEach((n) => n.remove());
        const codeEl = clone.querySelector('code') || clone.querySelector('pre') || clone;
        blocks.push({
          type: 'codeBlock',
          attrs: { language: hel.getAttribute('data-language') || 'plaintext' },
          content: [{ type: 'text', text: codeEl.textContent || '' }],
        });
      } else if (tag === 'hr') {
        blocks.push({ type: 'horizontalRule' });
      } else if (tag === 'img') {
        blocks.push({
          type: 'image',
          attrs: {
            src: hel.getAttribute('src') || '',
            width: parseInt(hel.getAttribute('width') || '0', 10) || null,
            height: parseInt(hel.getAttribute('height') || '0', 10) || null,
          },
        });
      } else if (tag === 'table' || hel.classList.contains('tableWrapper')) {
        const tbl = tag === 'table' ? hel : hel.querySelector('table');
        if (tbl) {
          const rows = Array.from(tbl.querySelectorAll('tr')).map((tr) => ({
            type: 'tableRow',
            content: Array.from(tr.children).map((cell) => {
              const cel = cell as HTMLElement;
              const isHeader = cel.tagName.toLowerCase() === 'th';
              const cellInherited = mergeInheritedStyle(nextInherited, cel);
              return {
                type: isHeader ? 'tableHeader' : 'tableCell',
                attrs: {
                  colspan: parseInt(cel.getAttribute('colspan') || '1', 10),
                  rowspan: parseInt(cel.getAttribute('rowspan') || '1', 10),
                  backgroundColor: cel.getAttribute('data-bg-color') || cel.style.backgroundColor || null,
                },
                content:
                  cel.children.length > 0
                    ? parseBlockElements(cel, cellInherited)
                    : [{ type: 'paragraph', content: applyInheritedInlineMarks(parseInlineNodes(cel), cellInherited) }],
              };
            }),
          }));
          blocks.push({
            type: 'table',
            attrs: { isContinuation: tbl.getAttribute('data-split-continuation') === 'true' },
            content: rows,
          });
        }
      } else if (hel.children.length > 0) {
        blocks.push(...parseBlockElements(hel, nextInherited));
      }
    });
    return blocks;
  };

  // Upgrade legacy <font face color> attributes before walking blocks
  dom.body.querySelectorAll('font').forEach((fontEl) => {
    const face = fontEl.getAttribute('face');
    const color = fontEl.getAttribute('color');
    const span = dom.createElement('span');
    if (face) span.style.fontFamily = face;
    if (color) span.style.color = color;
    while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
    fontEl.replaceWith(span);
  });

  return { type: 'doc', content: parseBlockElements(dom.body) };
}

/**
 * Reads live workspace table column widths (without mutating source ProseMirror JSON
 * or injecting hard page breaks on soft-wrapped blocks that would collide with Word's natural pagination).
 */
function annotateNodesFromWorkspaceDom(rawNodes: any[]): any[] {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof document.getElementById !== 'function' ||
    rawNodes.length === 0
  ) {
    return rawNodes;
  }

  const paginatedSheet = document.getElementById('docium-paginated-sheet');
  const contentEl = paginatedSheet?.querySelector('.docium-paper-content') as HTMLElement | null;
  const tiptapEl = contentEl?.querySelector('.tiptap') as HTMLElement | null;
  if (!paginatedSheet || !contentEl || !tiptapEl) return rawNodes;

  const domChildren = Array.from(tiptapEl.children) as HTMLElement[];
  if (domChildren.length !== rawNodes.length) {
    return rawNodes;
  }

  const scalerEl = paginatedSheet.closest('.docium-zoom-scaler') as HTMLElement | null;
  const prevTransform = scalerEl?.style.transform || '';
  const prevTransition = scalerEl?.style.transition || '';
  if (scalerEl) {
    scalerEl.style.transition = 'none';
    scalerEl.style.transform = 'scale(1)';
    void scalerEl.offsetHeight;
  }

  try {
    return rawNodes.map((node, idx) => {
      const el = domChildren[idx];
      let measuredCols: number[] | undefined;
      if (node.type === 'table') {
        const tbl = el.tagName === 'TABLE' ? el : el.querySelector('table');
        const firstRow = tbl?.querySelector('tr');
        if (firstRow) {
          const cols: number[] = [];
          Array.from(firstRow.children).forEach((cell) => {
            const cEl = cell as HTMLElement;
            const span = Math.max(1, parseInt(cEl.getAttribute('colspan') || '1', 10) || 1);
            const cellW = Math.max(24, cEl.getBoundingClientRect().width / span);
            for (let s = 0; s < span; s++) cols.push(cellW);
          });
          if (cols.length > 0) measuredCols = cols;
        }
      }

      if (!measuredCols) return node;
      return {
        ...node,
        attrs: {
          ...(node.attrs || {}),
          _measuredColWidthsPx: measuredCols,
        },
      };
    });
  } finally {
    if (scalerEl) {
      scalerEl.style.transform = prevTransform;
      scalerEl.style.transition = prevTransition;
    }
  }
}

/**
 * Merges adjacent tables that were automatically split by PaginatedCanvas (`isContinuation: true`)
 * back into a single unified table for Word export so Word flows and repeats headers naturally.
 */
function mergeContinuationNodes(nodes: any[]): any[] {
  const merged: any[] = [];
  for (const node of nodes) {
    if (
      node.type === 'table' &&
      node.attrs?.isContinuation &&
      merged.length > 0 &&
      merged[merged.length - 1].type === 'table'
    ) {
      const prev = merged[merged.length - 1];
      merged[merged.length - 1] = {
        ...prev,
        content: [...(prev.content || []), ...(node.content || [])],
      };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

const LATEX_SYMBOL_MAP: Record<string, string> = {
  '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷', '\\cdot': '·',
  '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
  '\\approx': '≈', '\\equiv': '≡', '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
  '\\rightarrow': '→', '\\to': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒', '\\Leftrightarrow': '⇔',
  '\\dots': '…', '\\ldots': '…', '\\cdots': '⋯',
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
  '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
  '\\nu': 'ν', '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
  '\\phi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Sigma': 'Σ', '\\Omega': 'Ω',
  '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\log': 'log', '\\ln': 'ln', '\\lim': 'lim',
  '\\,': ' ', '\\;': ' ', '\\quad': '  ', '\\ ': ' ',
};

function readBalancedGroup(src: string, startIdx: number): { content: string; nextIdx: number } {
  let i = startIdx;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (i >= src.length) return { content: '', nextIdx: i };
  if (src[i] === '{') {
    let depth = 0;
    const begin = i + 1;
    while (i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          return { content: src.slice(begin, i), nextIdx: i + 1 };
        }
      }
      i++;
    }
    return { content: src.slice(begin), nextIdx: src.length };
  }
  return { content: src[i], nextIdx: i + 1 };
}

function parseLatexToMathComponents(latex: string): MathComponent[] {
  const src = latex.trim();
  const nodes: MathComponent[] = [];
  let i = 0;
  let buffer = '';

  const flushBuffer = () => {
    if (buffer) {
      nodes.push(new MathRun(buffer));
      buffer = '';
    }
  };

  while (i < src.length) {
    const ch = src[i];

    // Check commands starting with backslash
    if (ch === '\\') {
      if (src.startsWith('\\frac', i)) {
        flushBuffer();
        const num = readBalancedGroup(src, i + 5);
        const den = readBalancedGroup(src, num.nextIdx);
        nodes.push(
          new MathFraction({
            numerator: parseLatexToMathComponents(num.content),
            denominator: parseLatexToMathComponents(den.content),
          })
        );
        i = den.nextIdx;
        continue;
      }

      if (src.startsWith('\\sqrt', i)) {
        flushBuffer();
        let cursor = i + 5;
        while (cursor < src.length && /\s/.test(src[cursor])) cursor++;
        let degree: MathComponent[] | undefined;
        if (src[cursor] === '[') {
          const closeBracket = src.indexOf(']', cursor + 1);
          if (closeBracket !== -1) {
            degree = parseLatexToMathComponents(src.slice(cursor + 1, closeBracket));
            cursor = closeBracket + 1;
          }
        }
        const inner = readBalancedGroup(src, cursor);
        nodes.push(
          new MathRadical({
            children: parseLatexToMathComponents(inner.content),
            ...(degree ? { degree } : {}),
          })
        );
        i = inner.nextIdx;
        continue;
      }

      if (src.startsWith('\\sum', i) || src.startsWith('\\int', i)) {
        const isSum = src.startsWith('\\sum', i);
        flushBuffer();
        let cursor = i + 4;
        let sub: MathComponent[] | undefined;
        let sup: MathComponent[] | undefined;
        for (let pass = 0; pass < 2; pass++) {
          while (cursor < src.length && /\s/.test(src[cursor])) cursor++;
          if (src[cursor] === '_') {
            const g = readBalancedGroup(src, cursor + 1);
            sub = parseLatexToMathComponents(g.content);
            cursor = g.nextIdx;
          } else if (src[cursor] === '^') {
            const g = readBalancedGroup(src, cursor + 1);
            sup = parseLatexToMathComponents(g.content);
            cursor = g.nextIdx;
          }
        }
        // Parse the integrand/summand space cleanly so Word renders limits without an empty placeholder box
        const dummyChild: MathComponent[] = [new MathRun(' ')];
        nodes.push(
          isSum
            ? new MathSum({ children: dummyChild, subScript: sub, superScript: sup })
            : new MathIntegral({ children: dummyChild, subScript: sub, superScript: sup })
        );
        i = cursor;
        continue;
      }

      if (src.startsWith('\\left(', i)) {
        flushBuffer();
        const closeIdx = src.indexOf('\\right)', i + 6);
        if (closeIdx !== -1) {
          nodes.push(
            new MathRoundBrackets({
              children: parseLatexToMathComponents(src.slice(i + 6, closeIdx)),
            })
          );
          i = closeIdx + 7;
          continue;
        }
      }

      if (src.startsWith('\\left', i) || src.startsWith('\\right', i)) {
        i += src.startsWith('\\left', i) ? 5 : 6;
        continue;
      }

      const cmdMatch = src.slice(i).match(/^\\[a-zA-Z]+|^\\[,; ]/);
      if (cmdMatch) {
        const cmd = cmdMatch[0];
        buffer += LATEX_SYMBOL_MAP[cmd] ?? cmd.slice(1);
        i += cmd.length;
        continue;
      }
    }

    // Handle superscripts / subscripts attached to the preceding token/node
    if (ch === '^' || ch === '_') {
      let baseNode: MathComponent | null = null;
      if (buffer.length > 0) {
        const lastChar = buffer.slice(-1);
        buffer = buffer.slice(0, -1);
        flushBuffer();
        baseNode = new MathRun(lastChar);
      } else if (nodes.length > 0) {
        baseNode = nodes.pop()!;
      } else {
        baseNode = new MathRun('');
      }

      let cursor = i;
      let sub: MathComponent[] | undefined;
      let sup: MathComponent[] | undefined;
      for (let pass = 0; pass < 2; pass++) {
        while (cursor < src.length && /\s/.test(src[cursor])) cursor++;
        if (src[cursor] === '_') {
          const g = readBalancedGroup(src, cursor + 1);
          sub = parseLatexToMathComponents(g.content);
          cursor = g.nextIdx;
        } else if (src[cursor] === '^') {
          const g = readBalancedGroup(src, cursor + 1);
          sup = parseLatexToMathComponents(g.content);
          cursor = g.nextIdx;
        }
      }

      if (sub && sup) {
        nodes.push(new MathSubSuperScript({ children: [baseNode], subScript: sub, superScript: sup }));
      } else if (sup) {
        nodes.push(new MathSuperScript({ children: [baseNode], superScript: sup }));
      } else if (sub) {
        nodes.push(new MathSubScript({ children: [baseNode], subScript: sub }));
      } else {
        nodes.push(baseNode);
      }
      i = cursor;
      continue;
    }

    if (ch === '{' || ch === '}') {
      i++;
      continue;
    }

    buffer += ch;
    i++;
  }

  flushBuffer();
  return nodes.length > 0 ? nodes : [new MathRun(formatMathExpression(src) || ' ')];
}

function latexToDocxMath(rawLatex: string): DocxMath {
  return new DocxMath({
    children: parseLatexToMathComponents(rawLatex),
  });
}

function splitTextPreservingEmojis(text: string): Array<{ text: string; isEmoji: boolean }> {
  const emojiRegex = /((?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\uFE0E|[\u{1F3FB}-\u{1F3FF}]|\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u2640|\u2642)\uFE0F?)*)/gu;
  const parts: Array<{ text: string; isEmoji: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = emojiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isEmoji: false });
    }
    parts.push({ text: match[0], isEmoji: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isEmoji: false });
  }
  return parts.length > 0 ? parts : [{ text, isEmoji: false }];
}

function buildInlineRuns(
  contentNodes: any[] | undefined,
  defaults: { fontSizePt: number; colorHex: string; bold?: boolean; italics?: boolean; fontFamily?: string }
): (TextRun | ExternalHyperlink | DocxMath)[] {
  if (!contentNodes || contentNodes.length === 0) return [];

  const children: (TextRun | ExternalHyperlink | DocxMath)[] = [];
  let lastRunFont = defaults.fontFamily || 'Calibri';
  let lastRunPt = defaults.fontSizePt;

  for (const item of contentNodes) {
    if (item.type === 'hardBreak') {
      children.push(
        new TextRun({
          break: 1,
          font: {
            name: lastRunFont,
            ascii: lastRunFont,
            hAnsi: lastRunFont,
            cs: lastRunFont,
            eastAsia: lastRunFont,
          },
          size: Math.round(lastRunPt * PT_TO_HALF_PT),
        })
      );
      continue;
    }
    if (item.type === 'inlineEquation') {
      const latex = String(item.attrs?.latex || '').trim();
      if (latex) {
        children.push(latexToDocxMath(latex));
      }
      continue;
    }
    if (item.type !== 'text' || !item.text) continue;

    const marks: any[] = item.marks || [];
    let isBold = Boolean(defaults.bold);
    let isItalic = Boolean(defaults.italics);
    let isUnderline = false;
    let isStrike = false;
    let isSub = false;
    let isSup = false;
    let isCode = false;
    let colorHex = defaults.colorHex;
    let highlightHex: string | undefined;
    let fontPt = defaults.fontSizePt;
    let fontFam = defaults.fontFamily || 'Calibri';
    let linkHref: string | undefined;

    for (const m of marks) {
      if (m.type === 'bold') isBold = true;
      else if (m.type === 'italic') isItalic = true;
      else if (m.type === 'underline') isUnderline = true;
      else if (m.type === 'strike') isStrike = true;
      else if (m.type === 'subscript') isSub = true;
      else if (m.type === 'superscript') isSup = true;
      else if (m.type === 'code') {
        isCode = true;
        fontFam = 'Consolas';
        colorHex = '245C45';
        highlightHex = 'F1F5F2';
      } else if (m.type === 'link' && m.attrs?.href) {
        linkHref = String(m.attrs.href);
      } else if (m.type === 'highlight') {
        highlightHex = cleanHex(m.attrs?.color || '#FEF08A', 'FEF08A');
      }
    }

    // Apply explicit font / size / color overrides AFTER structural & code defaults so explicit styles always win
    for (const m of marks) {
      if (m.type === 'textStyle') {
        if (m.attrs?.color) colorHex = cleanHex(m.attrs.color, colorHex);
        if (m.attrs?.fontSize) fontPt = parsePtSize(m.attrs.fontSize, fontPt);
        if (m.attrs?.fontFamily) fontFam = primaryFontName(m.attrs.fontFamily, fontFam);
      } else if (m.type === 'fontSize' && m.attrs?.size) {
        fontPt = parsePtSize(m.attrs.size, fontPt);
      } else if (m.type === 'fontFamily' && m.attrs?.font) {
        fontFam = primaryFontName(m.attrs.font, fontFam);
      }
    }

    const effectivePt = isCode ? Math.max(8, fontPt - 1) : fontPt;
    lastRunFont = fontFam;
    lastRunPt = effectivePt;
    const segments = splitTextPreservingEmojis(String(item.text));
    const segmentRuns = segments.map((seg) => {
      const targetFont = seg.isEmoji ? 'Segoe UI Emoji' : fontFam;
      return new TextRun({
        text: seg.text,
        bold: isBold,
        italics: isItalic,
        strike: isStrike,
        subScript: isSub,
        superScript: isSup,
        font: {
          name: targetFont,
          ascii: targetFont,
          hAnsi: targetFont,
          cs: targetFont,
          eastAsia: targetFont,
        },
        size: Math.round(effectivePt * PT_TO_HALF_PT),
        color: linkHref && colorHex === defaults.colorHex ? '0563C1' : colorHex,
        underline: isUnderline || linkHref ? { type: UnderlineType.SINGLE } : undefined,
        shading: highlightHex
          ? { type: ShadingType.CLEAR, color: 'auto', fill: highlightHex }
          : undefined,
      });
    });

    if (linkHref) {
      children.push(
        new ExternalHyperlink({
          link: linkHref,
          children: segmentRuns,
        })
      );
    } else {
      children.push(...segmentRuns);
    }
  }

  return children;
}

function mapLineHeightToCssMultiplier(rawLh: number): number {
  if (Math.abs(rawLh - 1.0) < 0.03) return 1.18;
  if (Math.abs(rawLh - 1.15) < 0.03) return 1.38;
  if (Math.abs(rawLh - 1.5) < 0.03) return 1.65;
  if (Math.abs(rawLh - 2.0) < 0.03) return 2.15;
  return Math.round(rawLh * 1.15 * 100) / 100;
}

function getMaxRunFontPt(contentNodes: any[] | undefined, fallbackPt: number): number {
  let maxPt = fallbackPt;
  for (const item of contentNodes || []) {
    if (item?.type !== 'text' || !Array.isArray(item.marks)) continue;
    for (const m of item.marks) {
      if (m?.type === 'fontSize' && m.attrs?.size) {
        maxPt = Math.max(maxPt, parsePtSize(m.attrs.size, fallbackPt));
      } else if (m?.type === 'textStyle' && m.attrs?.fontSize) {
        maxPt = Math.max(maxPt, parsePtSize(m.attrs.fontSize, fallbackPt));
      }
    }
  }
  return maxPt;
}

function parseSpacingTwips(
  nodeAttrs: Record<string, any> | undefined,
  defaultAfterPt: number,
  defaultBeforePt = 0,
  fontSizePt = 11,
  defaultLineHeight = 1.38
) {
  let beforeTwips = Math.round(defaultBeforePt * PT_TO_TWIPS);
  let afterTwips = Math.round(defaultAfterPt * PT_TO_TWIPS);
  let effLh = defaultLineHeight;

  if (nodeAttrs?.lineHeight) {
    const lh = parseFloat(String(nodeAttrs.lineHeight));
    if (Number.isFinite(lh) && lh > 0) {
      effLh = mapLineHeightToCssMultiplier(lh);
      if (!nodeAttrs.marginBottom && defaultAfterPt > 0) {
        if (lh <= 1.0) {
          afterTwips = 40; // 2pt matching LineHeight.ts
        } else if (lh <= 1.15) {
          afterTwips = 120; // 6pt matching LineHeight.ts
        }
      }
    }
  }
  if (nodeAttrs?.marginTop) {
    const pt = parsePtSize(nodeAttrs.marginTop, defaultBeforePt);
    beforeTwips = Math.round(pt * PT_TO_TWIPS);
  }
  if (nodeAttrs?.marginBottom) {
    const pt = parsePtSize(nodeAttrs.marginBottom, defaultAfterPt);
    afterTwips = Math.round(pt * PT_TO_TWIPS);
  }

  return {
    before: beforeTwips,
    after: afterTwips,
    line: Math.max(200, Math.round(fontSizePt * effLh * PT_TO_TWIPS)),
    lineRule: LineRuleType.AT_LEAST,
  };
}

interface NumberingRegistryItem {
  reference: string;
  start: number;
}

async function convertNodesToDocxBlocks(
  rawNodes: any[],
  printableWidthTwips: number,
  printableWidthPx: number,
  options?: {
    insideCell?: boolean;
    isHeaderCell?: boolean;
    defaultColorHex?: string;
    defaultFontFamily?: string;
    isTopLevel?: boolean;
    numberingRegistry?: NumberingRegistryItem[];
    cellParagraphSpacing?: boolean;
    blockquoteBorderColor?: string;
    extraLeftIndentTwips?: number;
  }
): Promise<(Paragraph | DocxTable)[]> {
  const nodes = options?.isTopLevel ? mergeContinuationNodes(annotateNodesFromWorkspaceDom(rawNodes || [])) : rawNodes || [];
  const blocks: (Paragraph | DocxTable)[] = [];
  const baseColor = options?.defaultColorHex || '171C19';
  const baseFont = options?.defaultFontFamily || 'Calibri';
  const numberingRegistry = options?.numberingRegistry || [];
  const bqBorder = options?.blockquoteBorderColor
    ? { left: { color: options.blockquoteBorderColor, space: 10, style: BorderStyle.SINGLE, size: 24 } }
    : undefined;
  const extraIndent = options?.extraLeftIndentTwips || 0;

  let prevAfterPt = 0;
  let pendingTableAfterPt = 0;

  for (let nodeIdx = 0; nodeIdx < nodes.length; nodeIdx++) {
    const node = nodes[nodeIdx];
    const type = node.type;
    const attrs = node.attrs || {};
    const isVeryFirstTopNode = Boolean(options?.isTopLevel && nodeIdx === 0);
    const pageBreakBefore = Boolean(node._pageBreakBefore) || undefined;
    if (pageBreakBefore) {
      prevAfterPt = 0;
      pendingTableAfterPt = 0;
    }
    const collapseBeforePt = (rawBeforePt: number): number => {
      if (isVeryFirstTopNode || pageBreakBefore) return 0;
      const targetBeforePt = Math.max(rawBeforePt, pendingTableAfterPt);
      return Math.max(0, targetBeforePt - prevAfterPt);
    };
    const nextNode = nodes[nodeIdx + 1];
    const nextIsTableBox =
      !options?.insideCell &&
      nextNode &&
      (nextNode.type === 'table' || nextNode.type === 'callout' || nextNode.type === 'codeBlock') &&
      !nextNode._pageBreakBefore;
    const withNextBoxCollapse = (rawAfterPt: number, explicitMarginBottom?: unknown): number => {
      if (explicitMarginBottom || !nextIsTableBox) return rawAfterPt;
      return Math.max(rawAfterPt, 8);
    };
    const flushConsecutiveTableGap = () => {
      if (pendingTableAfterPt > 0 && !pageBreakBefore) {
        const afterGapTwips = Math.max(0, Math.round((pendingTableAfterPt - 1) * PT_TO_TWIPS));
        blocks.push(
          new Paragraph({
            spacing: { before: 0, after: afterGapTwips, line: 20, lineRule: LineRuleType.EXACT },
            children: [new TextRun({ text: '', size: 2 })],
          })
        );
        pendingTableAfterPt = 0;
      }
    };

    if (type === 'pageBreak' || type === 'sectionBreak') {
      blocks.push(new Paragraph({ children: [new DocxPageBreak()] }));
      prevAfterPt = 0;
      pendingTableAfterPt = 0;
      continue;
    }

    if (type === 'horizontalRule') {
      const beforeTwips = Math.round(collapseBeforePt(10) * PT_TO_TWIPS);
      blocks.push(
        new Paragraph({
          pageBreakBefore,
          keepNext: true,
          border: {
            bottom: { color: 'CBD5E1', space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
          spacing: { before: beforeTwips, after: 200, line: 20, lineRule: LineRuleType.EXACT },
          children: [new TextRun({ text: '', size: 2 })],
        })
      );
      prevAfterPt = 10;
      pendingTableAfterPt = 0;
      continue;
    }

    if (type === 'heading') {
      const level = Math.min(6, Math.max(1, Number(attrs.level || 1)));
      const headingSpecs: Record<
        number,
        { pt: number; color: string; beforePt: number; afterPt: number; lh: number; italic?: boolean; headingLvl: any }
      > = {
        1: { pt: 20, color: '245C45', beforePt: 14, afterPt: 6, lh: 1.25, headingLvl: HeadingLevel.HEADING_1 },
        2: { pt: 15, color: '398568', beforePt: 12, afterPt: 4, lh: 1.3, headingLvl: HeadingLevel.HEADING_2 },
        3: { pt: 12.5, color: '171C19', beforePt: 10, afterPt: 3, lh: 1.35, headingLvl: HeadingLevel.HEADING_3 },
        4: { pt: 11, color: '245C45', beforePt: 8, afterPt: 2, lh: 1.35, italic: true, headingLvl: HeadingLevel.HEADING_4 },
        5: { pt: 10.5, color: '374151', beforePt: 6, afterPt: 2, lh: 1.35, headingLvl: HeadingLevel.HEADING_5 },
        6: { pt: 10, color: '6B7280', beforePt: 6, afterPt: 2, lh: 1.35, headingLvl: HeadingLevel.HEADING_6 },
      };
      const spec = headingSpecs[level] || headingSpecs[1];
      const indentLvl = Number(attrs.indent || 0);
      const effectiveBeforePt = collapseBeforePt(spec.beforePt);
      const effectiveAfterPt = withNextBoxCollapse(spec.afterPt, attrs.marginBottom);
      const lineBasePt = getMaxRunFontPt(node.content, spec.pt);
      const spacingCfg = parseSpacingTwips(attrs, effectiveAfterPt, effectiveBeforePt, lineBasePt, spec.lh);

      blocks.push(
        new Paragraph({
          heading: spec.headingLvl,
          pageBreakBefore,
          keepNext: true,
          alignment: mapAlignment(attrs.textAlign),
          indent: indentLvl > 0 || extraIndent > 0 ? { left: indentLvl * 480 + extraIndent } : undefined,
          border: bqBorder,
          spacing: spacingCfg,
          children: buildInlineRuns(node.content, {
            fontSizePt: spec.pt,
            colorHex: spec.color,
            bold: true,
            italics: spec.italic,
            fontFamily: baseFont,
          }),
        })
      );
      prevAfterPt = effectiveAfterPt;
      pendingTableAfterPt = 0;
      continue;
    }

    if (type === 'paragraph') {
      const indentLvl = Number(attrs.indent || 0);
      const baseAfterPt = options?.insideCell ? 0 : 6;
      const cellAfterPt = withNextBoxCollapse(baseAfterPt, attrs.marginBottom);
      const cellBeforePt = options?.insideCell
        ? options?.cellParagraphSpacing && nodeIdx > 0
          ? 2
          : 0
        : collapseBeforePt(0);
      const defaultPt = options?.insideCell ? 10.5 : 11;
      const defaultLh = options?.insideCell ? 1.35 : 1.38;
      const lineBasePt = getMaxRunFontPt(node.content, defaultPt);

      blocks.push(
        new Paragraph({
          pageBreakBefore,
          alignment: mapAlignment(attrs.textAlign),
          indent: indentLvl > 0 || extraIndent > 0 ? { left: indentLvl * 480 + extraIndent } : undefined,
          border: bqBorder,
          spacing: parseSpacingTwips(attrs, cellAfterPt, cellBeforePt, lineBasePt, defaultLh),
          children: buildInlineRuns(node.content, {
            fontSizePt: defaultPt,
            colorHex: baseColor,
            bold: options?.isHeaderCell,
            fontFamily: baseFont,
          }),
        })
      );
      prevAfterPt = cellAfterPt;
      pendingTableAfterPt = 0;
      continue;
    }

    if (type === 'bulletList' || type === 'orderedList' || type === 'taskList') {
      let pendingBreak = Boolean(pageBreakBefore);
      let isVeryFirstListParagraph = true;
      const listEndAfterPt = withNextBoxCollapse(6);
      const renderListItems = async (listNode: any, depth: number, isRootList: boolean) => {
        const lType = listNode.type;
        let orderedRef: string | undefined;
        if (lType === 'orderedList') {
          const startNum = Math.max(1, Number(listNode.attrs?.start || 1));
          orderedRef = `docium-ol-${numberingRegistry.length + 1}`;
          numberingRegistry.push({ reference: orderedRef, start: startNum });
        }

        const items = listNode.content || [];
        for (let liIdx = 0; liIdx < items.length; liIdx++) {
          const li = items[liIdx];
          const checked = Boolean(li.attrs?.checked);
          const isLastRootLi = isRootList && liIdx === items.length - 1;
          const liChildren = li.content || [];
          for (let cIdx = 0; cIdx < liChildren.length; cIdx++) {
            const child = liChildren[cIdx];
            if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
              await renderListItems(child, Math.min(8, depth + 1), false);
            } else if (child.type === 'paragraph') {
              const isFirst = pendingBreak;
              pendingBreak = false;
              const listBeforePt = isVeryFirstListParagraph ? collapseBeforePt(4) : 0;
              isVeryFirstListParagraph = false;
              const afterPt = isLastRootLi && cIdx === liChildren.length - 1 ? listEndAfterPt : 2;
              const baseItemPt = options?.insideCell ? 10.5 : 11;
              const lineItemPt = getMaxRunFontPt(child.content, baseItemPt);
              const runs = buildInlineRuns(child.content, {
                fontSizePt: baseItemPt,
                colorHex: lType === 'taskList' && checked ? '6B7280' : baseColor,
                bold: options?.isHeaderCell,
                fontFamily: baseFont,
              });
              if (lType === 'taskList') {
                const boxPrefix = new TextRun({
                  text: checked ? '☑ ' : '☐ ',
                  font: 'Segoe UI Symbol',
                  size: 22,
                  color: checked ? '245C45' : '374151',
                });
                blocks.push(
                  new Paragraph({
                    pageBreakBefore: isFirst || undefined,
                    indent: { left: (depth + 1) * 320 + extraIndent, hanging: 220 },
                    border: bqBorder,
                    spacing: parseSpacingTwips(child.attrs, afterPt, listBeforePt, lineItemPt, 1.38),
                    children: [boxPrefix, ...runs],
                  })
                );
              } else {
                blocks.push(
                  new Paragraph({
                    pageBreakBefore: isFirst || undefined,
                    numbering:
                      lType === 'orderedList' && orderedRef
                        ? { reference: orderedRef, level: depth }
                        : undefined,
                    bullet: lType === 'bulletList' ? { level: depth } : undefined,
                    indent:
                      lType === 'bulletList'
                        ? { left: (depth + 1) * 360 + extraIndent, hanging: 220 }
                        : extraIndent > 0
                        ? { left: (depth + 1) * 360 + extraIndent, hanging: 240 }
                        : undefined,
                    border: bqBorder,
                    spacing: parseSpacingTwips(child.attrs, afterPt, listBeforePt, lineItemPt, 1.38),
                    children: runs,
                  })
                );
              }
            } else {
              const nestedBlocks = await convertNodesToDocxBlocks(
                [child],
                Math.max(400, printableWidthTwips - (depth + 1) * 360),
                Math.max(120, printableWidthPx - (depth + 1) * 24),
                {
                  insideCell: options?.insideCell,
                  isHeaderCell: options?.isHeaderCell,
                  defaultColorHex: baseColor,
                  defaultFontFamily: baseFont,
                  numberingRegistry,
                  blockquoteBorderColor: options?.blockquoteBorderColor,
                  extraLeftIndentTwips: (depth + 1) * 360 + extraIndent,
                }
              );
              blocks.push(...nestedBlocks);
            }
          }
        }
      };
      await renderListItems(node, 0, true);
      prevAfterPt = listEndAfterPt;
      pendingTableAfterPt = 0;
      continue;
    }

    if (type === 'blockquote') {
      const inner = node.content || [];
      const bColor = cleanHex(attrs.borderColor || '#245C45', '245C45');
      const quoteBorder = {
        left: { color: bColor, space: 10, style: BorderStyle.SINGLE, size: 24 },
      };
      const quoteEndAfterPt = withNextBoxCollapse(8);

      for (let qIdx = 0; qIdx < inner.length; qIdx++) {
        const child = inner[qIdx];
        const isFirstChild = qIdx === 0;
        const isLastChild = qIdx === inner.length - 1;
        const beforePt = isFirstChild ? collapseBeforePt(8) : 0;
        const afterPt = isLastChild ? quoteEndAfterPt : 6;

        if (child.type === 'paragraph' || !child.type) {
          const linePt = getMaxRunFontPt(child.content, 11);
          blocks.push(
            new Paragraph({
              pageBreakBefore: isFirstChild ? pageBreakBefore : undefined,
              alignment: mapAlignment(child.attrs?.textAlign),
              indent: { left: 260 },
              border: quoteBorder,
              spacing: parseSpacingTwips(child.attrs, afterPt, beforePt, linePt, 1.38),
              children: buildInlineRuns(child.content, {
                fontSizePt: 11,
                colorHex: '4B5563',
                italics: true,
                fontFamily: baseFont,
              }),
            })
          );
        } else if (child.type === 'heading') {
          const hLevel = Math.min(6, Math.max(1, Number(child.attrs?.level || 1)));
          const hPt = [20, 15, 12.5, 11, 10.5, 10][hLevel - 1] || 12;
          const hColor = hLevel === 1 ? '245C45' : hLevel === 2 ? '398568' : '4B5563';
          const linePt = getMaxRunFontPt(child.content, hPt);
          blocks.push(
            new Paragraph({
              pageBreakBefore: isFirstChild ? pageBreakBefore : undefined,
              alignment: mapAlignment(child.attrs?.textAlign),
              indent: { left: 260 },
              border: quoteBorder,
              spacing: parseSpacingTwips(child.attrs, afterPt, beforePt, linePt, 1.35),
              children: buildInlineRuns(child.content, {
                fontSizePt: hPt,
                colorHex: hColor,
                bold: true,
                italics: true,
                fontFamily: baseFont,
              }),
            })
          );
        } else {
          const nestedBlocks = await convertNodesToDocxBlocks(
            [child],
            Math.max(400, printableWidthTwips - 260),
            Math.max(120, printableWidthPx - 18),
            {
              insideCell: false,
              defaultColorHex: '4B5563',
              defaultFontFamily: baseFont,
              numberingRegistry,
              blockquoteBorderColor: bColor,
              extraLeftIndentTwips: 260,
            }
          );
          blocks.push(...nestedBlocks);
        }
      }
      prevAfterPt = quoteEndAfterPt;
      pendingTableAfterPt = 0;
      continue;
    }

    if (type === 'callout') {
      flushConsecutiveTableGap();
      const cType = String(attrs.type || 'info');
      const palettes: Record<string, { bg: string; border: string; text: string }> = {
        info: { bg: 'ECFDF5', border: '10B981', text: '064E3B' },
        tip: { bg: 'EFF6FF', border: '3B82F6', text: '1E3A8A' },
        warning: { bg: 'FFFBEB', border: 'F59E0B', text: '78350F' },
        danger: { bg: 'FFF1F2', border: 'F43F5E', text: '881337' },
        note: { bg: 'F5F5F4', border: '78716C', text: '1C1917' },
      };
      const pal = palettes[cType] || palettes.info;
      const innerParas = await convertNodesToDocxBlocks(
        node.content || [],
        printableWidthTwips - 480,
        printableWidthPx - 32,
        { insideCell: true, defaultColorHex: pal.text, defaultFontFamily: baseFont }
      );

      blocks.push(
        new DocxTable({
          width: { size: printableWidthTwips, type: WidthType.DXA },
          columnWidths: [printableWidthTwips],
          layout: TableLayoutType.FIXED,
          rows: [
            new DocxTableRow({
              children: [
                new DocxTableCell({
                  width: { size: printableWidthTwips, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: pal.bg },
                  margins: { top: 160, bottom: 160, left: 240, right: 240 },
                  borders: {
                    left: { style: BorderStyle.SINGLE, size: 24, color: pal.border },
                    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  },
                  children: innerParas.length > 0 ? innerParas : [new Paragraph('')],
                }),
              ],
            }),
          ],
        })
      );
      prevAfterPt = 0;
      pendingTableAfterPt = 8;
      continue;
    }

    if (type === 'codeBlock') {
      flushConsecutiveTableGap();
      const codeBgHex = cleanHex(attrs.backgroundColor || '#F4F6F4', 'F4F6F4');
      const codeTextHex = cleanHex(attrs.textColor || '#171C19', '171C19');
      const codeBorderHex = cleanHex(attrs.borderColor || '#DCE2DA', 'DCE2DA');

      // Check if user applied an explicit fontFamily/fontSize mark on codeBlock text nodes
      const textNodes = (node.content || []).filter((c: any) => c?.type === 'text' && typeof c.text === 'string');
      let customCodeFont = 'Consolas';
      let customCodePt = 9.5;
      for (const tn of textNodes) {
        for (const mk of tn.marks || []) {
          if (mk?.type === 'fontFamily' && mk.attrs?.font) customCodeFont = primaryFontName(mk.attrs.font, customCodeFont);
          if (mk?.type === 'textStyle' && mk.attrs?.fontFamily) customCodeFont = primaryFontName(mk.attrs.fontFamily, customCodeFont);
          if (mk?.type === 'fontSize' && mk.attrs?.size) customCodePt = parsePtSize(mk.attrs.size, customCodePt);
          if (mk?.type === 'textStyle' && mk.attrs?.fontSize) customCodePt = parsePtSize(mk.attrs.fontSize, customCodePt);
        }
      }

      const codeText = textNodes.map((c: any) => c.text || '').join('');
      const codeLines = codeText.split(/\r?\n/);
      const codeParas = codeLines.map(
        (ln: string, lineIdx: number) =>
          new Paragraph({
            pageBreakBefore: lineIdx === 0 ? pageBreakBefore : undefined,
            spacing: { before: 0, after: 20, line: Math.round(customCodePt * 1.45 * PT_TO_TWIPS), lineRule: LineRuleType.AT_LEAST },
            children: [
              new TextRun({
                text: ln || ' ',
                font: {
                  name: customCodeFont,
                  ascii: customCodeFont,
                  hAnsi: customCodeFont,
                  cs: customCodeFont,
                  eastAsia: customCodeFont,
                },
                size: Math.round(customCodePt * PT_TO_HALF_PT),
                color: codeTextHex,
              }),
            ],
          })
      );

      blocks.push(
        new DocxTable({
          width: { size: printableWidthTwips, type: WidthType.DXA },
          columnWidths: [printableWidthTwips],
          layout: TableLayoutType.FIXED,
          rows: [
            new DocxTableRow({
              cantSplit: false,
              children: [
                new DocxTableCell({
                  width: { size: printableWidthTwips, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: codeBgHex },
                  margins: { top: 160, bottom: 160, left: 200, right: 200 },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: codeBorderHex },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: codeBorderHex },
                    left: { style: BorderStyle.SINGLE, size: 4, color: codeBorderHex },
                    right: { style: BorderStyle.SINGLE, size: 4, color: codeBorderHex },
                  },
                  children: codeParas,
                }),
              ],
            }),
          ],
        })
      );
      prevAfterPt = 0;
      pendingTableAfterPt = 8;
      continue;
    }

    if (type === 'equation') {
      const latex = String(attrs.latex || '').trim();
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
          children: [latexToDocxMath(latex || ' ')],
        })
      );
      continue;
    }

    // ==================== NATIVE ADJUSTABLE WORD VECTOR SHAPE ====================
    if (type === 'shape') {
      const sType = String(attrs.shapeType || 'rectangle');
      const preset = mapDociumShapeToPreset(sType);
      const wPx = Math.max(24, Number(attrs.width || 180));
      const isPureLine = sType === 'line' || sType === 'arrow' || sType === 'left-arrow' || sType === 'double-arrow';
      const hPx = isPureLine ? 2 : Math.max(20, Number(attrs.height || 110));
      const fillRaw = String(attrs.fill || '#EAF2ED');
      const strokeRaw = String(attrs.stroke || '#245C45');
      const strokeWidthPt = Math.max(0.75, (Number(attrs.strokeWidth ?? 2) * 72) / 96);
      const sStyle = String(attrs.strokeStyle || 'solid');
      const dash: LineDash = sStyle === 'dashed' ? 'dash' : sStyle === 'dotted' ? 'dot' : 'solid';
      const alignMode = String(attrs.alignment || 'center');
      const shapeText = String(attrs.text || '').trim();
      const textColorHex = cleanHex(attrs.textColor || strokeRaw, '171C19');
      const fontPt = Number(attrs.fontSize || 11);

      const startArrow =
        sType === 'left-arrow' || sType === 'double-arrow' ? ('triangle' as const) : undefined;
      const endArrow =
        sType === 'arrow' || sType === 'double-arrow' || sType === 'connector'
          ? ('triangle' as const)
          : undefined;

      const shapeChildren = shapeText
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({
                  text: shapeText,
                  bold: true,
                  font: 'Calibri',
                  size: Math.round(fontPt * 2),
                  color: textColorHex,
                }),
              ],
            }),
          ]
        : undefined;

      const shapeRun = new ShapeRun({
        type: preset,
        transformation: {
          width: wPx,
          height: hPx,
          rotation: Number(attrs.rotation || 0) || undefined,
        },
        fill: isPureLine || fillRaw === 'transparent' || fillRaw === 'none' ? 'none' : cleanHex(fillRaw, 'EAF2ED'),
        line: {
          color: cleanHex(strokeRaw, '245C45'),
          width: strokeWidthPt,
          dash,
          startArrow,
          endArrow,
        },
        floating: buildFloatingSpec(alignMode),
        children: shapeChildren,
        textOptions: {
          verticalAlignment: 'center',
          wrap: true,
        },
      });

      blocks.push(
        new Paragraph({
          alignment:
            alignMode === 'left'
              ? AlignmentType.LEFT
              : alignMode === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER,
          spacing: { before: 100, after: 100 },
          children: [shapeRun],
        })
      );
      continue;
    }

    // ==================== NATIVE ADJUSTABLE WORD TEXT BOX ====================
    if (type === 'textBox') {
      const rawW = Number(attrs.width || 0);
      const boxWidthPx = rawW > 0 ? Math.min(rawW, printableWidthPx) : printableWidthPx;
      const minHeightPx = Math.max(48, Number(attrs.minHeight || 64));
      const fillRaw = String(attrs.fill || '#FFFFFF');
      const bColor = cleanHex(attrs.borderColor || '#245C45', '245C45');
      const bWidth = Number(attrs.borderWidth ?? 1);
      const bStyle = String(attrs.borderStyle || 'solid');
      const alignMode = String(attrs.alignment || 'full');
      const radius = Number(attrs.borderRadius ?? 4);
      const padPx = Number(attrs.padding ?? 12);
      const padPt = Math.round((padPx * 72) / 96);

      // Convert rich paragraphs inside the Text Box
      const innerDocxBlocks = await convertNodesToDocxBlocks(
        node.content || [],
        Math.round((boxWidthPx / printableWidthPx) * printableWidthTwips) - 240,
        boxWidthPx - 24,
        { insideCell: true }
      );
      const innerParagraphs = innerDocxBlocks.filter((b): b is Paragraph => b instanceof Paragraph);

      const textBoxShape = new ShapeRun({
        type: radius >= 6 ? 'roundedRectangle' : 'rectangle',
        transformation: {
          width: boxWidthPx,
          height: minHeightPx,
        },
        fill: fillRaw === 'transparent' || fillRaw === 'none' ? 'none' : cleanHex(fillRaw, 'FFFFFF'),
        line:
          bStyle === 'none' || bWidth === 0
            ? 'none'
            : {
                color: bColor,
                width: Math.max(0.75, (bWidth * 72) / 96),
                dash: bStyle === 'dashed' ? 'dash' : bStyle === 'dotted' ? 'dot' : 'solid',
                compound: bStyle === 'double' ? 'double' : 'single',
              },
        effects: attrs.shadow ? { shadow: {} } : undefined,
        floating: buildFloatingSpec(alignMode),
        children: innerParagraphs.length > 0 ? innerParagraphs : [new Paragraph('')],
        textOptions: {
          verticalAlignment: 'top',
          resizeShapeToFitText: true,
          wrap: true,
          margins: { top: padPt, bottom: padPt, left: padPt, right: padPt },
        },
      });

      blocks.push(
        new Paragraph({
          alignment:
            alignMode === 'left'
              ? AlignmentType.LEFT
              : alignMode === 'right'
              ? AlignmentType.RIGHT
              : alignMode === 'center'
              ? AlignmentType.CENTER
              : AlignmentType.LEFT,
          spacing: { before: 100, after: 100 },
          children: [textBoxShape],
        })
      );
      continue;
    }

    // ==================== NATIVE RESIZABLE WORD IMAGE / CHART / DRAWING ====================
    if (type === 'image') {
      const src = String(attrs.src || '');
      const wPx = Math.min(printableWidthPx, Math.max(60, Number(attrs.width || 420)));
      const hPx = attrs.height ? Math.max(24, Number(attrs.height)) : undefined;
      const alignMode = String(attrs.alignment || 'center');
      const caption = String(attrs.caption || '').trim();

      const resolved = await resolveImageBytes(src, wPx, hPx);
      if (resolved) {
        const floating =
          alignMode === 'float-left' || alignMode === 'float-right'
            ? {
                horizontalPosition: {
                  relative: HorizontalPositionRelativeFrom.MARGIN,
                  align:
                    alignMode === 'float-left'
                      ? HorizontalPositionAlign.LEFT
                      : HorizontalPositionAlign.RIGHT,
                },
                verticalPosition: {
                  relative: VerticalPositionRelativeFrom.PARAGRAPH,
                  offset: 0,
                },
                wrap: {
                  type: TextWrappingType.SQUARE,
                  side: alignMode === 'float-left' ? TextWrappingSide.RIGHT : TextWrappingSide.LEFT,
                },
              }
            : undefined;

        blocks.push(
          new Paragraph({
            alignment:
              alignMode === 'left'
                ? AlignmentType.LEFT
                : alignMode === 'right'
                ? AlignmentType.RIGHT
                : AlignmentType.CENTER,
            spacing: { before: 100, after: caption ? 40 : 100 },
            children: [
              new ImageRun({
                type: resolved.type,
                data: resolved.data,
                transformation: { width: resolved.width, height: resolved.height },
                floating,
              }),
            ],
          })
        );

        if (caption) {
          blocks.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 120 },
              children: [
                new TextRun({
                  text: caption,
                  italics: true,
                  size: 19,
                  color: '4B5563',
                }),
              ],
            })
          );
        }
      }
      continue;
    }

    // ==================== NATIVE ADJUSTABLE WORD TABLE ====================
    if (type === 'table') {
      flushConsecutiveTableGap();
      const pmRows: any[] = node.content || [];
      if (pmRows.length === 0) continue;

      // Determine logical column count and column widths (preserving user-resized colwidth OR measured DOM widths)
      let totalCols = 0;
      const measuredDomCols: number[] | undefined = Array.isArray(attrs._measuredColWidthsPx)
        ? attrs._measuredColWidthsPx
        : undefined;
      const colWidthsFromPm: number[] = [];

      for (const r of pmRows) {
        let rowCols = 0;
        const rowPx: number[] = [];
        for (const c of r?.content || []) {
          const span = Math.max(1, Number(c.attrs?.colspan || 1));
          rowCols += span;
          const cwArr = Array.isArray(c.attrs?.colwidth) ? c.attrs.colwidth : null;
          for (let k = 0; k < span; k++) {
            rowPx.push(cwArr && cwArr[k] ? Number(cwArr[k]) : 0);
          }
        }
        if (rowCols > totalCols) totalCols = rowCols;
        rowPx.forEach((w, idx) => {
          if (w > 0 && !colWidthsFromPm[idx]) colWidthsFromPm[idx] = w;
        });
      }
      totalCols = Math.max(1, totalCols);

      let colWidthsTwips: number[] = [];
      const hasPmWidths = colWidthsFromPm.filter((w) => w > 0).length > 0;
      if (hasPmWidths) {
        const defaultColPx = printableWidthPx / totalCols;
        const filledPx = Array.from({ length: totalCols }, (_, idx) => colWidthsFromPm[idx] || defaultColPx);
        const sumPx = filledPx.reduce((a, b) => a + b, 0) || printableWidthPx;
        colWidthsTwips = filledPx.map((px) => Math.max(360, Math.round((px / sumPx) * printableWidthTwips)));
      } else if (measuredDomCols && measuredDomCols.length === totalCols) {
        const sumPx = measuredDomCols.reduce((a, b) => a + b, 0) || printableWidthPx;
        colWidthsTwips = measuredDomCols.map((px) => Math.max(360, Math.round((px / sumPx) * printableWidthTwips)));
      } else {
        const evenTwips = Math.floor(printableWidthTwips / totalCols);
        colWidthsTwips = Array(totalCols).fill(evenTwips);
      }

      const docxRows: DocxTableRow[] = [];
      let allCellsBorderless = true;

      for (let rIdx = 0; rIdx < pmRows.length; rIdx++) {
        const rowNode = pmRows[rIdx];
        const cells = rowNode.content || [];
        const isHeaderRow = rIdx === 0 && cells.every((c: any) => c.type === 'tableHeader');
        const rowPageBreak = Boolean(rowNode._pageBreakBefore) || (rIdx === 0 && Boolean(pageBreakBefore));
        const docxCells: DocxTableCell[] = [];

        let colCursor = 0;
        for (let cIdx = 0; cIdx < cells.length; cIdx++) {
          const cellNode = cells[cIdx];
          const isTh = cellNode.type === 'tableHeader';
          const cAttrs = cellNode.attrs || {};
          const colSpan = Math.max(1, Number(cAttrs.colspan || 1));
          const rowSpan = Math.max(1, Number(cAttrs.rowspan || 1));

          let cellWidthTwips = 0;
          for (let s = 0; s < colSpan; s++) {
            cellWidthTwips += colWidthsTwips[Math.min(colWidthsTwips.length - 1, colCursor + s)] || 1440;
          }
          colCursor += colSpan;

          const bgHex = cAttrs.backgroundColor
            ? cleanHex(cAttrs.backgroundColor, 'F1F5F3')
            : isTh
            ? 'F1F5F3'
            : undefined;

          const isDarkBg =
            bgHex === '245C45' || bgHex === '1E293B' || bgHex === '171C19' || bgHex === '1E3A8A';

          const defaultCellTextHex = cAttrs.textColor
            ? cleanHex(cAttrs.textColor, isDarkBg ? 'FFFFFF' : '171C19')
            : isDarkBg
            ? 'FFFFFF'
            : '171C19';

          const bStyleAttr = cAttrs.borderStyle || 'solid';
          if (bStyleAttr !== 'none') allCellsBorderless = false;
          const bColorHex = cleanHex(cAttrs.borderColor || '#CBD5E1', 'CBD5E1');
          const docxBorderStyle =
            bStyleAttr === 'none'
              ? BorderStyle.NONE
              : bStyleAttr === 'dashed'
              ? BorderStyle.DASHED
              : BorderStyle.SINGLE;
          const borderEntry = {
            style: docxBorderStyle,
            size: bStyleAttr === 'none' ? 0 : 6,
            color: bColorHex,
          };

          const vAlign =
            cAttrs.verticalAlign === 'middle'
              ? VerticalAlign.CENTER
              : cAttrs.verticalAlign === 'bottom'
              ? VerticalAlign.BOTTOM
              : VerticalAlign.TOP;

          const rawCellNodes = cellNode.content || [];
          const cellBlocksInput =
            rowPageBreak && cIdx === 0 && rawCellNodes.length > 0
              ? [{ ...rawCellNodes[0], _pageBreakBefore: true }, ...rawCellNodes.slice(1)]
              : rawCellNodes;

          const cellChildren = await convertNodesToDocxBlocks(
            cellBlocksInput,
            Math.max(400, cellWidthTwips - 280),
            Math.max(60, Math.round((cellWidthTwips / printableWidthTwips) * printableWidthPx) - 20),
            {
              insideCell: true,
              isHeaderCell: isTh,
              defaultColorHex: defaultCellTextHex,
              defaultFontFamily: baseFont,
              numberingRegistry,
              cellParagraphSpacing: true,
            }
          );

          const finalCellChildren: (Paragraph | DocxTable)[] =
            cellChildren.length > 0
              ? cellChildren
              : [new Paragraph({ pageBreakBefore: rowPageBreak && cIdx === 0 ? true : undefined, children: [] })];

          docxCells.push(
            new DocxTableCell({
              width: { size: cellWidthTwips, type: WidthType.DXA },
              columnSpan: colSpan > 1 ? colSpan : undefined,
              rowSpan: rowSpan > 1 ? rowSpan : undefined,
              verticalAlign: vAlign,
              shading: bgHex ? { type: ShadingType.CLEAR, color: 'auto', fill: bgHex } : undefined,
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              borders: {
                top: borderEntry,
                bottom: borderEntry,
                left: borderEntry,
                right: borderEntry,
              },
              children: finalCellChildren,
            })
          );
        }

        docxRows.push(
          new DocxTableRow({
            tableHeader: isHeaderRow,
            cantSplit: false,
            children: docxCells,
          })
        );
      }

      blocks.push(
        new DocxTable({
          width: { size: printableWidthTwips, type: WidthType.DXA },
          columnWidths: colWidthsTwips,
          layout: TableLayoutType.FIXED,
          borders: allCellsBorderless
            ? {
                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              }
            : undefined,
          rows: docxRows,
        })
      );
      prevAfterPt = 0;
      pendingTableAfterPt = 8;
    }
  }

  return blocks;
}

function buildHeaderParagraph(
  rawText: string,
  options?: {
    watermarkText?: string;
    align?: 'left' | 'center' | 'right';
    showLine?: boolean;
    fontFamily?: string;
  }
): Paragraph[] {
  const hdrFont = options?.fontFamily || 'Calibri';
  const runs: any[] = [];
  if (options?.watermarkText && options.watermarkText.trim()) {
    runs.push(
      new TextWatermark({
        text: options.watermarkText.trim(),
        color: '245C45',
        opacity: 0.14,
        bold: true,
      })
    );
  }

  const trimmed = (rawText || '').trim();
  if (rawText && trimmed) {
    const parts = rawText.split(/(\{page\}|\{pages\})/gi);
    for (const part of parts) {
      if (/^\{page\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.CURRENT], font: hdrFont, size: 19, color: '6B7280' }));
      } else if (/^\{pages\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: hdrFont, size: 19, color: '6B7280' }));
      } else if (part) {
        for (const seg of splitTextPreservingEmojis(part)) {
          runs.push(
            new TextRun({
              text: seg.text,
              font: seg.isEmoji ? 'Segoe UI Emoji' : hdrFont,
              size: 19,
              color: '6B7280',
            })
          );
        }
      }
    }
  }

  const drawLine = Boolean(options?.showLine) && trimmed.length > 0;
  return [
    new Paragraph({
      alignment: mapAlignment(options?.align),
      spacing: { before: 0, after: 0, line: 220, lineRule: LineRuleType.AUTO },
      border: drawLine
        ? {
            bottom: {
              color: 'D1D5DB',
              space: 4,
              style: BorderStyle.SINGLE,
              size: 4,
            },
          }
        : undefined,
      children: runs,
    }),
  ];
}

function buildFooterParagraph(
  rawText: string,
  showPageNumbers: boolean,
  options?: {
    align?: 'left' | 'center' | 'right';
    showLine?: boolean;
    pageNumberPosition?: 'bottom-center' | 'bottom-right' | 'top-right';
    fontFamily?: string;
  }
): Paragraph[] {
  const ftrFont = options?.fontFamily || 'Calibri';
  const runs: TextRun[] = [];
  const hasExplicitToken = /\{page\}/i.test(rawText || '');
  const trimmed = (rawText || '').trim();

  if (rawText && trimmed) {
    const parts = rawText.split(/(\{page\}|\{pages\})/gi);
    for (const part of parts) {
      if (/^\{page\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.CURRENT], font: ftrFont, size: 19, color: '6B7280' }));
      } else if (/^\{pages\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: ftrFont, size: 19, color: '6B7280' }));
      } else if (part) {
        for (const seg of splitTextPreservingEmojis(part)) {
          runs.push(
            new TextRun({
              text: seg.text,
              font: seg.isEmoji ? 'Segoe UI Emoji' : ftrFont,
              size: 19,
              color: '6B7280',
            })
          );
        }
      }
    }
  }

  if (showPageNumbers && !hasExplicitToken) {
    if (runs.length > 0) {
      runs.push(new TextRun({ text: '   •   Page ', font: ftrFont, size: 19, color: '6B7280' }));
    } else {
      runs.push(new TextRun({ text: 'Page ', font: ftrFont, size: 19, color: '6B7280' }));
    }
    runs.push(new TextRun({ children: [PageNumber.CURRENT], font: ftrFont, size: 19, color: '6B7280' }));
    runs.push(new TextRun({ text: ' of ', font: ftrFont, size: 19, color: '6B7280' }));
    runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: ftrFont, size: 19, color: '6B7280' }));
  }

  const drawLine = Boolean(options?.showLine) && (trimmed.length > 0 || showPageNumbers);
  const resolvedAlign =
    showPageNumbers && !trimmed
      ? options?.pageNumberPosition === 'bottom-center'
        ? AlignmentType.CENTER
        : AlignmentType.RIGHT
      : mapAlignment(options?.align);

  return [
    new Paragraph({
      alignment: resolvedAlign,
      spacing: { before: 0, after: 0, line: 220, lineRule: LineRuleType.AUTO },
      border: drawLine
        ? {
            top: {
              color: 'D1D5DB',
              space: 4,
              style: BorderStyle.SINGLE,
              size: 4,
            },
          }
        : undefined,
      children: runs,
    }),
  ];
}

function collectDocumentFonts(nodes: any[]): { dominantFont: string; allFonts: Set<string> } {
  const counts = new Map<string, number>();
  const allFonts = new Set<string>();

  const walk = (arr: any[]) => {
    for (const node of arr) {
      if (!node) continue;
      if (node.type === 'text' && Array.isArray(node.marks)) {
        let f = '';
        for (const m of node.marks) {
          if (m?.type === 'fontFamily' && m.attrs?.font) f = primaryFontName(m.attrs.font, '');
          else if (m?.type === 'textStyle' && m.attrs?.fontFamily) f = primaryFontName(m.attrs.fontFamily, '');
        }
        if (f) {
          allFonts.add(f);
          counts.set(f, (counts.get(f) || 0) + (node.text?.length || 1));
        }
      }
      if (Array.isArray(node.content)) walk(node.content);
    }
  };
  walk(nodes || []);

  let dominantFont = 'Calibri';
  let maxCount = 0;
  for (const [f, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantFont = f;
    }
  }
  return { dominantFont, allFonts };
}

export async function exportToDocx(
  title: string,
  htmlContent: string,
  options?: DocxExportOptions
): Promise<void> {
  const cleanTitle = title || 'Untitled Document';
  const pageSizeKey = options?.pageSize && options.pageSize !== 'custom' ? options.pageSize : 'A4';
  const paperMm = PAPER_SIZES_MM[pageSizeKey] || PAPER_SIZES_MM.A4;
  const isLandscape = options?.orientation === 'landscape';
  const resolvedMargins = getResolvedMargins(options?.margins);

  const pageWidthMm = isLandscape ? Math.max(paperMm.width, paperMm.height) : Math.min(paperMm.width, paperMm.height);
  const pageHeightMm = isLandscape ? Math.min(paperMm.width, paperMm.height) : Math.max(paperMm.width, paperMm.height);

  const pageWidthTwips = Math.round(pageWidthMm * MM_TO_TWIPS);
  const pageHeightTwips = Math.round(pageHeightMm * MM_TO_TWIPS);
  const marginTopTwips = Math.round(resolvedMargins.top * MM_TO_TWIPS);
  const marginBottomTwips = Math.round(resolvedMargins.bottom * MM_TO_TWIPS);
  const marginLeftTwips = Math.round(resolvedMargins.left * MM_TO_TWIPS);
  const marginRightTwips = Math.round(resolvedMargins.right * MM_TO_TWIPS);

  const printableWidthTwips = Math.max(2880, pageWidthTwips - marginLeftTwips - marginRightTwips);
  const printableWidthPx = Math.max(240, Math.round((pageWidthMm - resolvedMargins.left - resolvedMargins.right) * 3.779527559));

  const docJson = options?.jsonContent || parseHtmlFallbackToJson(htmlContent || '<p></p>');
  const { allFonts } = collectDocumentFonts(docJson.content || []);
  const domDefaultFont =
    typeof document !== 'undefined' && typeof document.querySelector === 'function'
      ? (() => {
          const tt = document.querySelector('#docium-paginated-sheet .tiptap, .tiptap') as HTMLElement | null;
          return tt ? normalizeExportFontName(window.getComputedStyle(tt).fontFamily, 'Calibri') : 'Calibri';
        })()
      : 'Calibri';
  const baseFont = options?.defaultFontFamily
    ? primaryFontName(options.defaultFontFamily, domDefaultFont)
    : domDefaultFont;

  const numberingRegistry: NumberingRegistryItem[] = [];
  const bodyChildren = await convertNodesToDocxBlocks(
    docJson.content || [],
    printableWidthTwips,
    printableWidthPx,
    {
      isTopLevel: true,
      defaultFontFamily: baseFont,
      numberingRegistry,
    }
  );

  // Embed non-standard / Google / Office CloudFont TrueType fonts used in document directly into .docx archive when available in browser
  const STANDARD_DESKTOP_FONTS = new Set([
    'calibri', 'calibri light', 'arial', 'arial black',
    'times new roman', 'georgia', 'cambria', 'cambria math', 'consolas',
    'verdana', 'tahoma', 'courier new', 'segoe ui', 'trebuchet ms',
    'candara', 'constantia', 'corbel', 'palatino linotype', 'impact', 'comic sans ms',
    'lucida console', 'franklin gothic medium', 'cascadia mono', 'cascadia code',
  ]);
  const embeddedDocxFonts: Array<{ name: string; data: Buffer; bold?: Buffer; italic?: Buffer; boldItalic?: Buffer }> = [];
  if (typeof window !== 'undefined' && allFonts.size > 0) {
    const candidateFonts = Array.from(allFonts)
      .filter((f) => !STANDARD_DESKTOP_FONTS.has(f.toLowerCase()))
      .slice(0, 12);
    await Promise.all(
      candidateFonts.map(async (fontName) => {
        const [regBytes, boldBytes, italicBytes, boldItalicBytes] = await Promise.all([
          fetchTrueTypeFontBytes(fontName, false, false, false),
          fetchTrueTypeFontBytes(fontName, true, false, false),
          fetchTrueTypeFontBytes(fontName, false, true, false),
          fetchTrueTypeFontBytes(fontName, true, true, false),
        ]);
        if (!regBytes) return;
        embeddedDocxFonts.push({
          name: fontName,
          data: regBytes as unknown as Buffer,
          ...(boldBytes ? { bold: boldBytes as unknown as Buffer } : {}),
          ...(italicBytes ? { italic: italicBytes as unknown as Buffer } : {}),
          ...(boldItalicBytes ? { boldItalic: boldItalicBytes as unknown as Buffer } : {}),
        });
      })
    );
  }

  const pb = options?.pageBorder || 'none';
  const pbColor = cleanHex(options?.pageBorderColor, pb === 'accent' ? '245C45' : '374151');
  const pbSize = Math.max(4, Math.round((options?.pageBorderWidth || (pb === 'accent' ? 1.5 : 1)) * 8));
  const pbOffsetFrom = options?.pageBorderOffset === 'margin' ? 'text' : 'page';
  const pageBordersConfig =
    pb !== 'none'
      ? {
          borders: {
            pageBorders: {
              display: 'allPages' as any,
              offsetFrom: pbOffsetFrom as any,
            },
            pageBorderTop: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pbSize,
              color: pbColor,
              space: 24,
            },
            pageBorderBottom: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pbSize,
              color: pbColor,
              space: 24,
            },
            pageBorderLeft: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pbSize,
              color: pbColor,
              space: 24,
            },
            pageBorderRight: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pbSize,
              color: pbColor,
              space: 24,
            },
          },
        }
      : {};

  const hasWatermark = Boolean(options?.watermarkText?.trim());
  const hasHeader = Boolean(options?.headerText?.trim() || options?.firstPageHeaderText?.trim() || hasWatermark);
  const hasFooter = Boolean(options?.footerText?.trim() || options?.firstPageFooterText?.trim() || options?.showPageNumbers);

  const buildOrderedLevels = (startNum = 1) => [
    {
      level: 0,
      format: LevelFormat.DECIMAL,
      text: '%1.',
      alignment: AlignmentType.START,
      start: startNum,
      style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { font: baseFont } },
    },
    {
      level: 1,
      format: LevelFormat.LOWER_LETTER,
      text: '%2.',
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720, hanging: 240 } }, run: { font: baseFont } },
    },
    {
      level: 2,
      format: LevelFormat.LOWER_ROMAN,
      text: '%3.',
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 1080, hanging: 240 } }, run: { font: baseFont } },
    },
  ];

  const wordDoc = new Document({
    title: cleanTitle,
    creator: 'Docium Workspace',
    fonts: embeddedDocxFonts.length > 0 ? embeddedDocxFonts : undefined,
    background:
      options?.pageColor && options.pageColor.toUpperCase() !== '#FFFFFF'
        ? { color: cleanHex(options.pageColor, 'FFFFFF') }
        : undefined,
    styles: {
      default: {
        document: {
          run: {
            font: {
              name: baseFont,
              ascii: baseFont,
              hAnsi: baseFont,
              cs: baseFont,
              eastAsia: baseFont,
            },
            size: 22, // 11pt
            color: '171C19',
          },
          paragraph: {
            spacing: { line: 304, lineRule: LineRuleType.AT_LEAST, after: 120 },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { font: baseFont, size: 22, color: '171C19' },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: baseFont, size: 40, bold: true, color: '245C45' },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: baseFont, size: 30, bold: true, color: '398568' },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: baseFont, size: 25, bold: true, color: '171C19' },
        },
        {
          id: 'Heading4',
          name: 'Heading 4',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: baseFont, size: 22, bold: true, italics: true, color: '245C45' },
        },
        {
          id: 'Heading5',
          name: 'Heading 5',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: baseFont, size: 21, bold: true, color: '374151' },
        },
        {
          id: 'Heading6',
          name: 'Heading 6',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: baseFont, size: 20, bold: true, color: '6B7280' },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'docium-numbered-list',
          levels: buildOrderedLevels(1),
        },
        ...numberingRegistry.map((item) => ({
          reference: item.reference,
          levels: buildOrderedLevels(item.start),
        })),
      ],
    },
    sections: [
      {
        properties: {
          titlePage: Boolean(options?.differentFirstPage),
          column:
            options?.columns && options.columns > 1
              ? { count: options.columns, space: 420, separate: true }
              : undefined,
          page: {
            size: {
              width: isLandscape ? Math.min(pageWidthTwips, pageHeightTwips) : pageWidthTwips,
              height: isLandscape ? Math.max(pageWidthTwips, pageHeightTwips) : pageHeightTwips,
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: marginTopTwips,
              bottom: marginBottomTwips,
              left: marginLeftTwips,
              right: marginRightTwips,
              header: Math.min(720, Math.round(marginTopTwips * 0.45)),
              footer: Math.min(720, Math.round(marginBottomTwips * 0.45)),
            },
            ...pageBordersConfig,
          },
        },
        headers: hasHeader
          ? {
              default: new Header({
                children: buildHeaderParagraph(options?.headerText || '', {
                  watermarkText: options?.watermarkText,
                  align: options?.headerAlign,
                  showLine: Boolean(options?.showHeaderLine),
                  fontFamily: baseFont,
                }),
              }),
              ...(options?.differentFirstPage
                ? {
                    first: new Header({
                      children: buildHeaderParagraph(options?.firstPageHeaderText || '', {
                        watermarkText: options?.watermarkText,
                        align: options?.headerAlign,
                        showLine: Boolean(options?.showHeaderLine),
                        fontFamily: baseFont,
                      }),
                    }),
                  }
                : {}),
            }
          : undefined,
        footers: hasFooter
          ? {
              default: new Footer({
                children: buildFooterParagraph(options?.footerText || '', Boolean(options?.showPageNumbers), {
                  align: options?.footerAlign,
                  showLine: Boolean(options?.showFooterLine),
                  pageNumberPosition: options?.pageNumberPosition,
                  fontFamily: baseFont,
                }),
              }),
              ...(options?.differentFirstPage
                ? {
                    first: new Footer({
                      children: buildFooterParagraph(
                        options?.firstPageFooterText || '',
                        Boolean(options?.showPageNumbers),
                        {
                          align: options?.footerAlign,
                          showLine: Boolean(options?.showFooterLine),
                          pageNumberPosition: options?.pageNumberPosition,
                          fontFamily: baseFont,
                        }
                      ),
                    }),
                  }
                : {}),
            }
          : undefined,
        children: bodyChildren.length > 0 ? bodyChildren : [new Paragraph('')],
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);
  downloadBlob(blob, `${cleanTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'document'}.docx`);
}

export function exportToMarkdown(title: string, htmlContent: string) {
  const md = htmlContent
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
    })
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
      let idx = 1;
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${idx++}. $1\n`) + '\n';
    })
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<div class="docium-page-break"[^>]*>.*?<\/div>/gi, '\n---\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`);
}

export function exportToHtml(title: string, htmlContent: string) {
  // Merge split continuation tables back into single seamless tables for HTML export
  const normalizedHtml = htmlContent
    .replace(/<\/tbody>\s*<\/table>\s*<table[^>]*data-split-continuation="true"[^>]*>\s*<tbody[^>]*>/gi, '')
    .replace(/<\/table>\s*<table[^>]*data-split-continuation="true"[^>]*>/gi, '');

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Calibri, Aptos, 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.38;
      max-width: 840px;
      margin: 40px auto;
      padding: 0 24px;
      color: #171c19;
      background: #ffffff;
    }
    h1 { font-size: 20pt; color: #245c45; margin-top: 14pt; margin-bottom: 6pt; }
    h2 { font-size: 15pt; color: #398568; margin-top: 12pt; margin-bottom: 4pt; }
    h3 { font-size: 12.5pt; color: #171c19; margin-top: 10pt; margin-bottom: 3pt; }
    h4 { font-size: 11pt; color: #245c45; font-style: italic; }
    p { margin: 0 0 6pt 0; }
    a { color: #0563c1; text-decoration: underline; }
    blockquote {
      border-left: 3pt solid #245c45;
      padding-left: 10pt;
      margin: 8pt 0;
      color: #4b5563;
      font-style: italic;
    }
    table {
      border-collapse: collapse;
      border-spacing: 0;
      width: 100%;
      margin: 8pt 0;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5pt 7pt;
      text-align: left;
      vertical-align: top;
      font-size: 10.5pt;
      line-height: 1.35;
    }
    td > p, th > p {
      margin: 0;
    }
    td > p + p, th > p + p {
      margin-top: 2pt;
    }
    th {
      background-color: #f1f5f3;
      font-weight: 700;
    }
    code {
      font-family: Consolas, monospace;
      background: #f1f5f2;
      color: #245c45;
      padding: 1pt 3pt;
      border-radius: 3px;
    }
    .docium-page-break {
      page-break-after: always;
      border-bottom: 2px dashed #ccc;
      margin: 24px 0;
    }
    @media print {
      .docium-page-break { border: none; }
    }
  </style>
</head>
<body>
  ${normalizedHtml}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.html`);
}

export function exportToPlainText(title: string, htmlContent: string) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const text = tempDiv.innerText || tempDiv.textContent || '';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.txt`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
