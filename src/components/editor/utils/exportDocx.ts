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

export interface DocxExportOptions {
  jsonContent?: Record<string, any>;
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins | MarginPreset;
  columns?: 1 | 2 | 3;
  headerText?: string;
  footerText?: string;
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  showPageNumbers?: boolean;
  differentFirstPage?: boolean;
  watermarkText?: string;
  pageColor?: string;
  pageBorder?: 'none' | 'box' | 'shadow' | 'double' | 'accent';
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

function primaryFontName(raw: string | null | undefined): string {
  if (!raw) return 'Calibri';
  return raw.split(',')[0].replace(/['"]/g, '').trim() || 'Calibri';
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

async function resolveImageBytes(
  src: string,
  targetW = 400,
  targetH = 260
): Promise<{ data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number } | null> {
  if (!src || typeof window === 'undefined') return null;

  try {
    // Rasterize SVG data URLs to crisp 2x PNG so every version of Word displays them reliably
    if (src.startsWith('data:image/svg+xml')) {
      return await new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const w = img.naturalWidth || targetW;
          const h = img.naturalHeight || targetH;
          const canvas = document.createElement('canvas');
          canvas.width = w * 2;
          canvas.height = h * 2;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.scale(2, 2);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (!blob) return resolve(null);
            blob.arrayBuffer().then((buf) => {
              resolve({ data: new Uint8Array(buf), type: 'png', width: targetW || w, height: targetH || h });
            });
          }, 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    if (src.startsWith('data:image/')) {
      const mimeMatch = src.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.*)$/);
      if (mimeMatch) {
        const rawExt = mimeMatch[1].toLowerCase();
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
        return { data: bytes, type, width: targetW, height: targetH };
      }
    }

    const resp = await fetch(src);
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || 'image/png';
    const buf = await resp.arrayBuffer();
    const type: 'png' | 'jpg' | 'gif' | 'bmp' = contentType.includes('jpeg') || contentType.includes('jpg')
      ? 'jpg'
      : contentType.includes('gif')
      ? 'gif'
      : 'png';
    return { data: new Uint8Array(buf), type, width: targetW, height: targetH };
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

  const parseBlockElements = (parent: Element): any[] => {
    const blocks: any[] = [];
    Array.from(parent.children).forEach((el) => {
      const hel = el as HTMLElement;
      const tag = hel.tagName.toLowerCase();
      const dataType = hel.getAttribute('data-type');

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
          content: parseBlockElements(hel),
        });
      } else if (dataType === 'callout') {
        blocks.push({
          type: 'callout',
          attrs: { type: hel.getAttribute('data-callout-type') || 'info' },
          content: parseBlockElements(hel),
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
          content: parseInlineNodes(hel),
        });
      } else if (tag === 'p') {
        blocks.push({
          type: 'paragraph',
          attrs: { textAlign: hel.style.textAlign || 'left' },
          content: parseInlineNodes(hel),
        });
      } else if (tag === 'ul' || tag === 'ol') {
        const isTask = hel.getAttribute('data-type') === 'taskList';
        const items = Array.from(hel.children)
          .filter((li) => li.tagName.toLowerCase() === 'li')
          .map((li) => ({
            type: isTask ? 'taskItem' : 'listItem',
            attrs: isTask ? { checked: li.getAttribute('data-checked') === 'true' } : {},
            content:
              li.querySelector('p')
                ? parseBlockElements(li)
                : [{ type: 'paragraph', content: parseInlineNodes(li) }],
          }));
        blocks.push({
          type: isTask ? 'taskList' : tag === 'ol' ? 'orderedList' : 'bulletList',
          content: items,
        });
      } else if (tag === 'blockquote') {
        blocks.push({
          type: 'blockquote',
          content: hel.children.length > 0 ? parseBlockElements(hel) : [{ type: 'paragraph', content: parseInlineNodes(hel) }],
        });
      } else if (tag === 'pre') {
        blocks.push({
          type: 'codeBlock',
          content: [{ type: 'text', text: hel.textContent || '' }],
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
              return {
                type: isHeader ? 'tableHeader' : 'tableCell',
                attrs: {
                  colspan: parseInt(cel.getAttribute('colspan') || '1', 10),
                  rowspan: parseInt(cel.getAttribute('rowspan') || '1', 10),
                  backgroundColor: cel.getAttribute('data-bg-color') || cel.style.backgroundColor || null,
                },
                content: cel.children.length > 0 ? parseBlockElements(cel) : [{ type: 'paragraph', content: parseInlineNodes(cel) }],
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
        blocks.push(...parseBlockElements(hel));
      }
    });
    return blocks;
  };

  return { type: 'doc', content: parseBlockElements(dom.body) };
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

function buildInlineRuns(
  contentNodes: any[] | undefined,
  defaults: { fontSizePt: number; colorHex: string; bold?: boolean; italics?: boolean; fontFamily?: string }
): (TextRun | ExternalHyperlink | DocxMath)[] {
  if (!contentNodes || contentNodes.length === 0) return [];

  const children: (TextRun | ExternalHyperlink | DocxMath)[] = [];

  for (const item of contentNodes) {
    if (item.type === 'hardBreak') {
      children.push(new TextRun({ break: 1 }));
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
      } else if (m.type === 'textStyle' && m.attrs?.color) {
        colorHex = cleanHex(m.attrs.color, colorHex);
      } else if (m.type === 'fontSize' && m.attrs?.size) {
        fontPt = parsePtSize(m.attrs.size, fontPt);
      } else if (m.type === 'fontFamily' && m.attrs?.font) {
        fontFam = primaryFontName(m.attrs.font);
      } else if (m.type === 'highlight') {
        highlightHex = cleanHex(m.attrs?.color || '#FEF08A', 'FEF08A');
      } else if (m.type === 'link' && m.attrs?.href) {
        linkHref = String(m.attrs.href);
      }
    }

    const effectivePt = isCode ? Math.max(8, fontPt - 1) : fontPt;
    const run = new TextRun({
      text: item.text,
      bold: isBold,
      italics: isItalic,
      strike: isStrike,
      subScript: isSub,
      superScript: isSup,
      font: fontFam,
      size: Math.round(effectivePt * PT_TO_HALF_PT),
      color: linkHref && colorHex === defaults.colorHex ? '0563C1' : colorHex,
      underline: isUnderline || linkHref ? { type: UnderlineType.SINGLE } : undefined,
      shading: highlightHex
        ? { type: ShadingType.CLEAR, color: 'auto', fill: highlightHex }
        : undefined,
    });

    if (linkHref) {
      children.push(
        new ExternalHyperlink({
          link: linkHref,
          children: [run],
        })
      );
    } else {
      children.push(run);
    }
  }

  return children;
}

function parseSpacingTwips(nodeAttrs: Record<string, any> | undefined, defaultAfterPt: number, defaultBeforePt = 0) {
  let beforeTwips = Math.round(defaultBeforePt * PT_TO_TWIPS);
  let afterTwips = Math.round(defaultAfterPt * PT_TO_TWIPS);
  let lineTwips = 276; // Word 1.15 multiple = 1.15 * 240 = 276

  if (nodeAttrs?.lineHeight) {
    const lh = parseFloat(String(nodeAttrs.lineHeight));
    if (Number.isFinite(lh) && lh > 0) {
      lineTwips = Math.round(lh * 240);
      if (!nodeAttrs.marginBottom && lh <= 1.0) {
        afterTwips = 40; // 2pt
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
    line: lineTwips,
    lineRule: LineRuleType.AUTO,
  };
}

async function convertNodesToDocxBlocks(
  rawNodes: any[],
  printableWidthTwips: number,
  printableWidthPx: number,
  options?: { insideCell?: boolean; defaultColorHex?: string }
): Promise<(Paragraph | DocxTable)[]> {
  const nodes = mergeContinuationNodes(rawNodes || []);
  const blocks: (Paragraph | DocxTable)[] = [];
  const baseColor = options?.defaultColorHex || '171C19';

  for (const node of nodes) {
    const type = node.type;
    const attrs = node.attrs || {};

    if (type === 'pageBreak' || type === 'sectionBreak') {
      blocks.push(new Paragraph({ children: [new DocxPageBreak()] }));
      continue;
    }

    if (type === 'horizontalRule') {
      blocks.push(
        new Paragraph({
          border: {
            bottom: { color: 'CBD5E1', space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }

    if (type === 'heading') {
      const level = Math.min(6, Math.max(1, Number(attrs.level || 1)));
      const headingSpecs: Record<
        number,
        { pt: number; color: string; beforePt: number; afterPt: number; italic?: boolean; headingLvl: any }
      > = {
        1: { pt: 20, color: '245C45', beforePt: 14, afterPt: 6, headingLvl: HeadingLevel.HEADING_1 },
        2: { pt: 15, color: '398568', beforePt: 12, afterPt: 4, headingLvl: HeadingLevel.HEADING_2 },
        3: { pt: 12.5, color: '171C19', beforePt: 10, afterPt: 3, headingLvl: HeadingLevel.HEADING_3 },
        4: { pt: 11, color: '245C45', beforePt: 8, afterPt: 2, italic: true, headingLvl: HeadingLevel.HEADING_4 },
        5: { pt: 10.5, color: '374151', beforePt: 6, afterPt: 2, headingLvl: HeadingLevel.HEADING_5 },
        6: { pt: 10, color: '6B7280', beforePt: 6, afterPt: 2, headingLvl: HeadingLevel.HEADING_6 },
      };
      const spec = headingSpecs[level] || headingSpecs[1];
      const indentLvl = Number(attrs.indent || 0);

      blocks.push(
        new Paragraph({
          heading: spec.headingLvl,
          keepNext: true,
          alignment: mapAlignment(attrs.textAlign),
          indent: indentLvl > 0 ? { left: indentLvl * 480 } : undefined,
          spacing: parseSpacingTwips(attrs, spec.afterPt, spec.beforePt),
          children: buildInlineRuns(node.content, {
            fontSizePt: spec.pt,
            colorHex: spec.color,
            bold: true,
            italics: spec.italic,
          }),
        })
      );
      continue;
    }

    if (type === 'paragraph') {
      const indentLvl = Number(attrs.indent || 0);
      const afterPt = options?.insideCell ? 2 : 6;
      blocks.push(
        new Paragraph({
          alignment: mapAlignment(attrs.textAlign),
          indent: indentLvl > 0 ? { left: indentLvl * 480 } : undefined,
          spacing: parseSpacingTwips(attrs, afterPt, 0),
          children: buildInlineRuns(node.content, {
            fontSizePt: options?.insideCell ? 10.5 : 11,
            colorHex: baseColor,
          }),
        })
      );
      continue;
    }

    if (type === 'bulletList' || type === 'orderedList' || type === 'taskList') {
      const renderListItems = async (listNode: any, depth: number) => {
        const lType = listNode.type;
        for (const li of listNode.content || []) {
          const checked = Boolean(li.attrs?.checked);
          for (const child of li.content || []) {
            if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
              await renderListItems(child, Math.min(8, depth + 1));
            } else if (child.type === 'paragraph') {
              const runs = buildInlineRuns(child.content, {
                fontSizePt: 11,
                colorHex: lType === 'taskList' && checked ? '6B7280' : baseColor,
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
                    indent: { left: (depth + 1) * 360 },
                    spacing: { before: 0, after: 60, line: 276 },
                    children: [boxPrefix, ...runs],
                  })
                );
              } else {
                blocks.push(
                  new Paragraph({
                    numbering:
                      lType === 'orderedList'
                        ? { reference: 'docium-numbered-list', level: depth }
                        : undefined,
                    bullet: lType === 'bulletList' ? { level: depth } : undefined,
                    spacing: { before: 0, after: 60, line: 276 },
                    children: runs,
                  })
                );
              }
            }
          }
        }
      };
      await renderListItems(node, 0);
      continue;
    }

    if (type === 'blockquote') {
      const inner = node.content || [];
      const bColor = cleanHex(attrs.borderColor || '#245C45', '245C45');
      for (const child of inner) {
        blocks.push(
          new Paragraph({
            indent: { left: 360 },
            border: {
              left: { color: bColor, space: 10, style: BorderStyle.SINGLE, size: 18 },
            },
            spacing: { before: 80, after: 80, line: 276 },
            children: buildInlineRuns(child.content, {
              fontSizePt: 11,
              colorHex: '4B5563',
              italics: true,
            }),
          })
        );
      }
      continue;
    }

    if (type === 'callout') {
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
        printableWidthTwips - 400,
        printableWidthPx - 32,
        { insideCell: true, defaultColorHex: pal.text }
      );

      blocks.push(
        new DocxTable({
          width: { size: printableWidthTwips, type: WidthType.DXA },
          columnWidths: [printableWidthTwips],
          rows: [
            new DocxTableRow({
              children: [
                new DocxTableCell({
                  width: { size: printableWidthTwips, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: pal.bg },
                  margins: { top: 140, bottom: 140, left: 200, right: 180 },
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
      blocks.push(new Paragraph({ spacing: { before: 0, after: 80 } }));
      continue;
    }

    if (type === 'codeBlock') {
      const codeText = (node.content || []).map((c: any) => c.text || '').join('');
      const codeLines = codeText.split(/\r?\n/);
      const codeBgHex = cleanHex(attrs.backgroundColor || '#F4F6F4', 'F4F6F4');
      const codeTextHex = cleanHex(attrs.textColor || '#171C19', '171C19');
      const codeBorderHex = cleanHex(attrs.borderColor || '#DCE2DA', 'DCE2DA');
      const codeParas = codeLines.map(
        (ln: string) =>
          new Paragraph({
            spacing: { before: 0, after: 20, line: 240 },
            children: [
              new TextRun({
                text: ln || ' ',
                font: 'Consolas',
                size: 19, // 9.5pt
                color: codeTextHex,
              }),
            ],
          })
      );

      blocks.push(
        new DocxTable({
          width: { size: printableWidthTwips, type: WidthType.DXA },
          columnWidths: [printableWidthTwips],
          rows: [
            new DocxTableRow({
              cantSplit: false,
              children: [
                new DocxTableCell({
                  width: { size: printableWidthTwips, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: codeBgHex },
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
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
      blocks.push(new Paragraph({ spacing: { before: 0, after: 80 } }));
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
      const hPx = Math.max(40, Number(attrs.height || Math.round(wPx * 0.62)));
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
      const pmRows: any[] = node.content || [];
      if (pmRows.length === 0) continue;

      // Determine logical column count and column widths (preserving user-resized Tiptap colwidth!)
      let totalCols = 0;
      const firstRowCells = pmRows[0]?.content || [];
      const rawPxWidths: number[] = [];

      for (const c of firstRowCells) {
        const span = Math.max(1, Number(c.attrs?.colspan || 1));
        totalCols += span;
        const cwArr = Array.isArray(c.attrs?.colwidth) ? c.attrs.colwidth : null;
        for (let k = 0; k < span; k++) {
          rawPxWidths.push(cwArr && cwArr[k] ? Number(cwArr[k]) : 0);
        }
      }
      totalCols = Math.max(1, totalCols);

      let colWidthsTwips: number[] = [];
      const hasCustomWidths = rawPxWidths.some((w) => w > 0);
      if (hasCustomWidths) {
        const defaultColPx = printableWidthPx / totalCols;
        const filledPx = rawPxWidths.map((w) => (w > 0 ? w : defaultColPx));
        const sumPx = filledPx.reduce((a, b) => a + b, 0) || printableWidthPx;
        colWidthsTwips = filledPx.map((px) => Math.max(360, Math.round((px / sumPx) * printableWidthTwips)));
      } else {
        const evenTwips = Math.floor(printableWidthTwips / totalCols);
        colWidthsTwips = Array(totalCols).fill(evenTwips);
      }

      const docxRows: DocxTableRow[] = [];
      for (let rIdx = 0; rIdx < pmRows.length; rIdx++) {
        const rowNode = pmRows[rIdx];
        const cells = rowNode.content || [];
        const isHeaderRow = rIdx === 0 && cells.every((c: any) => c.type === 'tableHeader');
        const docxCells: DocxTableCell[] = [];

        let colCursor = 0;
        for (const cellNode of cells) {
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

          // If cell has dark background (like Forest/Executive preset header), ensure default text is white
          const isDarkBg =
            bgHex === '245C45' || bgHex === '1E293B' || bgHex === '171C19' || bgHex === '1E3A8A';

          const bStyleAttr = cAttrs.borderStyle || 'solid';
          const bColorHex = cleanHex(cAttrs.borderColor || '#CBD5E1', 'CBD5E1');
          const docxBorderStyle =
            bStyleAttr === 'none'
              ? BorderStyle.NONE
              : bStyleAttr === 'dashed'
              ? BorderStyle.DASHED
              : BorderStyle.SINGLE;
          const borderEntry = {
            style: docxBorderStyle,
            size: bStyleAttr === 'none' ? 0 : 4,
            color: bColorHex,
          };

          const vAlign =
            cAttrs.verticalAlign === 'middle'
              ? VerticalAlign.CENTER
              : cAttrs.verticalAlign === 'bottom'
              ? VerticalAlign.BOTTOM
              : VerticalAlign.TOP;

          const cellChildren = await convertNodesToDocxBlocks(
            cellNode.content || [],
            Math.max(400, cellWidthTwips - 220),
            Math.max(60, Math.round((cellWidthTwips / printableWidthTwips) * printableWidthPx) - 16),
            {
              insideCell: true,
              defaultColorHex: isDarkBg ? 'FFFFFF' : '171C19',
            }
          );

          // Bold header cells if not already styled
          const finalCellChildren =
            isTh && cellNode.content
              ? (cellNode.content as any[]).map(
                  (pNode: any) =>
                    new Paragraph({
                      alignment: mapAlignment(pNode.attrs?.textAlign),
                      spacing: { before: 0, after: 40, line: 260 },
                      children: buildInlineRuns(pNode.content, {
                        fontSizePt: 10.5,
                        colorHex: isDarkBg ? 'FFFFFF' : '171C19',
                        bold: true,
                      }),
                    })
                )
              : cellChildren;

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
              children: finalCellChildren.length > 0 ? finalCellChildren : [new Paragraph('')],
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
          layout: TableLayoutType.AUTOFIT,
          rows: docxRows,
        })
      );
      blocks.push(new Paragraph({ spacing: { before: 0, after: 80 } }));
    }
  }

  return blocks;
}

function buildHeaderParagraph(rawText: string, watermarkText?: string): Paragraph[] {
  const runs: any[] = [];
  if (watermarkText && watermarkText.trim()) {
    runs.push(
      new TextWatermark({
        text: watermarkText.trim(),
        color: '245C45',
        opacity: 0.14,
        bold: true,
      })
    );
  }

  if (rawText && rawText.trim()) {
    const parts = rawText.split(/(\{page\}|\{pages\})/gi);
    for (const part of parts) {
      if (/^\{page\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 19, color: '6B7280' }));
      } else if (/^\{pages\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 19, color: '6B7280' }));
      } else if (part) {
        runs.push(new TextRun({ text: part, font: 'Calibri', size: 19, color: '6B7280' }));
      }
    }
  }

  return [new Paragraph({ children: runs })];
}

function buildFooterParagraph(rawText: string, showPageNumbers: boolean): Paragraph[] {
  const runs: TextRun[] = [];
  const hasExplicitToken = /\{page\}/i.test(rawText || '');

  if (rawText && rawText.trim()) {
    const parts = rawText.split(/(\{page\}|\{pages\})/gi);
    for (const part of parts) {
      if (/^\{page\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 19, color: '6B7280' }));
      } else if (/^\{pages\}$/i.test(part)) {
        runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 19, color: '6B7280' }));
      } else if (part) {
        runs.push(new TextRun({ text: part, font: 'Calibri', size: 19, color: '6B7280' }));
      }
    }
  }

  if (showPageNumbers && !hasExplicitToken) {
    if (runs.length > 0) {
      runs.push(new TextRun({ text: '   •   Page ', font: 'Calibri', size: 19, color: '6B7280' }));
    } else {
      runs.push(new TextRun({ text: 'Page ', font: 'Calibri', size: 19, color: '6B7280' }));
    }
    runs.push(new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 19, color: '6B7280' }));
    runs.push(new TextRun({ text: ' of ', font: 'Calibri', size: 19, color: '6B7280' }));
    runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 19, color: '6B7280' }));
  }

  return [
    new Paragraph({
      alignment: showPageNumbers && !rawText?.trim() ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: runs,
    }),
  ];
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
  const bodyChildren = await convertNodesToDocxBlocks(
    docJson.content || [],
    printableWidthTwips,
    printableWidthPx
  );

  const pb = options?.pageBorder || 'none';
  const pageBordersConfig =
    pb !== 'none'
      ? {
          pageBorders: {
            display: 'allPages' as any,
            offsetFrom: 'page' as any,
            pageBorderTop: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pb === 'accent' ? 12 : 8,
              color: pb === 'accent' ? '245C45' : '374151',
              space: 24,
            },
            pageBorderBottom: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pb === 'accent' ? 12 : 8,
              color: pb === 'accent' ? '245C45' : '374151',
              space: 24,
            },
            pageBorderLeft: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pb === 'accent' ? 12 : 8,
              color: pb === 'accent' ? '245C45' : '374151',
              space: 24,
            },
            pageBorderRight: {
              style: pb === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
              size: pb === 'accent' ? 12 : 8,
              color: pb === 'accent' ? '245C45' : '374151',
              space: 24,
            },
          },
        }
      : {};

  const hasWatermark = Boolean(options?.watermarkText?.trim());
  const hasHeader = Boolean(options?.headerText?.trim() || options?.firstPageHeaderText?.trim() || hasWatermark);
  const hasFooter = Boolean(options?.footerText?.trim() || options?.firstPageFooterText?.trim() || options?.showPageNumbers);

  const wordDoc = new Document({
    title: cleanTitle,
    creator: 'Docium Workspace',
    background:
      options?.pageColor && options.pageColor.toUpperCase() !== '#FFFFFF'
        ? { color: cleanHex(options.pageColor, 'FFFFFF') }
        : undefined,
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22, // 11pt
            color: '171C19',
          },
          paragraph: {
            spacing: { line: 276, after: 120 },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'docium-numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
            {
              level: 2,
              format: LevelFormat.LOWER_ROMAN,
              text: '%3.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 2160, hanging: 360 } } },
            },
          ],
        },
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
              header: Math.min(720, Math.round(marginTopTwips * 0.5)),
              footer: Math.min(720, Math.round(marginBottomTwips * 0.5)),
            },
            ...pageBordersConfig,
          },
        },
        headers: hasHeader
          ? {
              default: new Header({
                children: buildHeaderParagraph(options?.headerText || '', options?.watermarkText),
              }),
              ...(options?.differentFirstPage
                ? {
                    first: new Header({
                      children: buildHeaderParagraph(options?.firstPageHeaderText || '', options?.watermarkText),
                    }),
                  }
                : {}),
            }
          : undefined,
        footers: hasFooter
          ? {
              default: new Footer({
                children: buildFooterParagraph(options?.footerText || '', Boolean(options?.showPageNumbers)),
              }),
              ...(options?.differentFirstPage
                ? {
                    first: new Footer({
                      children: buildFooterParagraph(options?.firstPageFooterText || '', false),
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
