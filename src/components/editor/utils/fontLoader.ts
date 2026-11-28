'use client';

const CLIENT_FONT_ALIAS_MAP: Record<string, string> = {
  cascademono: 'Cascadia Mono',
  cascadiamono: 'Cascadia Mono',
  cascadiacode: 'Cascadia Code',
  'sans-serif': 'Arial',
  'ui-sans-serif': 'Inter',
  'system-ui': 'Segoe UI',
  serif: 'Times New Roman',
  monospace: 'Consolas',
  cursive: 'Comic Sans MS',
  fantasy: 'Impact',
  times: 'Times New Roman',
  timesnewroman: 'Times New Roman',
  'var(--font-geist-sans)': 'Geist',
  'var(--font-geist-mono)': 'JetBrains Mono',
};

const clientFontPromiseCache = new Map<string, Promise<Uint8Array | null>>();

/**
 * Resolves a CSS font-family stack or mark font string to an ordered array of clean typeface names.
 */
export function normalizeExportFontStack(raw: string | null | undefined, fallback = 'Calibri'): string[] {
  if (!raw || !raw.trim()) return [fallback];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const cleaned = part.replace(/['"]/g, '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'inherit') continue;
    const mapped = CLIENT_FONT_ALIAS_MAP[cleaned.toLowerCase()] || cleaned;
    const key = mapped.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(mapped);
    }
  }
  return out.length > 0 ? out : [fallback];
}

/**
 * Resolves a CSS font-family stack or mark font string to a clean primary typeface name
 * recognized by Microsoft Word, Google Fonts, and the TrueType font resolver API.
 */
export function normalizeExportFontName(raw: string | null | undefined, fallback = 'Calibri'): string {
  return normalizeExportFontStack(raw, fallback)[0];
}

/**
 * Fetches standalone TrueType (.ttf) bytes for a given typeface & style via /api/fonts/ttf.
 * When `exactOnly` is true (e.g. `.docx` embedded `.odttf` fonts), metric-equivalent fallbacks are skipped.
 */
export function fetchTrueTypeFontBytes(
  rawFamily: string,
  bold: boolean,
  italic: boolean,
  exactOnly = false
): Promise<Uint8Array | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  const stack = normalizeExportFontStack(rawFamily);
  const queryFamily = exactOnly ? stack[0] : stack.join(', ');
  const weight = bold ? '700' : '400';
  const italicFlag = italic ? '1' : '0';
  const key = `${queryFamily.toLowerCase()}|${weight}|${italicFlag}|${exactOnly ? 'exact' : 'any'}`;

  const existing = clientFontPromiseCache.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      const url = `/api/fonts/ttf?family=${encodeURIComponent(queryFamily)}&weight=${weight}&italic=${italicFlag}${exactOnly ? '&exact=1' : ''}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab);
      // Confirm TrueType header (0x00010000)
      if (bytes.length < 16 || bytes[0] !== 0x00 || bytes[1] !== 0x01 || bytes[2] !== 0x00 || bytes[3] !== 0x00) {
        return null;
      }
      return bytes;
    } catch {
      return null;
    }
  })();

  clientFontPromiseCache.set(key, task);
  return task;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Inspects a TrueType (`.ttf`) binary's `OS/2` table to determine whether the font face itself
 * is natively Bold (`usWeightClass >= 600` or `fsSelection & 0x20`).
 * Used by PDF export to apply synthetic bold (`2 Tr`) when a single-weight font (like Vivaldi) is styled bold.
 */
export function isTrueTypeBytesBold(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x00010000) return false;
  const numTables = view.getUint16(4, false);
  if (numTables === 0 || numTables > 128 || 12 + numTables * 16 > bytes.byteLength) return false;

  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
    if (tag === 'OS/2') {
      const offset = view.getUint32(rec + 8, false);
      const length = view.getUint32(rec + 12, false);
      if (offset + 64 <= bytes.byteLength && length >= 64) {
        const usWeightClass = view.getUint16(offset + 4, false);
        const fsSelection = view.getUint16(offset + 62, false);
        return usWeightClass >= 600 || Boolean(fsSelection & 0x20);
      }
      break;
    }
  }
  return false;
}

