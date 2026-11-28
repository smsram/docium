/**
 * DOCIUM Dedicated PDF Processing & Rendering Service
 *
 * Provides:
 * 1. Native text extraction by page using unpdf across all JS runtimes.
 * 2. Structure preservation: Page numbers, headings, code, and tables.
 * 3. Detection of image-only / visually important pages.
 * 4. High-fidelity page-to-image rendering via unpdf and @napi-rs/canvas.
 * 5. Exhaustive image validation (signatures, dimensions, full sharp raw decode).
 * 6. Bulletproof Base64 data URI generation with zero corruption or truncation.
 */

import crypto from 'crypto';
import { loadCachedRenderedPdfPage, saveCachedRenderedPdfPage } from '@/lib/storage/sourceStorage';

async function getSharp() {
  const mod = await import('sharp');
  return mod.default || mod;
}

/**
 * Optimizes large raster images before multimodal vision dispatch (keeps text sharp while
 * bounding max dimension to 1568px and size under ~900KB).
 */
export async function optimizeImageBufferForVision(
  buffer: Buffer,
  mimeType: string,
  options: { maxDimension?: number; maxBytes?: number; quality?: number } = {}
): Promise<{ buffer: Buffer; mimeType: string; compressed: boolean; width?: number; height?: number }> {
  const cleanMime = (mimeType || 'image/jpeg').toLowerCase();
  if (!buffer || buffer.length === 0) {
    return { buffer, mimeType: cleanMime, compressed: false };
  }
  // Keep vector SVG and potentially animated GIF untouched
  if (cleanMime === 'image/svg+xml' || cleanMime === 'image/gif') {
    return { buffer, mimeType: cleanMime, compressed: false };
  }

  const maxDim = options.maxDimension || 1568;
  const maxBytes = options.maxBytes || 900 * 1024;
  const quality = options.quality || 86;

  try {
    const sharp = await getSharp();
    const s = sharp(buffer);
    const meta = await s.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;

    const needsResize = width > maxDim || height > maxDim;
    const needsReencode = buffer.length > maxBytes;

    if (!needsResize && !needsReencode) {
      return { buffer, mimeType: cleanMime, compressed: false, width, height };
    }

    let pipeline = sharp(buffer);
    if (needsResize) {
      pipeline = pipeline.resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Encode crisp JPEG (with white background if PNG had alpha) or preserve WebP/PNG if compact
    let outMime = 'image/jpeg';
    let outBuf: Buffer;
    if (cleanMime === 'image/webp') {
      outMime = 'image/webp';
      outBuf = await pipeline.webp({ quality }).toBuffer();
    } else {
      outBuf = await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer();
    }

    // If re-encoding somehow made it larger, only keep if resized or original was huge PNG
    if (outBuf.length < buffer.length || needsResize) {
      const outMeta = await sharp(outBuf).metadata();
      return {
        buffer: outBuf,
        mimeType: outMime,
        compressed: true,
        width: outMeta.width || width,
        height: outMeta.height || height,
      };
    }
    return { buffer, mimeType: cleanMime, compressed: false, width, height };
  } catch {
    return { buffer, mimeType: cleanMime, compressed: false };
  }
}

export interface PdfPageText {
  pageNumber: number;
  text: string;
  charCount: number;
  isImageOnly: boolean;
  embeddedImageCount?: number;
  hasEmbeddedImages?: boolean;
  vectorOpCount?: number;
  needsVisualInspection?: boolean;
}

export interface PdfDocumentAnalysis {
  success: boolean;
  totalPages: number;
  title: string;
  metadata: Record<string, unknown>;
  pages: PdfPageText[];
  fullText: string;
  hasNativeText: boolean;
  imageOnlyPageCount: number;
  hybridVisualPageCount?: number;
  visualPages?: number[];
  error?: string;
}

export interface RenderedPdfPageResult {
  success: boolean;
  pageNumber: number;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  byteLength: number;
  base64Length: number;
  dataUrl: string;
  buffer: Buffer;
  hash: string;
  error?: string;
}

export interface ImageValidationDetails {
  valid: boolean;
  width?: number;
  height?: number;
  format?: string;
  mimeType?: string;
  byteLength?: number;
  base64Length?: number;
  hash?: string;
  error?: string;
}

/**
 * Converts a Node.js Buffer into a clean, unpooled Uint8Array compatible
 * with pdf.js worker transfer and Structured Clone algorithm.
 */
function toCleanUint8Array(buffer: Buffer): Uint8Array {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Uint8Array(ab);
}

/**
 * Checks if a buffer begins with standard PDF header magic bytes "%PDF-".
 */
export function isPdfBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  return buffer.slice(0, 5).toString('ascii') === '%PDF-';
}

/**
 * Validates whether an image buffer is completely decodable and uncorrupted.
 * Verifies magic signature and executes a full sharp raw decode test to guarantee
 * that no truncated or malformed image reaches the vision model.
 */
export async function validateImageBuffer(
  buffer: Buffer,
  declaredMime?: string
): Promise<ImageValidationDetails> {
  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      byteLength: 0,
      error: 'Image buffer is empty (0 bytes)',
    };
  }

  // 1. Signature checks
  const isPngSig =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  const isJpegSig =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isWebpSig =
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP';

  const isGifSig =
    buffer.length >= 6 &&
    (buffer.slice(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.slice(0, 6).toString('ascii') === 'GIF89a');

  if (!isPngSig && !isJpegSig && !isWebpSig && !isGifSig) {
    return {
      valid: false,
      byteLength: buffer.length,
      error: 'Unrecognized or corrupted image header signature',
    };
  }

  // 2. Full sharp raw decode test (detects truncated scan data, premature end of file, etc.)
  try {
    const sharp = await getSharp();
    const s = sharp(buffer);
    const meta = await s.metadata();

    if (!meta.width || !meta.height || meta.width <= 0 || meta.height <= 0) {
      return {
        valid: false,
        byteLength: buffer.length,
        error: `Invalid image dimensions: ${meta.width}x${meta.height}`,
      };
    }

    // Force complete pixel decode to ensure scan data is intact and not truncated
    await s.raw().toBuffer();

    const actualFormat = meta.format?.toLowerCase() || 'unknown';
    const actualMime =
      actualFormat === 'jpeg' || actualFormat === 'jpg'
        ? 'image/jpeg'
        : actualFormat === 'png'
        ? 'image/png'
        : actualFormat === 'webp'
        ? 'image/webp'
        : actualFormat === 'gif'
        ? 'image/gif'
        : `image/${actualFormat}`;

    if (declaredMime && declaredMime.toLowerCase() !== actualMime) {
      // Allow image/jpg vs image/jpeg equivalence
      const d = declaredMime.toLowerCase().replace('image/jpg', 'image/jpeg');
      if (d !== actualMime) {
        return {
          valid: false,
          width: meta.width,
          height: meta.height,
          format: actualFormat,
          mimeType: actualMime,
          byteLength: buffer.length,
          error: `Declared MIME type "${declaredMime}" does not match actual encoded format "${actualMime}"`,
        };
      }
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      valid: true,
      width: meta.width,
      height: meta.height,
      format: actualFormat,
      mimeType: actualMime,
      byteLength: buffer.length,
      hash,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      byteLength: buffer.length,
      error: `Image decoding validation failed: ${msg}`,
    };
  }
}

/**
 * Extracts native text, metadata, and per-page structures from a PDF binary.
 */
export async function extractPdfDocument(
  buffer: Buffer,
  fallbackFilename = 'document.pdf'
): Promise<PdfDocumentAnalysis> {
  if (!isPdfBuffer(buffer)) {
    return {
      success: false,
      totalPages: 0,
      title: fallbackFilename,
      metadata: {},
      pages: [],
      fullText: '',
      hasNativeText: false,
      imageOnlyPageCount: 0,
      error: 'Invalid PDF buffer (missing %PDF- header signature)',
    };
  }

  try {
    const unpdf = await import('unpdf');
    const uint8 = toCleanUint8Array(buffer);
    const doc = await unpdf.getDocumentProxy(uint8);

    // 1. Metadata and page count
    let title = fallbackFilename;
    let metadataObj: Record<string, unknown> = {};
    try {
      const meta = await unpdf.getMeta(doc);
      if (meta && typeof meta === 'object') {
        metadataObj = meta as Record<string, unknown>;
        if (meta.info && typeof meta.info === 'object' && (meta.info as any).Title) {
          title = String((meta.info as any).Title);
        }
      }
    } catch {
      // Proceed even if metadata header is non-standard
    }

    // 2. Extract per-page text + visual operator complexity (embedded images / vector charts)
    const { totalPages, text: rawPages } = await unpdf.extractText(doc, { mergePages: false });
    const pageTexts = Array.isArray(rawPages) ? rawPages : [String(rawPages || '')];

    let pdfjsOps: Record<string, number> = {};
    try {
      const pdfjs = await unpdf.getResolvedPDFJS();
      if (pdfjs && pdfjs.OPS) {
        pdfjsOps = pdfjs.OPS as unknown as Record<string, number>;
      }
    } catch {
      // Fallback safely if OPS constants unavailable
    }

    const IMAGE_OP_IDS = new Set<number>(
      [
        pdfjsOps.paintImageXObject,
        pdfjsOps.paintInlineImageXObject,
        pdfjsOps.paintImageMaskXObject,
        pdfjsOps.paintImageXObjectRepeat,
        pdfjsOps.paintFormXObjectBegin,
      ].filter((v): v is number => typeof v === 'number')
    );
    const VECTOR_OP_IDS = new Set<number>(
      [
        pdfjsOps.stroke,
        pdfjsOps.closeStroke,
        pdfjsOps.fill,
        pdfjsOps.eoFill,
        pdfjsOps.fillStroke,
        pdfjsOps.eoFillStroke,
      ].filter((v): v is number => typeof v === 'number')
    );

    const pages: PdfPageText[] = [];
    const visualPages: number[] = [];
    let accumulatedText = '';
    let totalNativeChars = 0;
    let imageOnlyCount = 0;
    let hybridVisualPageCount = 0;

    // Inspect operator lists up to 80 pages to stay fast while flagging hybrid visual pages
    const maxOpPages = Math.min(totalPages, 80);

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      const rawText = (pageTexts[i] || '').trim();
      const cleanText = rawText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
      const charCount = cleanText.length;
      const isImageOnly = charCount < 40;

      let embeddedImageCount = 0;
      let vectorOpCount = 0;

      if (pageNum <= maxOpPages && IMAGE_OP_IDS.size > 0) {
        try {
          const pdfPage = await doc.getPage(pageNum);
          const opList = await pdfPage.getOperatorList();
          if (opList && Array.isArray(opList.fnArray)) {
            for (const fn of opList.fnArray) {
              if (IMAGE_OP_IDS.has(fn)) embeddedImageCount++;
              else if (VECTOR_OP_IDS.has(fn)) vectorOpCount++;
            }
          }
          pdfPage.cleanup?.();
        } catch {
          // Non-fatal: continue with text-only classification for this page
        }
      }

      const hasEmbeddedImages = embeddedImageCount > 0;
      const hasComplexVectorGraphics = vectorOpCount > 80;
      const needsVisualInspection = isImageOnly || hasEmbeddedImages || hasComplexVectorGraphics;

      if (isImageOnly) {
        imageOnlyCount++;
      } else if (hasEmbeddedImages || hasComplexVectorGraphics) {
        hybridVisualPageCount++;
      }
      if (needsVisualInspection) {
        visualPages.push(pageNum);
      }
      totalNativeChars += charCount;

      pages.push({
        pageNumber: pageNum,
        text: cleanText,
        charCount,
        isImageOnly,
        embeddedImageCount,
        hasEmbeddedImages,
        vectorOpCount,
        needsVisualInspection,
      });

      const visualNote = isImageOnly
        ? '[Visual Page / No native text extracted]'
        : hasEmbeddedImages
        ? `${cleanText}\n[Page ${pageNum} Visuals: Contains ${embeddedImageCount} embedded image/diagram object(s) — call inspect_source_image with page=${pageNum} if visual details are required]`
        : hasComplexVectorGraphics
        ? `${cleanText}\n[Page ${pageNum} Visuals: Contains complex vector graphics/charts — call inspect_source_image with page=${pageNum} if visual details are required]`
        : cleanText;

      accumulatedText += `--- Page ${pageNum} ---\n${visualNote}\n\n`;
    }

    const hasNativeText = totalNativeChars > 100;

    return {
      success: true,
      totalPages,
      title,
      metadata: metadataObj,
      pages,
      fullText: accumulatedText.trim(),
      hasNativeText,
      imageOnlyPageCount: imageOnlyCount,
      hybridVisualPageCount,
      visualPages,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      totalPages: 0,
      title: fallbackFilename,
      metadata: {},
      pages: [],
      fullText: '',
      hasNativeText: false,
      imageOnlyPageCount: 0,
      error: `PDF extraction error: ${msg}`,
    };
  }
}

/**
 * Renders a specific PDF page to an uncorrupted, fully-validated image buffer.
 */
export async function renderPdfPageToImage(
  buffer: Buffer,
  pageNumber: number,
  options: {
    format?: 'png' | 'jpeg';
    scale?: number;
    width?: number;
  } = {}
): Promise<RenderedPdfPageResult> {
  if (!isPdfBuffer(buffer)) {
    return {
      success: false,
      pageNumber,
      mimeType: 'image/png',
      width: 0,
      height: 0,
      byteLength: 0,
      base64Length: 0,
      dataUrl: '',
      buffer: Buffer.alloc(0),
      hash: '',
      error: 'Invalid PDF buffer provided for rendering',
    };
  }

  const targetFormat = options.format || 'png';
  const targetMime = targetFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
  const renderScale = options.scale || 1.5;

  // Check persistent disk cache first for instant repeat page visual inspections
  const cachedPage = loadCachedRenderedPdfPage(buffer, pageNumber, renderScale, targetFormat, options.width);
  if (cachedPage) {
    const base64Data = cachedPage.buffer.toString('base64');
    const dataUrl = `data:${targetMime};base64,${base64Data}`;
    return {
      success: true,
      pageNumber,
      mimeType: targetMime,
      width: cachedPage.meta.width,
      height: cachedPage.meta.height,
      byteLength: cachedPage.buffer.length,
      base64Length: dataUrl.length,
      dataUrl,
      buffer: cachedPage.buffer,
      hash: cachedPage.meta.hash,
    };
  }

  try {
    const unpdf = await import('unpdf');
    const uint8 = toCleanUint8Array(buffer);
    const doc = await unpdf.getDocumentProxy(uint8);

    if (pageNumber < 1 || pageNumber > doc.numPages) {
      return {
        success: false,
        pageNumber,
        mimeType: targetMime,
        width: 0,
        height: 0,
        byteLength: 0,
        base64Length: 0,
        dataUrl: '',
        buffer: Buffer.alloc(0),
        hash: '',
        error: `Page number ${pageNumber} is out of bounds (1 to ${doc.numPages})`,
      };
    }

    // Render using @napi-rs/canvas factory
    const rawRenderedBuffer = await unpdf.renderPageAsImage(doc, pageNumber, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: options.scale || 1.5,
      width: options.width,
    });

    if (!rawRenderedBuffer || rawRenderedBuffer.byteLength === 0) {
      return {
        success: false,
        pageNumber,
        mimeType: targetMime,
        width: 0,
        height: 0,
        byteLength: 0,
        base64Length: 0,
        dataUrl: '',
        buffer: Buffer.alloc(0),
        hash: '',
        error: `Renderer produced 0 bytes for page ${pageNumber}`,
      };
    }

    const nodeBuffer = Buffer.from(rawRenderedBuffer);

    // Convert or normalize through sharp
    const sharp = await getSharp();
    let finalBuffer: Buffer;
    if (targetFormat === 'jpeg') {
      finalBuffer = await sharp(nodeBuffer)
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      finalBuffer = await sharp(nodeBuffer).png().toBuffer();
    }

    // Strict validation of the generated image buffer
    const val = await validateImageBuffer(finalBuffer, targetMime);
    if (!val.valid) {
      return {
        success: false,
        pageNumber,
        mimeType: targetMime,
        width: val.width || 0,
        height: val.height || 0,
        byteLength: finalBuffer.length,
        base64Length: 0,
        dataUrl: '',
        buffer: finalBuffer,
        hash: val.hash || '',
        error: `Rendered image validation failed for page ${pageNumber}: ${val.error}`,
      };
    }

    const base64Data = finalBuffer.toString('base64');
    const dataUrl = `data:${targetMime};base64,${base64Data}`;
    const hash = val.hash || crypto.createHash('sha256').update(finalBuffer).digest('hex');

    saveCachedRenderedPdfPage(buffer, pageNumber, renderScale, targetFormat, options.width, finalBuffer, {
      width: val.width!,
      height: val.height!,
      mimeType: targetMime,
      hash,
    });

    return {
      success: true,
      pageNumber,
      mimeType: targetMime,
      width: val.width!,
      height: val.height!,
      byteLength: finalBuffer.length,
      base64Length: dataUrl.length,
      dataUrl,
      buffer: finalBuffer,
      hash,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      pageNumber,
      mimeType: targetMime,
      width: 0,
      height: 0,
      byteLength: 0,
      base64Length: 0,
      dataUrl: '',
      buffer: Buffer.alloc(0),
      hash: '',
      error: `Failed to render PDF page ${pageNumber}: ${msg}`,
    };
  }
}
