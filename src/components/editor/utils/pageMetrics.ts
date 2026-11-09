import { DocumentPageSize, DocumentOrientation, MarginPreset, DocumentMargins } from '@/lib/types';

export const MM_TO_PX = 3.779527559; // 96 DPI / 25.4 mm
export const INCH_TO_PX = 96;

export interface PageDimensions {
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  printableWidthPx: number;
  printableHeightPx: number;
  marginsPx: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export const PAPER_SIZES_MM: Record<Exclude<DocumentPageSize, 'custom'>, { width: number; height: number; name: string }> = {
  A4: { width: 210, height: 297, name: 'A4 (210 × 297 mm)' },
  Letter: { width: 215.9, height: 279.4, name: 'Letter (8.5 × 11 in)' },
  Legal: { width: 215.9, height: 355.6, name: 'Legal (8.5 × 14 in)' },
  A3: { width: 297, height: 420, name: 'A3 (297 × 420 mm)' },
  A5: { width: 148, height: 210, name: 'A5 (148 × 210 mm)' },
  Tabloid: { width: 279.4, height: 431.8, name: 'Tabloid (11 × 17 in)' },
};

export const MARGIN_PRESETS: Record<MarginPreset, { top: number; bottom: number; left: number; right: number; label: string }> = {
  normal: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4, label: 'Normal (1 in / 25.4 mm)' },
  narrow: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7, label: 'Narrow (0.5 in / 12.7 mm)' },
  moderate: { top: 25.4, bottom: 25.4, left: 19.05, right: 19.05, label: 'Moderate (0.75 in sides)' },
  wide: { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8, label: 'Wide (2 in sides)' },
  custom: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4, label: 'Custom Margins' },
};

export function getResolvedMargins(
  margins?: DocumentMargins | MarginPreset,
  preset?: MarginPreset
): DocumentMargins {
  if (typeof margins === 'object' && margins !== null && 'top' in margins) {
    return margins;
  }
  const key = (typeof margins === 'string' ? margins : preset) || 'normal';
  const def = MARGIN_PRESETS[key as MarginPreset] || MARGIN_PRESETS.normal;
  return {
    top: def.top,
    bottom: def.bottom,
    left: def.left,
    right: def.right,
  };
}

export function calculatePageDimensions(
  pageSize: DocumentPageSize = 'A4',
  orientation: DocumentOrientation = 'portrait',
  marginsInput?: DocumentMargins | MarginPreset,
  customDimensions?: { widthMm: number; heightMm: number }
): PageDimensions {
  let baseWidthMm = 210;
  let baseHeightMm = 297;

  if (pageSize === 'custom' && customDimensions) {
    baseWidthMm = customDimensions.widthMm || 210;
    baseHeightMm = customDimensions.heightMm || 297;
  } else if (pageSize !== 'custom' && PAPER_SIZES_MM[pageSize]) {
    baseWidthMm = PAPER_SIZES_MM[pageSize].width;
    baseHeightMm = PAPER_SIZES_MM[pageSize].height;
  }

  const isLandscape = orientation === 'landscape';
  const widthMm = isLandscape ? Math.max(baseWidthMm, baseHeightMm) : Math.min(baseWidthMm, baseHeightMm);
  const heightMm = isLandscape ? Math.min(baseWidthMm, baseHeightMm) : Math.max(baseWidthMm, baseHeightMm);

  const widthPx = Math.round(widthMm * MM_TO_PX);
  const heightPx = Math.round(heightMm * MM_TO_PX);

  const resolvedMarginsMm = getResolvedMargins(marginsInput);
  const marginsPx = {
    top: Math.round(resolvedMarginsMm.top * MM_TO_PX),
    bottom: Math.round(resolvedMarginsMm.bottom * MM_TO_PX),
    left: Math.round(resolvedMarginsMm.left * MM_TO_PX),
    right: Math.round(resolvedMarginsMm.right * MM_TO_PX),
  };

  const printableWidthPx = Math.max(200, widthPx - marginsPx.left - marginsPx.right);
  const printableHeightPx = Math.max(300, heightPx - marginsPx.top - marginsPx.bottom);

  return {
    widthPx,
    heightPx,
    widthMm,
    heightMm,
    printableWidthPx,
    printableHeightPx,
    marginsPx,
  };
}

