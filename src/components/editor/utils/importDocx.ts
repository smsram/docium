/**
 * High-Fidelity Document Importer Utility
 * Parses incoming .docx archives via direct OOXML inspection (styles, themes, fonts,
 * colors, highlights, tables, shading, borders, column widths, lists, blockquotes,
 * callouts, code blocks, images, equations, spacing, page setup, headers/footers)
 * with graceful fallback to mammoth, plus .md, .html, and .txt support.
 */

import mammoth from 'mammoth';
import { convertMarkdownToDocumentHtml, escapeHtml } from './markdownToHtml';
import { PAPER_SIZES_MM } from './pageMetrics';
import type {
  DocumentMargins,
  DocumentOrientation,
  DocumentPageSize,
} from '@/lib/types';

export interface ImportedPageMetadata {
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins;
  columns?: 1 | 2 | 3;
  pageColor?: string;
  pageBorder?: 'none' | 'box' | 'shadow' | 'double' | 'accent';
  pageBorderColor?: string;
  pageBorderWidth?: number;
  pageBorderOffset?: 'edge' | 'margin' | 'wide';
  differentFirstPage?: boolean;
  headerText?: string;
  firstPageHeaderText?: string;
  footerText?: string;
  firstPageFooterText?: string;
  headerAlign?: 'left' | 'center' | 'right';
  footerAlign?: 'left' | 'center' | 'right';
  showHeaderLine?: boolean;
  showFooterLine?: boolean;
  showPageNumbers?: boolean;
}

export interface ParsedImportedDocument {
  title: string;
  html: string;
  metadata?: ImportedPageMetadata;
}

const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p[style-name='Code'] => pre:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  'u => u',
  'strike => s',
  'b => strong',
  'i => em',
];

const TWIPS_PER_MM = 1440 / 25.4;
const EMUS_PER_PX = 9525;

const WORD_HIGHLIGHT_MAP: Record<string, string> = {
  yellow: '#FEF08A',
  green: '#BBF7D0',
  cyan: '#A5F3FC',
  magenta: '#F5D0FE',
  blue: '#BFDBFE',
  red: '#FCA5A5',
  darkblue: '#1E3A8A',
  darkcyan: '#155E75',
  darkgreen: '#166534',
  darkmagenta: '#86198F',
  darkred: '#991B1B',
  darkyellow: '#CA8A04',
  darkgray: '#4B5563',
  lightgray: '#E5E7EB',
  black: '#111827',
  white: '#FFFFFF',
};

const CALLOUT_BG_TO_TYPE: Record<string, string> = {
  ECFDF5: 'info',
  EFF6FF: 'tip',
  FFFBEB: 'warning',
  FFF1F2: 'danger',
  F5F5F4: 'note',
};

// ==================== ZERO-DEPENDENCY OOXML XML TREE PARSER ====================

interface XmlNode {
  tag: string;
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text?: string;
}

function decodeXmlEntities(str: string): string {
  return str.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (full, entity) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        if (entity.startsWith('#x')) {
          const cp = parseInt(entity.slice(2), 16);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
        }
        if (entity.startsWith('#')) {
          const cp = parseInt(entity.slice(1), 10);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
        }
        return full;
    }
  });
}

function parseXmlAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(raw)) !== null) {
    const key = m[1];
    const val = decodeXmlEntities(m[2] !== undefined ? m[2] : m[3] || '');
    attrs[key] = val;
    const colon = key.indexOf(':');
    if (colon !== -1) {
      const localKey = key.slice(colon + 1);
      if (!(localKey in attrs)) attrs[localKey] = val;
    }
  }
  return attrs;
}

function parseXmlTree(xmlInput: string): XmlNode {
  const xml = xmlInput.replace(/^\uFEFF/, '');
  const root: XmlNode = { tag: '#root', local: '#root', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let pos = 0;
  const len = xml.length;

  while (pos < len) {
    const lt = xml.indexOf('<', pos);
    if (lt === -1) {
      const tail = xml.slice(pos);
      if (tail) {
        stack[stack.length - 1].children.push({
          tag: '#text',
          local: '#text',
          attrs: {},
          children: [],
          text: decodeXmlEntities(tail),
        });
      }
      break;
    }

    if (lt > pos) {
      const textChunk = xml.slice(pos, lt);
      const parent = stack[stack.length - 1];
      if (
        parent.local === 't' ||
        parent.local === 'delText' ||
        parent.local === 'instrText' ||
        /\S/.test(textChunk)
      ) {
        parent.children.push({
          tag: '#text',
          local: '#text',
          attrs: {},
          children: [],
          text: decodeXmlEntities(textChunk),
        });
      }
    }

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      pos = end === -1 ? len : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      pos = end === -1 ? len : end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      const cdata = end === -1 ? xml.slice(lt + 9) : xml.slice(lt + 9, end);
      stack[stack.length - 1].children.push({
        tag: '#text',
        local: '#text',
        attrs: {},
        children: [],
        text: cdata,
      });
      pos = end === -1 ? len : end + 3;
      continue;
    }
    if (xml.startsWith('</', lt)) {
      const gt = xml.indexOf('>', lt + 2);
      if (gt === -1) break;
      const closeTag = xml.slice(lt + 2, gt).trim();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === closeTag || stack[i].local === closeTag.split(':').pop()) {
          stack.length = i;
          break;
        }
      }
      pos = gt + 1;
      continue;
    }

    // Opening or self-closing tag (handle quoted > safely)
    let gt = -1;
    let quote: string | null = null;
    for (let i = lt + 1; i < len; i++) {
      const ch = xml[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        gt = i;
        break;
      }
    }
    if (gt === -1) break;

    const rawTag = xml.slice(lt + 1, gt);
    const selfClosing = rawTag.endsWith('/');
    const tagBody = selfClosing ? rawTag.slice(0, -1).trim() : rawTag.trim();
    const spaceMatch = tagBody.match(/^([^\s/>]+)([\s\S]*)$/);
    const tagName = spaceMatch ? spaceMatch[1] : tagBody;
    const colon = tagName.indexOf(':');
    const localName = colon !== -1 ? tagName.slice(colon + 1) : tagName;
    const attrs = spaceMatch && spaceMatch[2] ? parseXmlAttrs(spaceMatch[2]) : {};
    const node: XmlNode = { tag: tagName, local: localName, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
    pos = gt + 1;
  }

  return root;
}

function childElements(node: XmlNode | undefined, localName?: string): XmlNode[] {
  if (!node) return [];
  const res: XmlNode[] = [];
  for (const ch of node.children) {
    if (ch.local === '#text') continue;
    if (!localName || ch.local === localName) res.push(ch);
  }
  return res;
}

function firstChild(node: XmlNode | undefined, localName: string): XmlNode | undefined {
  if (!node) return undefined;
  return node.children.find((ch) => ch.local === localName);
}

function getAttr(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return node.attrs[name] ?? node.attrs[`w:${name}`] ?? node.attrs[`r:${name}`] ?? node.attrs[`a:${name}`];
}

function collectNodeText(node: XmlNode | undefined): string {
  if (!node) return '';
  if (node.local === '#text') return node.text || '';
  return node.children.map((ch) => collectNodeText(ch)).join('');
}

function unwrapContainerNodes(nodes: XmlNode[]): XmlNode[] {
  const out: XmlNode[] = [];
  for (const n of nodes) {
    if (n.local === 'AlternateContent') {
      const choice = firstChild(n, 'Choice');
      const fallback = firstChild(n, 'Fallback');
      const chosen = choice && childElements(choice).length > 0 ? choice : fallback;
      if (chosen) out.push(...unwrapContainerNodes(childElements(chosen)));
    } else if (n.local === 'sdt') {
      const sdtContent = firstChild(n, 'sdtContent');
      if (sdtContent) out.push(...unwrapContainerNodes(childElements(sdtContent)));
    } else if (n.local === 'ins' || n.local === 'smartTag' || n.local === 'customXml') {
      out.push(...unwrapContainerNodes(childElements(n)));
    } else if (n.local === 'del' || n.local === 'moveFrom') {
      continue;
    } else {
      out.push(n);
    }
  }
  return out;
}

// ==================== THEME & COLOR HELPERS ====================

interface ThemeInfo {
  colors: Record<string, string>;
  majorFont?: string;
  minorFont?: string;
}

function applyTintShadeHex(hex6: string, tintHex?: string, shadeHex?: string): string {
  const clean = hex6.replace('#', '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(clean)) return `#${clean}`;
  let r = parseInt(clean.slice(0, 2), 16) / 255;
  let g = parseInt(clean.slice(2, 4), 16) / 255;
  let b = parseInt(clean.slice(4, 6), 16) / 255;

  const tint = tintHex ? parseInt(tintHex, 16) / 255 : null;
  const shade = shadeHex ? parseInt(shadeHex, 16) / 255 : null;

  if (tint !== null && Number.isFinite(tint) && tint > 0 && tint <= 1) {
    r = r * tint + (1 - tint);
    g = g * tint + (1 - tint);
    b = b * tint + (1 - tint);
  }
  if (shade !== null && Number.isFinite(shade) && shade > 0 && shade <= 1) {
    r = r * shade;
    g = g * shade;
    b = b * shade;
  }

  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseThemeXml(xmlStr: string | undefined): ThemeInfo {
  const info: ThemeInfo = {
    colors: {
      dk1: '000000',
      lt1: 'FFFFFF',
      dk2: '1F497D',
      lt2: 'EEECE1',
      accent1: '4F81BD',
      accent2: 'C0504D',
      accent3: '9BBB59',
      accent4: '8064A2',
      accent5: '4BACC6',
      accent6: 'F79646',
      hlink: '0563C1',
      folHlink: '954F72',
    },
  };
  if (!xmlStr) return info;
  const tree = parseXmlTree(xmlStr);
  const findFirst = (node: XmlNode, name: string): XmlNode | undefined => {
    if (node.local === name) return node;
    for (const ch of node.children) {
      const found = findFirst(ch, name);
      if (found) return found;
    }
    return undefined;
  };

  const clrScheme = findFirst(tree, 'clrScheme');
  if (clrScheme) {
    for (const ch of childElements(clrScheme)) {
      const srgb = firstChild(ch, 'srgbClr');
      const sysClr = firstChild(ch, 'sysClr');
      const val = getAttr(srgb, 'val') || getAttr(sysClr, 'lastClr');
      if (val && /^[0-9a-fA-F]{6}$/.test(val)) {
        info.colors[ch.local] = val.toUpperCase();
      }
    }
  }

  const fontScheme = findFirst(tree, 'fontScheme');
  if (fontScheme) {
    const major = firstChild(fontScheme, 'majorFont');
    const minor = firstChild(fontScheme, 'minorFont');
    const majLatin = getAttr(firstChild(major, 'latin'), 'typeface');
    const minLatin = getAttr(firstChild(minor, 'latin'), 'typeface');
    if (majLatin) info.majorFont = majLatin;
    if (minLatin) info.minorFont = minLatin;
  }

  return info;
}

function resolveColorNode(node: XmlNode | undefined, theme: ThemeInfo): string | undefined {
  if (!node) return undefined;
  const val = getAttr(node, 'val');
  const themeColor = getAttr(node, 'themeColor');
  const tint = getAttr(node, 'themeTint');
  const shade = getAttr(node, 'themeShade');

  if (themeColor) {
    const aliasMap: Record<string, string> = {
      tx1: 'dk1',
      tx2: 'dk2',
      bg1: 'lt1',
      bg2: 'lt2',
      dark1: 'dk1',
      light1: 'lt1',
      dark2: 'dk2',
      light2: 'lt2',
      hyperlink: 'hlink',
      followedHyperlink: 'folHlink',
    };
    const key = aliasMap[themeColor] || themeColor;
    const baseHex = theme.colors[key];
    if (baseHex) {
      return applyTintShadeHex(baseHex, tint, shade);
    }
  }

  if (val && val.toLowerCase() !== 'auto' && val.toLowerCase() !== 'none') {
    const clean = val.replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      return applyTintShadeHex(clean, tint, shade);
    }
  }
  return undefined;
}

// ==================== OOXML STYLE & NUMBERING MODELS ====================

interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string;
  highlight?: string;
  fontSizePt?: number;
  fontFamily?: string;
}

interface ParaProps {
  styleId?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  indentPt?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineTwips?: number;
  lineRule?: string;
  pageBreakBefore?: boolean;
  outlineLvl?: number;
  leftBorderColor?: string;
  leftBorderSz?: number;
  bottomBorderColor?: string;
  bottomBorderStyle?: string;
  numId?: string;
  ilvl?: number;
  defaultRPr?: RunProps;
}

interface StyleEntry {
  id: string;
  type: string;
  name: string;
  basedOn?: string;
  isDefault?: boolean;
  pPr: ParaProps;
  rPr: RunProps;
}

function parseBoolToggle(el: XmlNode | undefined): boolean | undefined {
  if (!el) return undefined;
  const val = getAttr(el, 'val');
  if (val === undefined) return true;
  return val !== '0' && val.toLowerCase() !== 'false' && val.toLowerCase() !== 'off';
}

function resolveThemeFont(rawFont: string | undefined, theme: ThemeInfo): string | undefined {
  if (!rawFont) return undefined;
  const lower = rawFont.toLowerCase();
  if (lower.startsWith('+mj') || lower.startsWith('major')) return theme.majorFont || 'Calibri Light';
  if (lower.startsWith('+mn') || lower.startsWith('minor')) return theme.minorFont || 'Calibri';
  return rawFont;
}

function parseRunPropsNode(rPrNode: XmlNode | undefined, theme: ThemeInfo): RunProps {
  const props: RunProps = {};
  if (!rPrNode) return props;

  const bEl = firstChild(rPrNode, 'b');
  if (bEl) props.bold = parseBoolToggle(bEl);
  const iEl = firstChild(rPrNode, 'i');
  if (iEl) props.italic = parseBoolToggle(iEl);
  const uEl = firstChild(rPrNode, 'u');
  if (uEl) {
    const uVal = (getAttr(uEl, 'val') || 'single').toLowerCase();
    props.underline = uVal !== 'none' && uVal !== '0' && uVal !== 'false';
  }
  const strikeEl = firstChild(rPrNode, 'strike') || firstChild(rPrNode, 'dstrike');
  if (strikeEl) props.strike = parseBoolToggle(strikeEl);

  const vertAlign = firstChild(rPrNode, 'vertAlign');
  if (vertAlign) {
    const v = (getAttr(vertAlign, 'val') || '').toLowerCase();
    props.superscript = v === 'superscript';
    props.subscript = v === 'subscript';
  }

  const colorEl = firstChild(rPrNode, 'color');
  const resolvedColor = resolveColorNode(colorEl, theme);
  if (resolvedColor) props.color = resolvedColor;

  const hlEl = firstChild(rPrNode, 'highlight');
  if (hlEl) {
    const hlVal = (getAttr(hlEl, 'val') || '').toLowerCase();
    if (WORD_HIGHLIGHT_MAP[hlVal]) props.highlight = WORD_HIGHLIGHT_MAP[hlVal];
  }
  if (!props.highlight) {
    const shdEl = firstChild(rPrNode, 'shd');
    if (shdEl) {
      const fill = resolveColorNode({ ...shdEl, attrs: { val: getAttr(shdEl, 'fill') || '', themeColor: getAttr(shdEl, 'themeFill') || '', themeTint: getAttr(shdEl, 'themeFillTint') || '', themeShade: getAttr(shdEl, 'themeFillShade') || '' } }, theme);
      if (fill && fill !== '#FFFFFF') props.highlight = fill;
    }
  }

  const szEl = firstChild(rPrNode, 'sz');
  if (szEl) {
    const halfPts = parseFloat(getAttr(szEl, 'val') || '');
    if (Number.isFinite(halfPts) && halfPts > 0) props.fontSizePt = halfPts / 2;
  }

  const rFonts = firstChild(rPrNode, 'rFonts');
  if (rFonts) {
    const asciiTheme = getAttr(rFonts, 'asciiTheme') || getAttr(rFonts, 'hAnsiTheme');
    const explicit =
      getAttr(rFonts, 'ascii') ||
      getAttr(rFonts, 'hAnsi') ||
      getAttr(rFonts, 'cs') ||
      getAttr(rFonts, 'eastAsia');
    if (explicit && !explicit.startsWith('+')) {
      props.fontFamily = explicit;
    } else if (asciiTheme) {
      props.fontFamily = resolveThemeFont(asciiTheme, theme);
    } else if (explicit) {
      props.fontFamily = resolveThemeFont(explicit, theme);
    }
  }

  return props;
}

function parseParaPropsNode(pPrNode: XmlNode | undefined, theme: ThemeInfo): ParaProps {
  const props: ParaProps = {};
  if (!pPrNode) return props;

  const pStyle = firstChild(pPrNode, 'pStyle');
  if (pStyle) props.styleId = getAttr(pStyle, 'val');

  const jc = firstChild(pPrNode, 'jc');
  if (jc) {
    const v = (getAttr(jc, 'val') || '').toLowerCase();
    if (v === 'center') props.align = 'center';
    else if (v === 'right' || v === 'end') props.align = 'right';
    else if (v === 'both' || v === 'distribute') props.align = 'justify';
    else if (v === 'left' || v === 'start') props.align = 'left';
  }

  const ind = firstChild(pPrNode, 'ind');
  if (ind) {
    const leftTwips = parseFloat(getAttr(ind, 'left') || getAttr(ind, 'start') || '');
    if (Number.isFinite(leftTwips) && leftTwips > 0) {
      props.indentPt = leftTwips / 20;
    }
  }

  const spacing = firstChild(pPrNode, 'spacing');
  if (spacing) {
    const before = parseFloat(getAttr(spacing, 'before') || '');
    const after = parseFloat(getAttr(spacing, 'after') || '');
    const line = parseFloat(getAttr(spacing, 'line') || '');
    const lineRule = getAttr(spacing, 'lineRule');
    if (Number.isFinite(before)) props.spaceBeforePt = Math.round((before / 20) * 10) / 10;
    if (Number.isFinite(after)) props.spaceAfterPt = Math.round((after / 20) * 10) / 10;
    if (Number.isFinite(line) && line > 0) props.lineTwips = line;
    if (lineRule) props.lineRule = lineRule;
  }

  if (firstChild(pPrNode, 'pageBreakBefore')) {
    props.pageBreakBefore = true;
  }

  const outlineLvl = firstChild(pPrNode, 'outlineLvl');
  if (outlineLvl) {
    const lvl = parseInt(getAttr(outlineLvl, 'val') || '', 10);
    if (Number.isFinite(lvl) && lvl >= 0 && lvl <= 5) props.outlineLvl = lvl;
  }

  const pBdr = firstChild(pPrNode, 'pBdr');
  if (pBdr) {
    const left = firstChild(pBdr, 'left');
    if (left) {
      const styleVal = (getAttr(left, 'val') || '').toLowerCase();
      if (styleVal && styleVal !== 'none' && styleVal !== 'nil') {
        props.leftBorderSz = parseFloat(getAttr(left, 'sz') || '12');
        props.leftBorderColor =
          resolveColorNode({ ...left, attrs: { val: getAttr(left, 'color') || '', themeColor: getAttr(left, 'themeColor') || '' } }, theme) ||
          '#245C45';
      }
    }
    const bottom = firstChild(pBdr, 'bottom');
    if (bottom) {
      const styleVal = (getAttr(bottom, 'val') || '').toLowerCase();
      if (styleVal && styleVal !== 'none' && styleVal !== 'nil') {
        props.bottomBorderStyle = styleVal;
        props.bottomBorderColor =
          resolveColorNode({ ...bottom, attrs: { val: getAttr(bottom, 'color') || '', themeColor: getAttr(bottom, 'themeColor') || '' } }, theme) ||
          '#CBD5E1';
      }
    }
  }

  const numPr = firstChild(pPrNode, 'numPr');
  if (numPr) {
    const numIdEl = firstChild(numPr, 'numId');
    const ilvlEl = firstChild(numPr, 'ilvl');
    const numId = getAttr(numIdEl, 'val');
    if (numId && numId !== '0') {
      props.numId = numId;
      props.ilvl = Math.max(0, Math.min(8, parseInt(getAttr(ilvlEl, 'val') || '0', 10) || 0));
    }
  }

  const rPr = firstChild(pPrNode, 'rPr');
  if (rPr) {
    props.defaultRPr = parseRunPropsNode(rPr, theme);
  }

  return props;
}

function mergeRunProps(...layers: (RunProps | undefined)[]): RunProps {
  const out: RunProps = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) {
        (out as Record<string, unknown>)[k] = v;
      }
    }
  }
  return out;
}

function mergeParaProps(...layers: (ParaProps | undefined)[]): ParaProps {
  const out: ParaProps = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (k === 'defaultRPr') {
        out.defaultRPr = mergeRunProps(out.defaultRPr, v as RunProps | undefined);
      } else if (v !== undefined) {
        (out as Record<string, unknown>)[k] = v;
      }
    }
  }
  return out;
}

interface StylesModel {
  defaultRPr: RunProps;
  defaultPPr: ParaProps;
  stylesById: Map<string, StyleEntry>;
  defaultParaStyleId?: string;
}

function parseStylesXml(xmlStr: string | undefined, theme: ThemeInfo): StylesModel {
  const model: StylesModel = {
    defaultRPr: {},
    defaultPPr: {},
    stylesById: new Map(),
  };
  if (!xmlStr) return model;
  const tree = parseXmlTree(xmlStr);
  const stylesRoot = firstChild(tree, 'styles');
  if (!stylesRoot) return model;

  const docDefaults = firstChild(stylesRoot, 'docDefaults');
  if (docDefaults) {
    const rPrDef = firstChild(firstChild(docDefaults, 'rPrDefault'), 'rPr');
    const pPrDef = firstChild(firstChild(docDefaults, 'pPrDefault'), 'pPr');
    model.defaultRPr = parseRunPropsNode(rPrDef, theme);
    model.defaultPPr = parseParaPropsNode(pPrDef, theme);
  }

  for (const st of childElements(stylesRoot, 'style')) {
    const id = getAttr(st, 'styleId');
    if (!id) continue;
    const type = getAttr(st, 'type') || 'paragraph';
    const name = getAttr(firstChild(st, 'name'), 'val') || id;
    const basedOn = getAttr(firstChild(st, 'basedOn'), 'val');
    const isDefault = getAttr(st, 'default') === '1';
    const entry: StyleEntry = {
      id,
      type,
      name,
      basedOn,
      isDefault,
      pPr: parseParaPropsNode(firstChild(st, 'pPr'), theme),
      rPr: parseRunPropsNode(firstChild(st, 'rPr'), theme),
    };
    model.stylesById.set(id, entry);
    if (isDefault && type === 'paragraph') {
      model.defaultParaStyleId = id;
    }
  }
  return model;
}

function resolveStyleChain(styles: StylesModel, styleId: string | undefined): { pPr: ParaProps; rPr: RunProps; style?: StyleEntry } {
  const chain: StyleEntry[] = [];
  const seen = new Set<string>();
  let curId = styleId;
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    const entry = styles.stylesById.get(curId);
    if (!entry) break;
    chain.unshift(entry);
    curId = entry.basedOn;
  }
  const primary = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const baseDefP = styleId ? undefined : styles.defaultParaStyleId ? styles.stylesById.get(styles.defaultParaStyleId) : undefined;
  return {
    pPr: mergeParaProps(styles.defaultPPr, baseDefP?.pPr, ...chain.map((c) => c.pPr)),
    rPr: mergeRunProps(styles.defaultRPr, baseDefP?.rPr, ...chain.map((c) => c.rPr)),
    style: primary,
  };
}

interface NumberingLevelSpec {
  format: string;
  start: number;
  text: string;
}

interface NumberingModel {
  resolveLevel: (numId: string, ilvl: number) => NumberingLevelSpec;
}

function parseNumberingXml(xmlStr: string | undefined): NumberingModel {
  const abstractLevels = new Map<string, Map<number, NumberingLevelSpec>>();
  const numMap = new Map<string, { abstractId: string; overrides: Map<number, NumberingLevelSpec> }>();

  if (xmlStr) {
    const tree = parseXmlTree(xmlStr);
    const root = firstChild(tree, 'numbering');
    if (root) {
      for (const abs of childElements(root, 'abstractNum')) {
        const absId = getAttr(abs, 'abstractNumId');
        if (!absId) continue;
        const lvlMap = new Map<number, NumberingLevelSpec>();
        for (const lvl of childElements(abs, 'lvl')) {
          const ilvl = parseInt(getAttr(lvl, 'ilvl') || '0', 10) || 0;
          const format = (getAttr(firstChild(lvl, 'numFmt'), 'val') || 'decimal').toLowerCase();
          const start = Math.max(1, parseInt(getAttr(firstChild(lvl, 'start'), 'val') || '1', 10) || 1);
          const text = getAttr(firstChild(lvl, 'lvlText'), 'val') || '';
          lvlMap.set(ilvl, { format, start, text });
        }
        abstractLevels.set(absId, lvlMap);
      }

      for (const num of childElements(root, 'num')) {
        const numId = getAttr(num, 'numId');
        const absId = getAttr(firstChild(num, 'abstractNumId'), 'val');
        if (!numId || !absId) continue;
        const overrides = new Map<number, NumberingLevelSpec>();
        for (const ov of childElements(num, 'lvlOverride')) {
          const ilvl = parseInt(getAttr(ov, 'ilvl') || '0', 10) || 0;
          const startOv = parseInt(getAttr(firstChild(ov, 'startOverride'), 'val') || '', 10);
          const lvlEl = firstChild(ov, 'lvl');
          const absSpec = abstractLevels.get(absId)?.get(ilvl) || { format: 'decimal', start: 1, text: '' };
          overrides.set(ilvl, {
            format: (getAttr(firstChild(lvlEl, 'numFmt'), 'val') || absSpec.format).toLowerCase(),
            start: Number.isFinite(startOv) ? Math.max(1, startOv) : absSpec.start,
            text: getAttr(firstChild(lvlEl, 'lvlText'), 'val') || absSpec.text,
          });
        }
        numMap.set(numId, { abstractId: absId, overrides });
      }
    }
  }

  return {
    resolveLevel(numId: string, ilvl: number): NumberingLevelSpec {
      const entry = numMap.get(numId);
      if (!entry) return { format: 'bullet', start: 1, text: '' };
      return (
        entry.overrides.get(ilvl) ||
        abstractLevels.get(entry.abstractId)?.get(ilvl) ||
        { format: 'bullet', start: 1, text: '' }
      );
    },
  };
}

// ==================== RELATIONSHIPS & MEDIA ====================

interface RelEntry {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
}

function parseRelsXml(xmlStr: string | undefined): Map<string, RelEntry> {
  const map = new Map<string, RelEntry>();
  if (!xmlStr) return map;
  const tree = parseXmlTree(xmlStr);
  const root = firstChild(tree, 'Relationships');
  if (!root) return map;
  for (const rel of childElements(root, 'Relationship')) {
    const id = getAttr(rel, 'Id');
    const target = getAttr(rel, 'Target') || '';
    const type = getAttr(rel, 'Type') || '';
    const targetMode = getAttr(rel, 'TargetMode');
    if (id) map.set(id, { id, type, target, targetMode });
  }
  return map;
}

function mimeTypeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/png';
}

function isEmojiOnlyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const stripped = trimmed.replace(
    /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\uFE0E|[\u{1F3FB}-\u{1F3FF}]|\u200D|\s)/gu,
    ''
  );
  return stripped.length === 0;
}

function formatStyleFontFamily(fontName: string): string {
  const clean = fontName.replace(/['"]/g, '').trim();
  return clean.includes(' ') ? `'${clean}'` : clean;
}

// ==================== HEADING / SPACING / RUN CONVERSION ====================

const DOCIUM_HEADING_DEFAULTS: Record<number, { pt: number; color: string; beforePt: number; afterPt: number; lh: number; italic?: boolean }> = {
  1: { pt: 20, color: '#245C45', beforePt: 14, afterPt: 6, lh: 1.25 },
  2: { pt: 15, color: '#398568', beforePt: 12, afterPt: 4, lh: 1.3 },
  3: { pt: 12.5, color: '#171C19', beforePt: 10, afterPt: 3, lh: 1.35 },
  4: { pt: 11, color: '#245C45', beforePt: 8, afterPt: 2, lh: 1.35, italic: true },
  5: { pt: 10.5, color: '#374151', beforePt: 6, afterPt: 2, lh: 1.35 },
  6: { pt: 10, color: '#6B7280', beforePt: 6, afterPt: 2, lh: 1.35 },
};

function detectHeadingLevel(pPr: ParaProps, style?: StyleEntry): number | null {
  const candidates = [pPr.styleId, style?.id, style?.name].filter(Boolean) as string[];
  for (const raw of candidates) {
    const norm = raw.trim().toLowerCase();
    if (norm === 'title') return 1;
    if (norm === 'subtitle') return 2;
    const m = norm.match(/^(?:heading|h)\s*([1-6])$/);
    if (m) return parseInt(m[1], 10);
  }
  if (typeof pPr.outlineLvl === 'number' && pPr.outlineLvl >= 0 && pPr.outlineLvl <= 5) {
    return pPr.outlineLvl + 1;
  }
  return null;
}

function mapImportedSpacingLineHeight(
  lineTwips: number | undefined,
  lineRule: string | undefined,
  effFontPt: number,
  defaultCssLh = 1.38
): string | null {
  if (!lineTwips || lineTwips <= 0) return null;
  if (!lineRule || lineRule.toLowerCase() === 'auto') {
    const wordMult = lineTwips / 240;
    if (Math.abs(wordMult - 1.15) < 0.04) return null;
    if (Math.abs(wordMult - 1.0) < 0.03) return '1';
    if (Math.abs(wordMult - 1.5) < 0.03) return '1.5';
    if (Math.abs(wordMult - 2.0) < 0.03) return '2';
    return String(Math.round(wordMult * 100) / 100);
  } else {
    const cssMult = lineTwips / (Math.max(8, effFontPt) * 20);
    if (Math.abs(cssMult - defaultCssLh) < 0.05) return null;
    if (Math.abs(cssMult - 1.38) < 0.05) return null;
    if (Math.abs(cssMult - 1.18) < 0.05) return '1';
    if (Math.abs(cssMult - 1.65) < 0.05) return '1.5';
    if (Math.abs(cssMult - 2.15) < 0.05) return '2';
    return String(Math.round((cssMult / 1.15) * 100) / 100);
  }
}

interface ParseContext {
  theme: ThemeInfo;
  styles: StylesModel;
  numbering: NumberingModel;
  rels: Map<string, RelEntry>;
  mediaDataUrls: Map<string, string>;
}

function findDeepFirst(node: XmlNode, localName: string): XmlNode | undefined {
  if (node.local === localName) return node;
  for (const ch of node.children) {
    const f = findDeepFirst(ch, localName);
    if (f) return f;
  }
  return undefined;
}

function findDeepAll(node: XmlNode, localName: string, acc: XmlNode[] = []): XmlNode[] {
  if (node.local === localName) acc.push(node);
  for (const ch of node.children) {
    findDeepAll(ch, localName, acc);
  }
  return acc;
}

function convertDrawingToHtml(drawingNode: XmlNode, ctx: ParseContext): string {
  const blip = findDeepFirst(drawingNode, 'blip');
  const embedId = blip ? getAttr(blip, 'embed') || getAttr(blip, 'link') : undefined;
  const imgData = firstChild(drawingNode, 'imagedata') || findDeepFirst(drawingNode, 'imagedata');
  const legacyRelId = imgData ? getAttr(imgData, 'id') : undefined;
  const rId = embedId || legacyRelId;
  if (!rId) return '';

  const rel = ctx.rels.get(rId);
  if (!rel) return '';
  const targetNorm = rel.target.replace(/^\/+/, '').replace(/^word\//, '');
  const dataUrl = ctx.mediaDataUrls.get(targetNorm) || ctx.mediaDataUrls.get(`word/${targetNorm}`);
  if (!dataUrl) return '';

  const extent = findDeepFirst(drawingNode, 'extent');
  let wAttr = '';
  let hAttr = '';
  if (extent) {
    const cx = parseFloat(getAttr(extent, 'cx') || '');
    const cy = parseFloat(getAttr(extent, 'cy') || '');
    if (Number.isFinite(cx) && cx > 0) wAttr = ` width="${Math.max(24, Math.round(cx / EMUS_PER_PX))}"`;
    if (Number.isFinite(cy) && cy > 0) hAttr = ` height="${Math.max(20, Math.round(cy / EMUS_PER_PX))}"`;
  }

  let alignment = 'center';
  const anchor = firstChild(drawingNode, 'anchor');
  if (anchor) {
    const alignEl = findDeepFirst(anchor, 'align');
    const posAlign = collectNodeText(alignEl).trim().toLowerCase();
    const wrapSquare = firstChild(anchor, 'wrapSquare');
    if (wrapSquare) {
      alignment = posAlign === 'right' ? 'float-right' : 'float-left';
    } else if (posAlign === 'left' || posAlign === 'right' || posAlign === 'center') {
      alignment = posAlign;
    }
  }

  const docPr = findDeepFirst(drawingNode, 'docPr');
  const alt = escapeHtml(getAttr(docPr, 'descr') || getAttr(docPr, 'name') || '');
  return `<img src="${dataUrl}"${wAttr}${hAttr} data-alignment="${alignment}"${alt ? ` alt="${alt}"` : ''}>`;
}

function renderRunHtml(
  runNode: XmlNode,
  inheritedRPr: RunProps,
  ctx: ParseContext,
  options?: { isHeading?: number; isCodeBlock?: boolean; insideCell?: boolean }
): { html: string; hasPageBreak: boolean; visibleText: string } {
  const rPrNode = firstChild(runNode, 'rPr');
  const rStyleId = getAttr(firstChild(rPrNode, 'rStyle'), 'val');
  const rStyleProps = rStyleId ? resolveStyleChain(ctx.styles, rStyleId).rPr : undefined;
  const directProps = parseRunPropsNode(rPrNode, ctx.theme);
  const eff = mergeRunProps(inheritedRPr, rStyleProps, directProps);

  let hasPageBreak = false;
  let visibleText = '';
  let bodyHtml = '';

  const children = unwrapContainerNodes(childElements(runNode));
  for (const ch of children) {
    if (ch.local === 't' || ch.local === 'delText') {
      const txt = collectNodeText(ch);
      visibleText += txt;
      bodyHtml += escapeHtml(txt);
    } else if (ch.local === 'br') {
      const brType = (getAttr(ch, 'type') || '').toLowerCase();
      if (brType === 'page') {
        hasPageBreak = true;
      } else {
        bodyHtml += '<br>';
      }
    } else if (ch.local === 'cr') {
      bodyHtml += '<br>';
    } else if (ch.local === 'tab') {
      visibleText += '    ';
      bodyHtml += '    ';
    } else if (ch.local === 'drawing' || ch.local === 'pict') {
      const imgHtml = convertDrawingToHtml(ch, ctx);
      if (imgHtml) bodyHtml += imgHtml;
    } else if (ch.local === 'sym') {
      const chHex = getAttr(ch, 'char');
      if (chHex) {
        const cp = parseInt(chHex, 16);
        if (Number.isFinite(cp)) {
          const s = String.fromCodePoint(cp);
          visibleText += s;
          bodyHtml += escapeHtml(s);
        }
      }
    }
  }

  if (!bodyHtml) {
    return { html: '', hasPageBreak, visibleText: '' };
  }

  if (options?.isCodeBlock || bodyHtml.startsWith('<img ')) {
    return { html: bodyHtml, hasPageBreak, visibleText };
  }

  const emojiOnly = isEmojiOnlyText(visibleText);
  const styles: string[] = [];
  const headingSpec = options?.isHeading ? DOCIUM_HEADING_DEFAULTS[options.isHeading] : undefined;

  if (!emojiOnly && eff.fontFamily) {
    const cleanFam = eff.fontFamily.replace(/['"]/g, '').trim();
    if (cleanFam && !(cleanFam.toLowerCase() === 'segoe ui emoji' && emojiOnly)) {
      styles.push(`font-family: ${formatStyleFontFamily(cleanFam)}`);
    }
  }

  if (eff.fontSizePt) {
    const pt = Math.round(eff.fontSizePt * 10) / 10;
    if (headingSpec) {
      if (Math.abs(pt - headingSpec.pt) > 0.25) {
        styles.push(`font-size: ${pt}pt`);
      }
    } else {
      styles.push(`font-size: ${pt}pt`);
    }
  }

  if (eff.color) {
    const upper = eff.color.toUpperCase();
    if (headingSpec) {
      if (upper !== headingSpec.color) {
        styles.push(`color: ${upper}`);
      }
    } else if (!options?.insideCell || upper !== '#171C19') {
      styles.push(`color: ${upper}`);
    }
  }

  let wrapped = bodyHtml;
  if (styles.length > 0) {
    wrapped = `<span style="${styles.join('; ')}">${wrapped}</span>`;
  }
  if (eff.highlight) {
    wrapped = `<mark data-color="${eff.highlight}" style="background-color: ${eff.highlight}">${wrapped}</mark>`;
  }

  // Note: for headings, only wrap bold/italic if not redundant or explicitly toggled
  if (eff.subscript) wrapped = `<sub>${wrapped}</sub>`;
  if (eff.superscript) wrapped = `<sup>${wrapped}</sup>`;
  if (eff.strike) wrapped = `<s>${wrapped}</s>`;
  if (eff.underline) wrapped = `<u>${wrapped}</u>`;
  if (eff.italic && !headingSpec?.italic) wrapped = `<em>${wrapped}</em>`;
  if (eff.bold && !headingSpec) wrapped = `<strong>${wrapped}</strong>`;

  return { html: wrapped, hasPageBreak, visibleText };
}

function renderParagraphContentHtml(
  pNode: XmlNode,
  inheritedRPr: RunProps,
  ctx: ParseContext,
  options?: { isHeading?: number; isCodeBlock?: boolean; insideCell?: boolean }
): {
  innerHtml: string;
  hasLeadingPageBreak: boolean;
  hasTrailingPageBreak: boolean;
  blockImages: string[];
  plainText: string;
} {
  let innerHtml = '';
  let plainText = '';
  let hasLeadingPageBreak = false;
  let hasTrailingPageBreak = false;
  const blockImages: string[] = [];

  const children = unwrapContainerNodes(childElements(pNode));
  for (const ch of children) {
    if (ch.local === 'pPr' || ch.local === 'bookmarkStart' || ch.local === 'bookmarkEnd') continue;

    if (ch.local === 'r') {
      const res = renderRunHtml(ch, inheritedRPr, ctx, options);
      if (res.hasPageBreak) {
        if (!innerHtml && !plainText) hasLeadingPageBreak = true;
        else hasTrailingPageBreak = true;
      }
      if (res.html.startsWith('<img ')) {
        blockImages.push(res.html);
      } else {
        innerHtml += res.html;
        plainText += res.visibleText;
      }
    } else if (ch.local === 'hyperlink') {
      const rId = getAttr(ch, 'id');
      const anchor = getAttr(ch, 'anchor');
      const rel = rId ? ctx.rels.get(rId) : undefined;
      const href = rel?.target || (anchor ? `#${anchor}` : '');
      let linkInner = '';
      for (const hr of unwrapContainerNodes(childElements(ch))) {
        if (hr.local === 'r') {
          const res = renderRunHtml(hr, inheritedRPr, ctx, options);
          linkInner += res.html;
          plainText += res.visibleText;
        }
      }
      if (linkInner) {
        innerHtml += href ? `<a href="${escapeHtml(href)}">${linkInner}</a>` : linkInner;
      }
    } else if (ch.local === 'oMath' || ch.local === 'oMathPara') {
      const mathTxt = collectNodeText(ch).trim();
      if (mathTxt) {
        plainText += mathTxt;
        innerHtml += escapeHtml(mathTxt);
      }
    } else if (ch.local === 'fldSimple') {
      let fldInner = '';
      for (const fr of unwrapContainerNodes(childElements(ch))) {
        if (fr.local === 'r') {
          const res = renderRunHtml(fr, inheritedRPr, ctx, options);
          fldInner += res.html;
          plainText += res.visibleText;
        }
      }
      innerHtml += fldInner;
    }
  }

  return { innerHtml, hasLeadingPageBreak, hasTrailingPageBreak, blockImages, plainText };
}

function buildParagraphTagAttrs(
  effP: ParaProps,
  defaultFontPt: number,
  options?: { headingLvl?: number | null; insideCell?: boolean; inBlockquote?: boolean }
): string {
  const attrs: string[] = [];
  const styles: string[] = [];

  if (effP.align && effP.align !== 'left') {
    styles.push(`text-align: ${effP.align}`);
  }

  if (effP.indentPt && effP.indentPt >= 9 && !options?.inBlockquote && !effP.numId) {
    const indentLvl = Math.max(1, Math.min(8, Math.round(effP.indentPt / 24)));
    attrs.push(`data-indent="${indentLvl}"`);
    styles.push(`margin-left: ${indentLvl * 24}pt`);
  }

  const defaultCssLh = options?.headingLvl ? DOCIUM_HEADING_DEFAULTS[options.headingLvl]?.lh ?? 1.38 : 1.38;
  const lhVal = mapImportedSpacingLineHeight(effP.lineTwips, effP.lineRule, defaultFontPt, defaultCssLh);
  if (lhVal) {
    attrs.push(`data-line-spacing="${lhVal}"`);
  }

  if (effP.spaceBeforePt !== undefined && !options?.insideCell && !options?.inBlockquote) {
    const defBefore = options?.headingLvl ? DOCIUM_HEADING_DEFAULTS[options.headingLvl]?.beforePt ?? 0 : 0;
    if (effP.spaceBeforePt > 0 && Math.abs(effP.spaceBeforePt - defBefore) > 1.5) {
      attrs.push(`data-space-before="${effP.spaceBeforePt}pt"`);
      styles.push(`margin-top: ${effP.spaceBeforePt}pt`);
    }
  }

  if (effP.spaceAfterPt !== undefined && !options?.insideCell && !options?.inBlockquote) {
    const defAfter = options?.headingLvl ? DOCIUM_HEADING_DEFAULTS[options.headingLvl]?.afterPt ?? 6 : 6;
    if (Math.abs(effP.spaceAfterPt - defAfter) > 1.5) {
      attrs.push(`data-space-after="${effP.spaceAfterPt}pt"`);
      styles.push(`margin-bottom: ${effP.spaceAfterPt}pt`);
    }
  }

  if (styles.length > 0) {
    attrs.push(`style="${styles.join('; ')}"`);
  }
  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

// ==================== TABLES (NORMAL / CALLOUT / CODEBLOCK) ====================

function parseBorderSpec(borderEl: XmlNode | undefined, theme: ThemeInfo): { style: string; color?: string; sz: number } {
  if (!borderEl) return { style: 'none', sz: 0 };
  const val = (getAttr(borderEl, 'val') || 'single').toLowerCase();
  if (val === 'none' || val === 'nil') return { style: 'none', sz: 0 };
  const sz = parseFloat(getAttr(borderEl, 'sz') || '4');
  const style = val.includes('dash') || val === 'dotted' ? 'dashed' : 'solid';
  const color = resolveColorNode(
    { ...borderEl, attrs: { val: getAttr(borderEl, 'color') || '', themeColor: getAttr(borderEl, 'themeColor') || '' } },
    theme
  );
  return { style, color: color || '#CBD5E1', sz };
}

function convertTableToHtml(tblNode: XmlNode, ctx: ParseContext): string {
  const tblPr = firstChild(tblNode, 'tblPr');
  const tblGrid = firstChild(tblNode, 'tblGrid');
  const colWidthsPx = childElements(tblGrid, 'gridCol').map((gc) => {
    const tw = parseFloat(getAttr(gc, 'w') || '0');
    return tw > 0 ? Math.max(40, Math.round(tw / 15)) : 120;
  });

  const tblBorders = firstChild(tblPr, 'tblBorders');
  const tblBorderDefault =
    parseBorderSpec(firstChild(tblBorders, 'insideH') || firstChild(tblBorders, 'top'), ctx.theme);

  const rowNodes = unwrapContainerNodes(childElements(tblNode)).filter((n) => n.local === 'tr');
  if (rowNodes.length === 0) return '';

  // Detect Docium Callout or CodeBlock exported as 1x1 styled table
  if (rowNodes.length === 1) {
    const firstCells = unwrapContainerNodes(childElements(rowNodes[0])).filter((n) => n.local === 'tc');
    if (firstCells.length === 1) {
      const tc = firstCells[0];
      const tcPr = firstChild(tc, 'tcPr');
      const shd = firstChild(tcPr, 'shd');
      const fillHex = resolveColorNode(
        shd ? { ...shd, attrs: { val: getAttr(shd, 'fill') || '', themeColor: getAttr(shd, 'themeFill') || '', themeTint: getAttr(shd, 'themeFillTint') || '', themeShade: getAttr(shd, 'themeFillShade') || '' } } : undefined,
        ctx.theme
      );
      const fillClean = fillHex?.replace('#', '').toUpperCase();
      const tcBorders = firstChild(tcPr, 'tcBorders');
      const leftB = parseBorderSpec(firstChild(tcBorders, 'left'), ctx.theme);
      const rightB = parseBorderSpec(firstChild(tcBorders, 'right'), ctx.theme);
      const topB = parseBorderSpec(firstChild(tcBorders, 'top'), ctx.theme);

      if (fillClean && CALLOUT_BG_TO_TYPE[fillClean] && leftB.sz >= 18 && rightB.style === 'none' && topB.style === 'none') {
        const cType = CALLOUT_BG_TO_TYPE[fillClean];
        const innerBlocks = convertBlockNodesToHtml(unwrapContainerNodes(childElements(tc)), ctx, { insideCell: true });
        return `<div data-type="callout" data-callout-type="${cType}">${innerBlocks || '<p></p>'}</div>`;
      }

      const tcParas = unwrapContainerNodes(childElements(tc)).filter((n) => n.local === 'p');
      const isCodeStyled =
        tcParas.length > 0 &&
        fillClean &&
        (fillClean === 'F4F6F4' || fillClean === 'EAF2ED' || fillClean === '1E293B' || fillClean === 'FDFBF3') &&
        leftB.style === 'solid' &&
        topB.style === 'solid' &&
        leftB.sz <= 8;
      if (isCodeStyled) {
        const codeLines = tcParas.map((p) => collectNodeText(p)).join('\n');
        const bg = `#${fillClean}`;
        const borderCol = leftB.color || '#DCE2DA';
        const firstColor = resolveColorNode(firstChild(firstChild(firstChild(tcParas[0], 'r'), 'rPr'), 'color'), ctx.theme) || '#171C19';
        return `<pre data-bg="${bg}" data-color="${firstColor}" data-border-color="${borderCol}" style="background-color: ${bg}; color: ${firstColor}; border-color: ${borderCol}"><code>${escapeHtml(codeLines)}</code></pre>`;
      }
    }
  }

  // Build row/col matrix tracking vertical merges (vMerge)
  interface CellEntry {
    tc: XmlNode;
    colspan: number;
    rowspan: number;
    skip: boolean;
    isHeader: boolean;
  }

  const matrix: CellEntry[][] = [];
  for (let rIdx = 0; rIdx < rowNodes.length; rIdx++) {
    const tr = rowNodes[rIdx];
    const trPr = firstChild(tr, 'trPr');
    const isHeaderRow = Boolean(firstChild(trPr, 'tblHeader'));
    const tcs = unwrapContainerNodes(childElements(tr)).filter((n) => n.local === 'tc');
    const rowEntries: CellEntry[] = [];
    let colCursor = 0;

    for (const tc of tcs) {
      const tcPr = firstChild(tc, 'tcPr');
      const span = Math.max(1, parseInt(getAttr(firstChild(tcPr, 'gridSpan'), 'val') || '1', 10) || 1);
      const vMergeEl = firstChild(tcPr, 'vMerge');
      const vMergeVal = vMergeEl ? (getAttr(vMergeEl, 'val') || 'continue').toLowerCase() : null;

      if (vMergeEl && vMergeVal !== 'restart') {
        // Walk upward to increment rowspan on the restart cell at this colCursor
        for (let prevR = rIdx - 1; prevR >= 0; prevR--) {
          const targetCell = matrix[prevR]?.find((e) => !e.skip && (e as any)._colIdx === colCursor);
          if (targetCell) {
            targetCell.rowspan += 1;
            break;
          }
        }
        rowEntries.push({ tc, colspan: span, rowspan: 1, skip: true, isHeader: isHeaderRow });
      } else {
        const entry: CellEntry & { _colIdx?: number } = { tc, colspan: span, rowspan: 1, skip: false, isHeader: isHeaderRow };
        entry._colIdx = colCursor;
        rowEntries.push(entry);
      }
      colCursor += span;
    }
    matrix.push(rowEntries);
  }

  let html = '<table>';
  if (colWidthsPx.length > 0) {
    html += `<colgroup>${colWidthsPx.map((w) => `<col style="width: ${w}px">`).join('')}</colgroup>`;
  }
  html += '<tbody>';

  for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
    html += '<tr>';
    let colCursor = 0;
    for (const entry of matrix[rIdx]) {
      if (entry.skip) {
        colCursor += entry.colspan;
        continue;
      }
      const tcPr = firstChild(entry.tc, 'tcPr');
      const shd = firstChild(tcPr, 'shd');
      const bgColor = shd
        ? resolveColorNode(
            {
              ...shd,
              attrs: {
                val: getAttr(shd, 'fill') || '',
                themeColor: getAttr(shd, 'themeFill') || '',
                themeTint: getAttr(shd, 'themeFillTint') || '',
                themeShade: getAttr(shd, 'themeFillShade') || '',
              },
            },
            ctx.theme
          )
        : undefined;

      const tcBorders = firstChild(tcPr, 'tcBorders');
      const anySide =
        firstChild(tcBorders, 'top') ||
        firstChild(tcBorders, 'left') ||
        firstChild(tcBorders, 'bottom') ||
        firstChild(tcBorders, 'right');
      const bSpec = anySide ? parseBorderSpec(anySide, ctx.theme) : tblBorderDefault;

      const vAlignRaw = (getAttr(firstChild(tcPr, 'vAlign'), 'val') || 'top').toLowerCase();
      const vAlign = vAlignRaw === 'center' ? 'middle' : vAlignRaw === 'bottom' ? 'bottom' : 'top';

      const tcWEl = firstChild(tcPr, 'tcW');
      const tcWTyp = (getAttr(tcWEl, 'type') || 'dxa').toLowerCase();
      const tcWVal = parseFloat(getAttr(tcWEl, 'w') || '0');
      let colwidthAttr = '';
      if (colWidthsPx.length > 0) {
        const sliced = colWidthsPx.slice(colCursor, colCursor + entry.colspan);
        if (sliced.length > 0) colwidthAttr = ` colwidth="${sliced.join(',')}"`;
      } else if (tcWTyp === 'dxa' && tcWVal > 0 && entry.colspan === 1) {
        colwidthAttr = ` colwidth="${Math.max(40, Math.round(tcWVal / 15))}"`;
      }
      colCursor += entry.colspan;

      const attrs: string[] = [];
      const styles: string[] = [];
      if (entry.colspan > 1) attrs.push(`colspan="${entry.colspan}"`);
      if (entry.rowspan > 1) attrs.push(`rowspan="${entry.rowspan}"`);
      if (bgColor && bgColor !== '#FFFFFF') {
        attrs.push(`data-bg-color="${bgColor}"`);
        styles.push(`background-color: ${bgColor}`);
      }
      if (bSpec.style === 'none') {
        attrs.push('data-border-style="none"');
        styles.push('border-style: none');
      } else {
        if (bSpec.color) {
          attrs.push(`data-border-color="${bSpec.color}"`);
          styles.push(`border-color: ${bSpec.color}`);
        }
        if (bSpec.style === 'dashed') {
          attrs.push('data-border-style="dashed"');
          styles.push('border-style: dashed');
        }
      }
      if (vAlign !== 'top') {
        attrs.push(`data-v-align="${vAlign}"`);
        styles.push(`vertical-align: ${vAlign}`);
      }
      if (styles.length > 0) attrs.push(`style="${styles.join('; ')}"`);

      const innerNodes = unwrapContainerNodes(childElements(entry.tc));
      const innerHtml = convertBlockNodesToHtml(innerNodes, ctx, { insideCell: true }) || '<p></p>';
      const tag = entry.isHeader ? 'th' : 'td';
      html += `<${tag}${colwidthAttr}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>${innerHtml}</${tag}>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// ==================== BLOCK STREAM -> HTML (LISTS, BLOCKQUOTES, HEADINGS, PARAS) ====================

function convertBlockNodesToHtml(
  rawNodes: XmlNode[],
  ctx: ParseContext,
  options?: { insideCell?: boolean }
): string {
  const nodes = unwrapContainerNodes(rawNodes);
  let html = '';

  type ListFrame = { kind: 'ul' | 'ol' | 'task'; ilvl: number; start: number; openLi: boolean };
  const listStack: ListFrame[] = [];

  const closeListsToLevel = (targetIlvl: number) => {
    while (listStack.length > 0 && listStack[listStack.length - 1].ilvl > targetIlvl) {
      const top = listStack.pop()!;
      if (top.openLi) html += '</li>';
      html += top.kind === 'ol' ? '</ol>' : '</ul>';
    }
  };

  const closeAllLists = () => closeListsToLevel(-1);

  let inBlockquote = false;
  const closeBlockquote = () => {
    if (inBlockquote) {
      html += '</blockquote>';
      inBlockquote = false;
    }
  };

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];

    if (node.local === 'tbl') {
      closeAllLists();
      closeBlockquote();
      html += convertTableToHtml(node, ctx);
      continue;
    }

    if (node.local !== 'p') continue;

    const pPrNode = firstChild(node, 'pPr');
    const directPPr = parseParaPropsNode(pPrNode, ctx.theme);
    const styleChain = resolveStyleChain(ctx.styles, directPPr.styleId);
    const effP = mergeParaProps(styleChain.pPr, directPPr);
    const effDefaultR = mergeRunProps(styleChain.rPr, effP.defaultRPr);

    const headingLvl = detectHeadingLevel(effP, styleChain.style);
    const contentRes = renderParagraphContentHtml(node, effDefaultR, ctx, {
      isHeading: headingLvl || undefined,
      insideCell: options?.insideCell,
    });

    if (effP.pageBreakBefore || contentRes.hasLeadingPageBreak) {
      closeAllLists();
      closeBlockquote();
      if (html.length > 0) {
        html += '<div data-type="page-break" class="docium-page-break"></div>';
      }
    }

    // Check horizontal rule (empty paragraph with bottom border)
    if (
      effP.bottomBorderStyle &&
      !contentRes.plainText.trim() &&
      contentRes.blockImages.length === 0
    ) {
      closeAllLists();
      closeBlockquote();
      html += '<hr>';
      continue;
    }

    // Standalone image-only paragraph
    if (!contentRes.plainText.trim() && contentRes.blockImages.length > 0 && !effP.numId) {
      closeAllLists();
      closeBlockquote();
      html += contentRes.blockImages.join('');
      if (contentRes.hasTrailingPageBreak) {
        html += '<div data-type="page-break" class="docium-page-break"></div>';
      }
      continue;
    }

    // List item paragraph
    if (effP.numId) {
      closeBlockquote();
      const ilvl = effP.ilvl ?? 0;
      const spec = ctx.numbering.resolveLevel(effP.numId, ilvl);
      const isTask = /^(?:☑|☐)\s+/.test(contentRes.plainText);
      const kind: 'ul' | 'ol' | 'task' = isTask ? 'task' : spec.format === 'bullet' ? 'ul' : 'ol';

      closeListsToLevel(ilvl);

      if (
        listStack.length > 0 &&
        listStack[listStack.length - 1].ilvl === ilvl &&
        listStack[listStack.length - 1].kind !== kind
      ) {
        const prev = listStack.pop()!;
        if (prev.openLi) html += '</li>';
        html += prev.kind === 'ol' ? '</ol>' : '</ul>';
      }

      if (listStack.length === 0 || listStack[listStack.length - 1].ilvl < ilvl) {
        const listTag = kind === 'ol' ? `<ol${spec.start > 1 ? ` start="${spec.start}"` : ''}>` : kind === 'task' ? '<ul data-type="taskList">' : '<ul>';
        html += listTag;
        listStack.push({ kind, ilvl, start: spec.start, openLi: false });
      }

      const cur = listStack[listStack.length - 1];
      if (cur.openLi) html += '</li>';
      if (kind === 'task') {
        const checked = contentRes.plainText.startsWith('☑');
        const cleanedInner = contentRes.innerHtml.replace(/^(?:<span[^>]*>)?\s*(?:☑|☐)\s*(?:<\/span>)?/, '');
        html += `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><p>${cleanedInner}</p>`;
      } else {
        const pAttrs = buildParagraphTagAttrs(effP, effDefaultR.fontSizePt || 11, { insideCell: options?.insideCell });
        html += `<li><p${pAttrs}>${contentRes.innerHtml}</p>`;
      }
      cur.openLi = true;

      if (contentRes.blockImages.length > 0) html += contentRes.blockImages.join('');
      if (contentRes.hasTrailingPageBreak) {
        closeAllLists();
        html += '<div data-type="page-break" class="docium-page-break"></div>';
      }
      continue;
    }

    closeAllLists();

    // Blockquote detection
    const styleNameLower = (styleChain.style?.name || '').toLowerCase();
    const isQuote =
      !headingLvl &&
      (styleNameLower === 'quote' ||
        styleNameLower === 'intense quote' ||
        Boolean(effP.leftBorderColor && (effP.leftBorderSz || 0) >= 8));

    if (isQuote) {
      if (!inBlockquote) {
        const bColAttr = effP.leftBorderColor ? ` style="border-left-color: ${effP.leftBorderColor}"` : '';
        html += `<blockquote${bColAttr}>`;
        inBlockquote = true;
      }
      const pAttrs = buildParagraphTagAttrs(effP, effDefaultR.fontSizePt || 11, { inBlockquote: true });
      html += `<p${pAttrs}>${contentRes.innerHtml}</p>`;
      if (contentRes.blockImages.length > 0) html += contentRes.blockImages.join('');
      continue;
    }

    closeBlockquote();

    if (headingLvl) {
      const defPt = DOCIUM_HEADING_DEFAULTS[headingLvl]?.pt || 12;
      const hAttrs = buildParagraphTagAttrs(effP, effDefaultR.fontSizePt || defPt, {
        headingLvl,
        insideCell: options?.insideCell,
      });
      html += `<h${headingLvl}${hAttrs}>${contentRes.innerHtml}</h${headingLvl}>`;
    } else {
      const pAttrs = buildParagraphTagAttrs(effP, effDefaultR.fontSizePt || 11, {
        insideCell: options?.insideCell,
      });
      html += `<p${pAttrs}>${contentRes.innerHtml}</p>`;
    }

    if (contentRes.blockImages.length > 0) {
      html += contentRes.blockImages.join('');
    }
    if (contentRes.hasTrailingPageBreak) {
      html += '<div data-type="page-break" class="docium-page-break"></div>';
    }
  }

  closeAllLists();
  closeBlockquote();
  return html;
}

// ==================== SECTION / HEADER / FOOTER EXTRACTION ====================

function extractHeaderFooterText(xmlStr: string | undefined): {
  text: string;
  align?: 'left' | 'center' | 'right';
  hasLine: boolean;
  hasPageField: boolean;
} {
  if (!xmlStr) return { text: '', hasLine: false, hasPageField: false };
  const tree = parseXmlTree(xmlStr);
  const root = firstChild(tree, 'hdr') || firstChild(tree, 'ftr');
  if (!root) return { text: '', hasLine: false, hasPageField: false };

  const paras = childElements(root, 'p');
  let outText = '';
  let align: 'left' | 'center' | 'right' | undefined;
  let hasLine = false;
  let hasPageField = false;

  for (const p of paras) {
    const pPr = firstChild(p, 'pPr');
    const jc = getAttr(firstChild(pPr, 'jc'), 'val')?.toLowerCase();
    if (jc === 'center' || jc === 'right' || jc === 'left') align = jc;
    const pBdr = firstChild(pPr, 'pBdr');
    if (firstChild(pBdr, 'bottom') || firstChild(pBdr, 'top')) hasLine = true;

    let inField = false;
    let fieldInstr = '';
    for (const ch of unwrapContainerNodes(childElements(p))) {
      if (ch.local === 'fldSimple') {
        const instr = (getAttr(ch, 'instr') || '').toUpperCase();
        if (instr.includes('NUMPAGES')) outText += '{pages}';
        else if (instr.includes('PAGE')) {
          outText += '{page}';
          hasPageField = true;
        }
        continue;
      }
      if (ch.local !== 'r') continue;
      const fldChar = firstChild(ch, 'fldChar');
      if (fldChar) {
        const typ = getAttr(fldChar, 'fldCharType');
        if (typ === 'begin') {
          inField = true;
          fieldInstr = '';
        } else if (typ === 'separate') {
          if (fieldInstr.toUpperCase().includes('NUMPAGES')) outText += '{pages}';
          else if (fieldInstr.toUpperCase().includes('PAGE')) {
            outText += '{page}';
            hasPageField = true;
          }
          inField = true;
        } else if (typ === 'end') {
          inField = false;
          fieldInstr = '';
        }
        continue;
      }
      const instrText = firstChild(ch, 'instrText');
      if (instrText) {
        fieldInstr += collectNodeText(instrText);
        continue;
      }
      if (inField && fieldInstr) {
        // Ignore cached field display value since we emitted {page} / {pages}
        continue;
      }
      for (const t of childElements(ch, 't')) {
        outText += collectNodeText(t);
      }
    }
  }

  return { text: outText.trim(), align, hasLine, hasPageField };
}

function matchPaperSize(widthMm: number, heightMm: number): DocumentPageSize {
  const shortMm = Math.min(widthMm, heightMm);
  const longMm = Math.max(widthMm, heightMm);
  for (const [key, spec] of Object.entries(PAPER_SIZES_MM)) {
    const sShort = Math.min(spec.width, spec.height);
    const sLong = Math.max(spec.width, spec.height);
    if (Math.abs(shortMm - sShort) <= 4 && Math.abs(longMm - sLong) <= 4) {
      return key as DocumentPageSize;
    }
  }
  return 'A4';
}

function extractPageMetadata(
  docTree: XmlNode,
  theme: ThemeInfo,
  rels: Map<string, RelEntry>,
  zipFiles: Map<string, string>
): ImportedPageMetadata {
  const meta: ImportedPageMetadata = {};
  const docEl = firstChild(docTree, 'document');
  const bgEl = firstChild(docEl, 'background');
  const bgCol = resolveColorNode(bgEl ? { ...bgEl, attrs: { val: getAttr(bgEl, 'color') || '', themeColor: getAttr(bgEl, 'themeColor') || '' } } : undefined, theme);
  if (bgCol && bgCol !== '#FFFFFF') meta.pageColor = bgCol;

  const body = firstChild(docEl, 'body');
  const sectPr = firstChild(body, 'sectPr');
  if (!sectPr) return meta;

  const pgSz = firstChild(sectPr, 'pgSz');
  if (pgSz) {
    const wTw = parseFloat(getAttr(pgSz, 'w') || '0');
    const hTw = parseFloat(getAttr(pgSz, 'h') || '0');
    const orient = (getAttr(pgSz, 'orient') || '').toLowerCase();
    if (wTw > 0 && hTw > 0) {
      const wMm = wTw / TWIPS_PER_MM;
      const hMm = hTw / TWIPS_PER_MM;
      meta.orientation = orient === 'landscape' || wTw > hTw ? 'landscape' : 'portrait';
      meta.pageSize = matchPaperSize(wMm, hMm);
    }
  }

  const pgMar = firstChild(sectPr, 'pgMar');
  if (pgMar) {
    const roundMm = (twStr: string | undefined, def: number) => {
      const v = parseFloat(twStr || '');
      return Number.isFinite(v) && v >= 0 ? Math.round((v / TWIPS_PER_MM) * 10) / 10 : def;
    };
    meta.margins = {
      top: roundMm(getAttr(pgMar, 'top'), 25.4),
      bottom: roundMm(getAttr(pgMar, 'bottom'), 25.4),
      left: roundMm(getAttr(pgMar, 'left'), 25.4),
      right: roundMm(getAttr(pgMar, 'right'), 25.4),
    };
  }

  const cols = firstChild(sectPr, 'cols');
  if (cols) {
    const num = parseInt(getAttr(cols, 'num') || '1', 10);
    if (num === 2 || num === 3) meta.columns = num;
  }

  const pgBorders = firstChild(sectPr, 'pgBorders');
  if (pgBorders) {
    const topB = firstChild(pgBorders, 'top') || firstChild(pgBorders, 'left');
    if (topB) {
      const val = (getAttr(topB, 'val') || 'single').toLowerCase();
      if (val !== 'none' && val !== 'nil') {
        const col = resolveColorNode({ ...topB, attrs: { val: getAttr(topB, 'color') || '' } }, theme) || '#374151';
        meta.pageBorderColor = col;
        const sz = parseFloat(getAttr(topB, 'sz') || '8');
        meta.pageBorderWidth = Math.max(0.5, Math.round((sz / 8) * 10) / 10);
        meta.pageBorder = val === 'double' ? 'double' : col === '#245C45' ? 'accent' : 'box';
        meta.pageBorderOffset = getAttr(pgBorders, 'offsetFrom') === 'text' ? 'margin' : 'edge';
      }
    }
  }

  if (firstChild(sectPr, 'titlePg')) {
    meta.differentFirstPage = true;
  }

  for (const hRef of childElements(sectPr, 'headerReference')) {
    const rId = getAttr(hRef, 'id');
    const typ = (getAttr(hRef, 'type') || 'default').toLowerCase();
    const rel = rId ? rels.get(rId) : undefined;
    const xml = rel ? zipFiles.get(rel.target.replace(/^\/+/, '').replace(/^word\//, '')) : undefined;
    const parsed = extractHeaderFooterText(xml);
    if (typ === 'first') {
      if (parsed.text) meta.firstPageHeaderText = parsed.text;
    } else if (typ === 'default') {
      if (parsed.text) meta.headerText = parsed.text;
      if (parsed.align) meta.headerAlign = parsed.align;
      if (parsed.hasLine) meta.showHeaderLine = true;
    }
  }

  for (const fRef of childElements(sectPr, 'footerReference')) {
    const rId = getAttr(fRef, 'id');
    const typ = (getAttr(fRef, 'type') || 'default').toLowerCase();
    const rel = rId ? rels.get(rId) : undefined;
    const xml = rel ? zipFiles.get(rel.target.replace(/^\/+/, '').replace(/^word\//, '')) : undefined;
    const parsed = extractHeaderFooterText(xml);
    if (parsed.hasPageField) meta.showPageNumbers = true;
    // Strip Docium's auto-appended "• Page {page} of {pages}" suffix when reconstructing footerText
    const cleanFooterText = parsed.text
      .replace(/\s*•\s*Page\s*\{page\}\s*of\s*\{pages\}\s*$/i, '')
      .replace(/^Page\s*\{page\}\s*of\s*\{pages\}$/i, '')
      .trim();
    if (typ === 'first') {
      if (cleanFooterText) meta.firstPageFooterText = cleanFooterText;
    } else if (typ === 'default') {
      if (cleanFooterText) meta.footerText = cleanFooterText;
      if (parsed.align) meta.footerAlign = parsed.align;
      if (parsed.hasLine) meta.showFooterLine = true;
    }
  }

  return meta;
}

// ==================== PUBLIC OOXML IMPORTER ENTRY POINT ====================

export async function parseDocxArrayBuffer(
  arrayBuffer: ArrayBuffer
): Promise<{ html: string; metadata?: ImportedPageMetadata }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);

  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) {
    throw new Error('Missing word/document.xml');
  }

  const [themeXml, stylesXml, numberingXml, relsXml] = await Promise.all([
    zip.file('word/theme/theme1.xml')?.async('string'),
    zip.file('word/styles.xml')?.async('string'),
    zip.file('word/numbering.xml')?.async('string'),
    zip.file('word/_rels/document.xml.rels')?.async('string'),
  ]);

  const theme = parseThemeXml(themeXml);
  const styles = parseStylesXml(stylesXml, theme);
  const numbering = parseNumberingXml(numberingXml);
  const rels = parseRelsXml(relsXml);

  // Preload header/footer XMLs referenced in rels
  const relXmlFiles = new Map<string, string>();
  const mediaDataUrls = new Map<string, string>();

  const loadTasks: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    if (/^word\/(header|footer)\d*\.xml$/i.test(relativePath)) {
      loadTasks.push(
        file.async('string').then((s) => {
          relXmlFiles.set(relativePath.replace(/^word\//i, ''), s);
        })
      );
    } else if (/^word\/media\//i.test(relativePath)) {
      loadTasks.push(
        file.async('base64').then((b64) => {
          const mime = mimeTypeFromPath(relativePath);
          const dataUrl = `data:${mime};base64,${b64}`;
          mediaDataUrls.set(relativePath.replace(/^word\//i, ''), dataUrl);
          mediaDataUrls.set(relativePath, dataUrl);
        })
      );
    }
  });
  await Promise.all(loadTasks);

  const docTree = parseXmlTree(docXml);
  const body = firstChild(firstChild(docTree, 'document'), 'body');
  if (!body) {
    throw new Error('Missing w:body in document.xml');
  }

  const ctx: ParseContext = {
    theme,
    styles,
    numbering,
    rels,
    mediaDataUrls,
  };

  const bodyHtml = convertBlockNodesToHtml(childElements(body), ctx);
  const metadata = extractPageMetadata(docTree, theme, rels, relXmlFiles);

  return {
    html: sanitizeImportedHtml(bodyHtml || '<p></p>'),
    metadata,
  };
}

function injectDocxAlignmentStyles(html: string): string {
  return html
    .replace(/<(p|h[1-6])([^>]*)\salign="(center|right|justify|left)"([^>]*)>/gi, '<$1$2$4 style="text-align: $3;">')
    .replace(/<p>\s*<\/p>/gi, '<p></p>');
}

export async function parseImportedFile(file: File): Promise<ParsedImportedDocument> {
  const fileName = file.name;
  const title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    try {
      const ooxmlResult = await parseDocxArrayBuffer(arrayBuffer);
      return {
        title,
        html: ooxmlResult.html,
        metadata: ooxmlResult.metadata,
      };
    } catch {
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          styleMap: DOCX_STYLE_MAP,
          includeDefaultStyleMap: true,
        }
      );
      return {
        title,
        html: sanitizeImportedHtml(injectDocxAlignmentStyles(result.value || '<p></p>')),
      };
    }
  }

  if (extension === 'html' || extension === 'htm') {
    const text = await file.text();
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = bodyMatch ? bodyMatch[1] : text;
    return { title, html: sanitizeImportedHtml(content) };
  }

  if (extension === 'md' || extension === 'markdown') {
    const text = await file.text();
    return { title, html: convertMarkdownToDocumentHtml(text) };
  }

  if (extension === 'txt') {
    const text = await file.text();
    const paragraphs = text
      .split(/\r?\n\r?\n/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
    return { title, html: paragraphs || '<p></p>' };
  }

  const text = await file.text();
  if (text.includes('<html') || text.includes('<body') || text.includes('<p')) {
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return { title, html: sanitizeImportedHtml(bodyMatch ? bodyMatch[1] : text) };
  }

  return {
    title,
    html: `<p>${escapeHtml(text.slice(0, 15000))}</p>`,
  };
}

function sanitizeImportedHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}
