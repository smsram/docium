import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FONT_CATALOG } from '@/lib/editor/fontCatalog';

export type FontWeightKey = '400' | '700';

export interface ResolvedFontResult {
  buffer: Buffer;
  exact: boolean;
}

interface ParsedFaceInfo {
  familyNames: string[];
  bold: boolean;
  italic: boolean;
}

interface IndexedFontFace {
  filePath: string;
  faceIndex?: number;
}

const FONT_ALIASES: Record<string, string> = {
  cascademono: 'cascadia mono',
  cascadiamono: 'cascadia mono',
  cascadiacode: 'cascadia code',
  times: 'times new roman',
  timesnewroman: 'times new roman',
  helvetica: 'arial',
  'sans-serif': 'arial',
  serif: 'times new roman',
  monospace: 'consolas',
  cursive: 'comic sans ms',
  'system-ui': 'segoe ui',
  'ui-sans-serif': 'inter',
};

/**
 * High-fidelity local or Google TrueType equivalents used when proprietary Microsoft/Apple
 * fonts are not installed on the current host (for PDF glyph fidelity).
 * Never applied when `exactOnly: true` (e.g. `.docx` embedded `.odttf` binary lookup).
 */
const SYSTEM_FONT_METRIC_FALLBACKS: Record<string, string> = {
  aptos: 'inter',
  'aptos display': 'plus jakarta sans',
  'aptos narrow': 'barlow condensed',
  'aptos serif': 'merriweather',
  'aptos mono': 'jetbrains mono',
  baskerville: 'libre baskerville',
  'baskerville old face': 'libre baskerville',
  'bell mt': 'eb garamond',
  'berlin sans fb': 'lato',
  'bernard mt condensed': 'oswald',
  'bodoni mt': 'bodoni moda',
  'britannic bold': 'abril fatface',
  broadway: 'abril fatface',
  'brush script mt': 'dancing script',
  'californian fb': 'eb garamond',
  'calisto mt': 'eb garamond',
  castellar: 'cinzel',
  centaur: 'eb garamond',
  'century schoolbook': 'lora',
  chiller: 'bebas neue',
  'colonna mt': 'abril fatface',
  'cooper black': 'arvo',
  'copperplate gothic bold': 'cinzel',
  'copperplate gothic light': 'cinzel',
  didot: 'gfs didot',
  elephant: 'abril fatface',
  'engravers mt': 'cinzel',
  'eras bold itc': 'lato',
  'felix titling': 'cinzel',
  'footlight mt light': 'eb garamond',
  forte: 'dancing script',
  'franklin gothic book': 'franklin gothic medium',
  'french script mt': 'dancing script',
  futura: 'jost',
  gigi: 'dancing script',
  'gill sans mt': 'lato',
  'goudy old style': 'sorts mill goudy',
  haettenschweiler: 'oswald',
  'harlow solid italic': 'dancing script',
  harrington: 'cinzel',
  helvetica: 'arial',
  'high tower text': 'eb garamond',
  'informal roman': 'caveat',
  jokerman: 'righteous',
  'kunstler script': 'dancing script',
  'lucida bright': 'lora',
  'lucida calligraphy': 'dancing script',
  'lucida handwriting': 'dancing script',
  'lucida sans': 'lucida sans unicode',
  'lucida sans typewriter': 'jetbrains mono',
  magneto: 'righteous',
  'maiandra gd': 'dm sans',
  'matura mt script capitals': 'dancing script',
  'modern no. 20': 'bodoni moda',
  monaco: 'jetbrains mono',
  'niagara engraved': 'oswald',
  'old english text mt': 'cinzel',
  onyx: 'oswald',
  optima: 'dm sans',
  'palace script mt': 'dancing script',
  parchment: 'dancing script',
  perpetua: 'eb garamond',
  playbill: 'oswald',
  'poor richard': 'lora',
  'rage italic': 'dancing script',
  ravie: 'righteous',
  rockwell: 'arvo',
  'script mt bold': 'dancing script',
  'showcard gothic': 'bebas neue',
  'snap itc': 'righteous',
  stencil: 'bebas neue',
  'tw cen mt': 'jost',
  'viner hand itc': 'caveat',
  vivaldi: 'dancing script',
  'vladimir script': 'dancing script',
  'wide latin': 'abril fatface',
};

const EXTRA_GOOGLE_FAMILY_PARAMS: Record<string, string> = {
  'google sans': 'Google+Sans',
  'google sans text': 'Google+Sans+Text',
  'google sans display': 'Google+Sans+Display',
  'google sans mono': 'Google+Sans+Mono',
  'product sans': 'Product+Sans',
  'plus jakarta sans': 'Plus+Jakarta+Sans',
  'barlow condensed': 'Barlow+Condensed',
  'bodoni moda': 'Bodoni+Moda',
  'abril fatface': 'Abril+Fatface',
  'gfs didot': 'GFS+Didot',
  jost: 'Jost',
  'dm sans': 'DM+Sans',
  arvo: 'Arvo',
  'sorts mill goudy': 'Sorts+Mill+Goudy',
  righteous: 'Righteous',
  'libre franklin': 'Libre+Franklin',
};

interface OfficeCloudSubFace {
  id: string;
  dn: string;
  gn?: string;
  t?: string;
}

interface OfficeCloudCatalogIndex {
  majorVersion: number;
  minorVersion: number;
  byFamily: Map<string, OfficeCloudSubFace[]>;
}

let systemFontIndexPromise: Promise<Map<string, IndexedFontFace>> | null = null;
let officeCloudCatalogPromise: Promise<OfficeCloudCatalogIndex | null> | null = null;
const fontByteCache = new Map<string, Buffer | null>();

function decodeUtf16Be(buf: Buffer): string {
  const swapped = Buffer.allocUnsafe(buf.length - (buf.length % 2));
  for (let i = 0; i + 1 < buf.length; i += 2) {
    swapped[i] = buf[i + 1];
    swapped[i + 1] = buf[i];
  }
  return swapped.toString('utf16le').replace(/\0/g, '').trim();
}

async function readTrueTypeMetadataAtOffset(
  handle: fs.FileHandle,
  fileSize: number,
  tableDirOffset: number
): Promise<ParsedFaceInfo | null> {
  if (tableDirOffset + 12 > fileSize) return null;

  const header = Buffer.allocUnsafe(12);
  await handle.read(header, 0, 12, tableDirOffset);
  if (header.readUInt32BE(0) !== 0x00010000) return null;

  const numTables = header.readUInt16BE(4);
  if (numTables === 0 || numTables > 128 || tableDirOffset + 12 + numTables * 16 > fileSize) {
    return null;
  }

  const dirBuf = Buffer.allocUnsafe(numTables * 16);
  await handle.read(dirBuf, 0, dirBuf.length, tableDirOffset + 12);

  let nameOffset = 0;
  let nameLength = 0;
  let os2Offset = 0;
  let os2Length = 0;

  for (let i = 0; i < numTables; i++) {
    const rec = i * 16;
    const tag = dirBuf.toString('ascii', rec, rec + 4);
    const offset = dirBuf.readUInt32BE(rec + 8);
    const length = dirBuf.readUInt32BE(rec + 12);
    if (tag === 'name') {
      nameOffset = offset;
      nameLength = length;
    } else if (tag === 'OS/2') {
      os2Offset = offset;
      os2Length = length;
    }
  }

  if (!nameOffset || nameLength < 6 || nameOffset + 6 > fileSize) return null;
  const safeNameLen = Math.min(nameLength, fileSize - nameOffset, 262144);
  const nameBuf = Buffer.allocUnsafe(safeNameLen);
  await handle.read(nameBuf, 0, safeNameLen, nameOffset);

  const count = nameBuf.readUInt16BE(2);
  const storageStart = nameBuf.readUInt16BE(4);
  const namesWin: Record<number, string> = {};
  const namesMac: Record<number, string> = {};

  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (rec + 12 > nameBuf.length) break;
    const platformID = nameBuf.readUInt16BE(rec);
    const languageID = nameBuf.readUInt16BE(rec + 4);
    const nameID = nameBuf.readUInt16BE(rec + 6);
    if (nameID !== 1 && nameID !== 2 && nameID !== 4 && nameID !== 16 && nameID !== 17) continue;

    const strLen = nameBuf.readUInt16BE(rec + 8);
    const strOff = storageStart + nameBuf.readUInt16BE(rec + 10);
    if (strOff < 0 || strOff + strLen > nameBuf.length || strLen <= 0) continue;

    const slice = nameBuf.subarray(strOff, strOff + strLen);
    if (platformID === 3) {
      const val = decodeUtf16Be(slice);
      if (val && (!namesWin[nameID] || languageID === 0x0409)) {
        namesWin[nameID] = val;
      }
    } else if (platformID === 1 && !namesMac[nameID]) {
      const val = slice.toString('latin1').replace(/\0/g, '').trim();
      if (val) namesMac[nameID] = val;
    }
  }

  const pick = (id: number) => namesWin[id] || namesMac[id] || '';
  const fam1 = pick(1);
  const sub2 = pick(2).toLowerCase();
  const fam16 = pick(16);
  const sub17 = pick(17).toLowerCase();
  const full4 = pick(4);

  let os2Bold = false;
  let os2Italic = false;
  if (os2Offset && os2Length >= 64 && os2Offset + 64 <= fileSize) {
    const os2Buf = Buffer.allocUnsafe(64);
    await handle.read(os2Buf, 0, 64, os2Offset);
    const fsSelection = os2Buf.readUInt16BE(62);
    os2Italic = Boolean(fsSelection & 0x01);
    os2Bold = Boolean(fsSelection & 0x20);
  }

  const subCombined = `${sub2} ${sub17}`.trim();
  const bold = os2Bold || /\b(bold|black|heavy)\b/i.test(sub2);
  const italic = os2Italic || /\b(italic|oblique)\b/i.test(subCombined);

  const familySet = new Set<string>();
  if (fam1) familySet.add(fam1.toLowerCase());
  if (fam16) familySet.add(fam16.toLowerCase());
  if (fam16 && sub17 && !/^(regular|normal|roman|bold|italic|bold italic|oblique)$/i.test(sub17)) {
    familySet.add(`${fam16} ${sub17}`.toLowerCase());
  }
  if (full4 && !bold && !italic) {
    familySet.add(full4.toLowerCase());
  }

  if (familySet.size === 0) return null;
  return { familyNames: Array.from(familySet), bold, italic };
}

/**
 * Extracts a single TrueType face from a TrueType Collection (`.ttc`) buffer
 * into a standalone `0x00010000` `.ttf` binary with recomputed table offsets and `head` checksum.
 */
function extractTtcFaceAsTtf(ttcBuf: Buffer, faceIndex: number): Buffer | null {
  if (ttcBuf.length < 16 || ttcBuf.readUInt32BE(0) !== 0x74746366) return null;
  const numFonts = ttcBuf.readUInt32BE(8);
  if (faceIndex < 0 || faceIndex >= numFonts || 12 + numFonts * 4 > ttcBuf.length) return null;

  const faceOffset = ttcBuf.readUInt32BE(12 + faceIndex * 4);
  if (faceOffset + 12 > ttcBuf.length) return null;
  if (ttcBuf.readUInt32BE(faceOffset) !== 0x00010000) return null;

  const numTables = ttcBuf.readUInt16BE(faceOffset + 4);
  if (numTables === 0 || numTables > 128 || faceOffset + 12 + numTables * 16 > ttcBuf.length) return null;

  const headerSize = 12 + numTables * 16;
  let totalSize = headerSize;
  const tables: Array<{ recOffset: number; tag: string; origOffset: number; length: number; paddedLength: number }> = [];

  for (let i = 0; i < numTables; i++) {
    const recOffset = faceOffset + 12 + i * 16;
    const tag = ttcBuf.toString('ascii', recOffset, recOffset + 4);
    const origOffset = ttcBuf.readUInt32BE(recOffset + 8);
    const length = ttcBuf.readUInt32BE(recOffset + 12);
    if (origOffset + length > ttcBuf.length) return null;
    const paddedLength = (length + 3) & ~3;
    tables.push({ recOffset, tag, origOffset, length, paddedLength });
    totalSize += paddedLength;
  }

  const out = Buffer.alloc(totalSize);
  // Copy Offset Table (12 bytes)
  ttcBuf.copy(out, 0, faceOffset, faceOffset + 12);

  let writeCursor = headerSize;
  let headNewOffset = -1;
  let headLength = 0;

  for (let i = 0; i < numTables; i++) {
    const t = tables[i];
    const newRec = 12 + i * 16;
    ttcBuf.copy(out, newRec, t.recOffset, t.recOffset + 16);
    out.writeUInt32BE(writeCursor, newRec + 8);
    ttcBuf.copy(out, writeCursor, t.origOffset, t.origOffset + t.length);
    if (t.tag === 'head') {
      headNewOffset = writeCursor;
      headLength = t.length;
    }
    writeCursor += t.paddedLength;
  }

  if (headNewOffset >= 0 && headLength >= 12) {
    out.writeUInt32BE(0, headNewOffset + 8);
    let sum = 0;
    for (let i = 0; i + 3 < out.length; i += 4) {
      sum = (sum + out.readUInt32BE(i)) >>> 0;
    }
    const checkSumAdjustment = (0xb1b0afba - sum) >>> 0;
    out.writeUInt32BE(checkSumAdjustment, headNewOffset + 8);
  }

  return out;
}

async function readFontFileFaces(filePath: string): Promise<Array<{ meta: ParsedFaceInfo; faceIndex?: number }>> {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (stat.size < 32) return [];
    const lead = Buffer.allocUnsafe(12);
    await handle.read(lead, 0, 12, 0);
    const sig = lead.readUInt32BE(0);

    if (sig === 0x00010000) {
      const meta = await readTrueTypeMetadataAtOffset(handle, stat.size, 0);
      return meta ? [{ meta }] : [];
    }

    if (sig === 0x74746366) {
      const numFonts = lead.readUInt32BE(8);
      if (numFonts === 0 || numFonts > 64 || 12 + numFonts * 4 > stat.size) return [];
      const offBuf = Buffer.allocUnsafe(numFonts * 4);
      await handle.read(offBuf, 0, offBuf.length, 12);
      const out: Array<{ meta: ParsedFaceInfo; faceIndex?: number }> = [];
      for (let i = 0; i < numFonts; i++) {
        const faceOffset = offBuf.readUInt32BE(i * 4);
        const meta = await readTrueTypeMetadataAtOffset(handle, stat.size, faceOffset);
        if (meta) out.push({ meta, faceIndex: i });
      }
      return out;
    }

    return [];
  } finally {
    await handle.close();
  }
}

async function scanDirectoryFonts(dir: string, index: Map<string, IndexedFontFace>, depth = 0): Promise<void> {
  if (depth > 4) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await scanDirectoryFonts(full, index, depth + 1);
      continue;
    }
    if (!/\.(ttf|ttc)$/i.test(ent.name)) continue;
    try {
      const faces = await readFontFileFaces(full);
      for (const { meta, faceIndex } of faces) {
        const wKey = meta.bold ? '700' : '400';
        const iKey = meta.italic ? '1' : '0';
        const ref: IndexedFontFace = faceIndex !== undefined ? { filePath: full, faceIndex } : { filePath: full };
        for (const fam of meta.familyNames) {
          const exactKey = `${fam}|${wKey}|${iKey}`;
          if (!index.has(exactKey)) {
            index.set(exactKey, ref);
          }
          const famFallback = `${fam}|default`;
          if ((!meta.bold && !meta.italic) || !index.has(famFallback)) {
            index.set(famFallback, ref);
          }
        }
      }
    } catch {
      // Skip unreadable font file
    }
  }
}

async function getSystemFontIndex(): Promise<Map<string, IndexedFontFace>> {
  if (!systemFontIndexPromise) {
    systemFontIndexPromise = (async () => {
      const idx = new Map<string, IndexedFontFace>();
      const dirs: string[] = [];
      if (process.platform === 'win32') {
        const winDir = process.env.WINDIR || 'C:\\Windows';
        dirs.push(path.join(winDir, 'Fonts'));
        if (process.env.LOCALAPPDATA) {
          dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
          dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'FontCache', '4', 'CloudFonts'));
        }
        dirs.push('C:\\Program Files\\Microsoft Office\\root\\vfs\\Fonts\\private');
        dirs.push('C:\\Program Files (x86)\\Microsoft Office\\root\\vfs\\Fonts\\private');
      } else if (process.platform === 'darwin') {
        dirs.push('/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts'));
      } else {
        dirs.push('/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.local', 'share', 'fonts'));
      }
      for (const d of dirs) {
        await scanDirectoryFonts(d, idx);
      }
      return idx;
    })();
  }
  return systemFontIndexPromise;
}

async function getOfficeCloudCatalog(): Promise<OfficeCloudCatalogIndex | null> {
  if (!officeCloudCatalogPromise) {
    officeCloudCatalogPromise = (async () => {
      try {
        let rawJson = '';
        if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
          const localCatalogPath = path.join(
            process.env.LOCALAPPDATA,
            'Microsoft',
            'FontCache',
            '4',
            'Catalog',
            'ListAll.Json'
          );
          try {
            rawJson = await fs.readFile(localCatalogPath, 'utf8');
          } catch {
            rawJson = '';
          }
        }
        if (!rawJson) return null;
        const parsed = JSON.parse(rawJson);
        const byFamily = new Map<string, OfficeCloudSubFace[]>();
        for (const entry of parsed.Fonts || []) {
          const fKey = String(entry.f || '').toLowerCase();
          const sfs: OfficeCloudSubFace[] = Array.isArray(entry.sf) ? entry.sf : [];
          if (!fKey || sfs.length === 0) continue;
          const prev = byFamily.get(fKey) || [];
          byFamily.set(fKey, [...prev, ...sfs]);
          for (const sf of sfs) {
            if (sf.gn) {
              const gKey = sf.gn.toLowerCase();
              const gPrev = byFamily.get(gKey) || [];
              if (!gPrev.includes(sf)) byFamily.set(gKey, [...gPrev, sf]);
            }
          }
        }
        for (const entry of parsed.Fonts || []) {
          const sfs: OfficeCloudSubFace[] = Array.isArray(entry.sf) ? entry.sf : [];
          for (const sf of sfs) {
            if (sf.dn) {
              const dKey = sf.dn.toLowerCase();
              if (!byFamily.has(dKey)) byFamily.set(dKey, [sf]);
            }
          }
        }
        return {
          majorVersion: Number(parsed.MajorVersion) || 4,
          minorVersion: Number(parsed.MinorVersion) || 42,
          byFamily,
        };
      } catch {
        return null;
      }
    })();
  }
  return officeCloudCatalogPromise;
}

async function fetchOfficeCloudFontTtf(
  normKey: string,
  weight: FontWeightKey,
  italic: boolean
): Promise<Buffer | null> {
  const catalog = await getOfficeCloudCatalog();
  if (!catalog) return null;

  const lookupKey = normKey === 'baskerville' ? 'baskerville old face' : normKey;
  const subfaces = catalog.byFamily.get(lookupKey);
  if (!subfaces || subfaces.length === 0) return null;

  const ttfFaces = subfaces.filter((sf) => !sf.t || sf.t.toLowerCase() === 'ttf');
  const pool = ttfFaces.length > 0 ? ttfFaces : subfaces;
  const wantBold = weight === '700';

  const classify = (sf: OfficeCloudSubFace) => {
    const subName = sf.dn.slice(sf.gn ? sf.gn.length : 0).trim() || sf.dn;
    const isBold = /\b(bold|black|heavy|semibold|demi)\b/i.test(subName);
    const isItalic = /\b(italic|oblique)\b/i.test(subName);
    return { sf, isBold, isItalic };
  };
  const annotated = pool.map(classify);

  const chosen =
    annotated.find((x) => x.isBold === wantBold && x.isItalic === italic)?.sf ||
    (italic ? annotated.find((x) => !x.isBold && x.isItalic)?.sf : undefined) ||
    annotated.find((x) => x.isBold === wantBold && !x.isItalic)?.sf ||
    annotated.find((x) => !x.isBold && !x.isItalic)?.sf ||
    pool[0];

  if (!chosen?.id) return null;

  try {
    const url = `https://fs.microsoft.com/fs/${catalog.majorVersion}.${catalog.minorVersion}/rawguids/${chosen.id}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length >= 16 && buf.readUInt32BE(0) === 0x00010000) {
      return buf;
    }
    if (buf.length >= 16 && buf.readUInt32BE(0) === 0x74746366) {
      return extractTtcFaceAsTtf(buf, 0);
    }
    return null;
  } catch {
    return null;
  }
}

async function readIndexedFaceBuffer(face: IndexedFontFace): Promise<Buffer | null> {
  try {
    const fileBuf = await fs.readFile(face.filePath);
    if (face.faceIndex !== undefined) {
      return extractTtcFaceAsTtf(fileBuf, face.faceIndex);
    }
    if (fileBuf.length >= 16 && fileBuf.readUInt32BE(0) === 0x00010000) {
      return fileBuf;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchGoogleFontTtf(
  familyName: string,
  weight: FontWeightKey,
  italic: boolean
): Promise<Buffer | null> {
  const cleanKey = familyName.toLowerCase();
  const catalogEntry = FONT_CATALOG.find(
    (item) => item.name.toLowerCase() === cleanKey && item.googleFamily
  );
  const gfParam =
    catalogEntry?.googleFamily ||
    EXTRA_GOOGLE_FAMILY_PARAMS[cleanKey] ||
    familyName.trim().replace(/\s+/g, '+');

  const urls = [
    `https://fonts.googleapis.com/css2?family=${gfParam}:ital,wght@0,400;0,700;1,400;1,700`,
    `https://fonts.googleapis.com/css2?family=${gfParam}:wght@400;700`,
    `https://fonts.googleapis.com/css2?family=${gfParam}`,
  ];

  let css = '';
  for (const cssUrl of urls) {
    try {
      const resp = await fetch(cssUrl, {
        headers: { 'User-Agent': 'curl/7.81.0' },
        signal: AbortSignal.timeout(4500),
      });
      if (resp.ok) {
        css = await resp.text();
        if (css.includes('@font-face')) break;
      }
    } catch {
      // try next URL variant
    }
  }
  if (!css) return null;

  const faces: Array<{ style: string; weight: number; url: string }> = [];
  const blockRegex = /@font-face\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(css)) !== null) {
    const body = m[1];
    const styleM = body.match(/font-style:\s*([^;]+)/i);
    const weightM = body.match(/font-weight:\s*(\d+)/i);
    const urlM = body.match(/url\((https:[^)]+\.ttf)\)/i);
    if (urlM) {
      faces.push({
        style: (styleM?.[1] || 'normal').trim().toLowerCase(),
        weight: parseInt(weightM?.[1] || '400', 10) || 400,
        url: urlM[1].trim(),
      });
    }
  }
  if (faces.length === 0) return null;

  const targetStyle = italic ? 'italic' : 'normal';
  const targetWeight = weight === '700' ? 700 : 400;

  const bestFace =
    faces.find((f) => f.style === targetStyle && f.weight === targetWeight) ||
    faces.find((f) => f.style === targetStyle && f.weight === 400) ||
    faces.find((f) => f.style === 'normal' && f.weight === targetWeight) ||
    faces.find((f) => f.style === 'normal' && f.weight === 400) ||
    faces[0];

  try {
    const ttfResp = await fetch(bestFace.url, { signal: AbortSignal.timeout(6000) });
    if (!ttfResp.ok) return null;
    const buf = Buffer.from(await ttfResp.arrayBuffer());
    if (buf.length < 16 || buf.readUInt32BE(0) !== 0x00010000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function resolveSingleFamilyBuffer(
  normKey: string,
  displayName: string,
  weight: FontWeightKey,
  italic: boolean,
  allowGoogleFetch: boolean
): Promise<Buffer | null> {
  const cacheKey = `${normKey}|${weight}|${italic ? '1' : '0'}|${allowGoogleFetch ? 'g1' : 'g0'}`;
  if (fontByteCache.has(cacheKey)) {
    return fontByteCache.get(cacheKey) || null;
  }

  let resolved: Buffer | null = null;
  const sysIndex = await getSystemFontIndex();
  const faceRef =
    sysIndex.get(`${normKey}|${weight}|${italic ? '1' : '0'}`) ||
    (italic ? sysIndex.get(`${normKey}|400|1`) : undefined) ||
    sysIndex.get(`${normKey}|${weight}|0`) ||
    sysIndex.get(`${normKey}|400|0`) ||
    sysIndex.get(`${normKey}|default`);

  if (faceRef) {
    resolved = await readIndexedFaceBuffer(faceRef);
  }

  if (!resolved) {
    resolved = await fetchOfficeCloudFontTtf(normKey, weight, italic);
  }

  if (!resolved && allowGoogleFetch) {
    resolved = await fetchGoogleFontTtf(displayName, weight, italic);
  }

  fontByteCache.set(cacheKey, resolved);
  return resolved;
}

export async function resolveTrueTypeFontWithMeta(
  rawFamily: string,
  weight: FontWeightKey = '400',
  italic = false,
  options?: { exactOnly?: boolean }
): Promise<ResolvedFontResult | null> {
  const candidates = rawFamily
    .split(',')
    .map((p) => p.replace(/['"]/g, '').trim())
    .filter((p) => p && p.toLowerCase() !== 'inherit');
  if (candidates.length === 0) return null;

  const exactOnly = Boolean(options?.exactOnly);
  const firstPrimary = candidates[0];
  const firstNorm = FONT_ALIASES[firstPrimary.toLowerCase()] || firstPrimary.toLowerCase();
  const catalogEntry = FONT_CATALOG.find((item) => item.name.toLowerCase() === firstNorm);
  const isKnownNonGoogleCatalogFont = Boolean(catalogEntry && !catalogEntry.googleFamily);

  // 1. Exact local match (TTF or extracted TTC face), or exact Google Fonts fetch
  const exactBuf = await resolveSingleFamilyBuffer(
    firstNorm,
    catalogEntry?.name || firstPrimary,
    weight,
    italic,
    !isKnownNonGoogleCatalogFont
  );
  if (exactBuf) {
    return { buffer: exactBuf, exact: true };
  }

  if (exactOnly) {
    return null;
  }

  // 2. Metric/stylistic fallback for cloud/Office/Apple system fonts (for PDF rendering)
  const metricFallback = SYSTEM_FONT_METRIC_FALLBACKS[firstNorm];
  if (metricFallback) {
    const fbBuf = await resolveSingleFamilyBuffer(metricFallback, metricFallback, weight, italic, true);
    if (fbBuf) {
      return { buffer: fbBuf, exact: false };
    }
    if (metricFallback === 'franklin gothic medium') {
      const fb2 = await resolveSingleFamilyBuffer('libre franklin', 'Libre Franklin', weight, italic, true);
      if (fb2) return { buffer: fb2, exact: false };
    }
    if (metricFallback === 'lucida sans unicode') {
      const fb2 = await resolveSingleFamilyBuffer('open sans', 'Open Sans', weight, italic, true);
      if (fb2) return { buffer: fb2, exact: false };
    }
  }

  // 3. Walk any remaining CSS fallback families in stack (`Aptos, Calibri, sans-serif`)
  for (let i = 1; i < candidates.length; i++) {
    const cand = candidates[i];
    const candNorm = FONT_ALIASES[cand.toLowerCase()] || cand.toLowerCase();
    const candEntry = FONT_CATALOG.find((item) => item.name.toLowerCase() === candNorm);
    const candBuf = await resolveSingleFamilyBuffer(
      candNorm,
      candEntry?.name || cand,
      weight,
      italic,
      !candEntry || Boolean(candEntry.googleFamily)
    );
    if (candBuf) {
      return { buffer: candBuf, exact: false };
    }
  }

  return null;
}

export async function resolveTrueTypeFont(
  rawFamily: string,
  weight: FontWeightKey = '400',
  italic = false,
  options?: { exactOnly?: boolean }
): Promise<Buffer | null> {
  const res = await resolveTrueTypeFontWithMeta(rawFamily, weight, italic, options);
  return res?.buffer || null;
}

