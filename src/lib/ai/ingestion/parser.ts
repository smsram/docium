import { extractPdfDocument, optimizeImageBufferForVision } from '../pdf/pdfService';

/**
 * Multimodal Document Parser
 * Parses diverse file types:
 * - PDF
 * - DOCX and DOC
 * - PPTX and PPT
 * - XLSX and XLS
 * - CSV
 * - TXT
 * - Markdown
 * - HTML
 * - PNG, JPG, JPEG, WEBP
 *
 * Preserves headings, lists, hierarchy, tables, page numbers,
 * slide numbers, sheet names, cell references, and embedded image assets.
 */

export interface DocumentImageAsset {
  id: string;
  sourceId: string;
  documentId?: string;
  page?: number;
  slide?: number;
  sheet?: string;
  position: number;
  dimensions?: { width: number; height: number };
  mimeType: string;
  url: string; // Base64 data URL or storage URL
  caption?: string;
  ocrText?: string;
}

export interface ParsedDocumentResult {
  title: string;
  type: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'md' | 'image' | 'url';
  extractedText: string;
  snippet: string;
  pageCount?: number;
  slideCount?: number;
  sheetNames?: string[];
  visualPages?: number[];
  outline?: string[];
  mimeType: string;
  fileSize: string;
  contentHash: string;
  embeddedImages?: DocumentImageAsset[];
  ocrText?: string;
  imageDescription?: string;
}

function decodeXmlAndHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10) || 32))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16) || 32));
}

function htmlTableToMarkdown(tableHtml: string): string {
  const rows: string[][] = [];
  const rowMatches = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const rowHtml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowHtml.match(/<(?:th|td)\b[^>]*>[\s\S]*?<\/(?:th|td)>/gi) || [];
    for (const cellHtml of cellMatches) {
      const inner = decodeXmlAndHtmlEntities(
        cellHtml
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<\/p>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
      )
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(inner);
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(Math.max(0, colCount - r.length)).fill('')]);
  let md = '\n| ' + padded[0].join(' | ') + ' |\n';
  md += '| ' + padded[0].map(() => '---').join(' | ') + ' |\n';
  for (let i = 1; i < padded.length; i++) {
    md += '| ' + padded[i].join(' | ') + ' |\n';
  }
  return md + '\n';
}

function htmlToStructuredMarkdown(htmlContent: string): { markdown: string; outline: string[] } {
  const outline: string[] = [];
  let cleaned = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Preserve tables as Markdown tables first
  cleaned = cleaned.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tbl) => htmlTableToMarkdown(tbl));

  // Preserve image placeholders inserted via mammoth convertImage
  cleaned = cleaned.replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, (_m, alt) => `\n${alt}\n`);

  // Preserve headings h1..h6
  cleaned = cleaned.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => {
    const text = decodeXmlAndHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!text) return '';
    outline.push(`${'#'.repeat(Number(lvl))} ${text}`);
    return `\n${'#'.repeat(Number(lvl))} ${text}\n`;
  });

  // Preserve blockquotes & list items
  cleaned = cleaned.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
    const text = decodeXmlAndHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return text ? `\n> ${text}\n` : '';
  });
  cleaned = cleaned.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => {
    const text = decodeXmlAndHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return text ? `- ${text}\n` : '';
  });

  // Preserve paragraphs and line breaks
  cleaned = cleaned.replace(/<\/p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags without destroying line structure
  cleaned = decodeXmlAndHtmlEntities(cleaned.replace(/<[^>]+>/g, ' '));

  const normalizedLines = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown: normalizedLines, outline };
}

function isZipSignature(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function colRefToIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

import { computeContentHash } from './hash';
export { computeContentHash };

/**
 * Parses CSV or tabular text into structured Markdown table representation.
 */
export function parseCsvText(
  csvContent: string,
  sheetName = 'Sheet1'
): { markdownTable: string; rowCount: number; colCount: number } {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { markdownTable: '', rowCount: 0, colCount: 0 };

  const parsedRows = lines.map((line) => {
    const cells: string[] = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        cells.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim());
    return cells;
  });

  const header = parsedRows[0];
  const colCount = header.length;
  const rowCount = parsedRows.length - 1;

  let md = `### Table: ${sheetName}\n\n`;
  md += '| ' + header.join(' | ') + ' |\n';
  md += '| ' + header.map(() => '---').join(' | ') + ' |\n';

  for (let r = 1; r < Math.min(parsedRows.length, 60); r++) {
    const row = parsedRows[r];
    while (row.length < colCount) row.push('');
    md += '| ' + row.slice(0, colCount).join(' | ') + ' |\n';
  }

  if (parsedRows.length > 61) {
    md += `\n*... and ${parsedRows.length - 61} additional rows.*\n`;
  }

  return { markdownTable: md, rowCount, colCount };
}

/**
 * Extracts plain text, structural tags, and tables from HTML markup.
 */
export function parseHtmlContent(htmlContent: string): string {
  return htmlToStructuredMarkdown(htmlContent).markdown;
}

/**
 * Extracts structured document text, embedded image assets, and metadata from an uploaded file.
 */
export async function parseUploadedFile(
  file: File | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
  sourceIdPrefix = 'src'
): Promise<ParsedDocumentResult> {
  const filename = file.name;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const sizeKb = (file.size / 1024).toFixed(1);
  const fileSize = `${sizeKb} KB`;

  // 1. PLAIN TEXT AND MARKDOWN
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    const snippet = text.slice(0, 300).replace(/\s+/g, ' ').trim();
    const hash = computeContentHash(text);

    return {
      title: filename,
      type: ext === 'md' ? 'md' : 'txt',
      extractedText: text,
      snippet: snippet || `Text document (${fileSize})`,
      mimeType: file.type || 'text/plain',
      fileSize,
      contentHash: hash,
    };
  }

  // 2. HTML
  if (ext === 'html' || ext === 'htm') {
    const buffer = await file.arrayBuffer();
    const rawHtml = new TextDecoder('utf-8').decode(buffer);
    const { markdown, outline } = htmlToStructuredMarkdown(rawHtml);
    const hash = computeContentHash(markdown || rawHtml);

    return {
      title: filename,
      type: 'txt',
      extractedText: markdown,
      snippet: markdown.slice(0, 280) || `HTML page content (${fileSize})`,
      outline,
      mimeType: 'text/html',
      fileSize,
      contentHash: hash,
    };
  }

  // 3. CSV AND TSV
  if (ext === 'csv' || ext === 'tsv') {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    const { markdownTable, rowCount, colCount } = parseCsvText(text, filename);
    const hash = computeContentHash(text);

    return {
      title: filename,
      type: 'xlsx',
      extractedText: markdownTable,
      snippet: `Structured table: ${rowCount} rows, ${colCount} columns.`,
      mimeType: 'text/csv',
      fileSize,
      contentHash: hash,
    };
  }

  // 4. SPREADSHEETS (XLSX, XLS) — Real OOXML extraction via JSZip
  if (ext === 'xlsx' || ext === 'xls') {
    const arrayBuf = await file.arrayBuffer();
    const nodeBuf = Buffer.from(arrayBuf);
    const activeSheets: string[] = [];
    let spreadsheetText = `# Spreadsheet: ${filename}\n`;

    if (isZipSignature(nodeBuf)) {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(nodeBuf);

        // Shared strings lookup
        const sharedStrings: string[] = [];
        const ssFile = zip.file('xl/sharedStrings.xml');
        if (ssFile) {
          const ssXml = await ssFile.async('string');
          const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/gi) || [];
          for (const si of siMatches) {
            const tParts = Array.from(si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)).map((m) =>
              decodeXmlAndHtmlEntities(m[1])
            );
            sharedStrings.push(tParts.join(''));
          }
        }

        // Workbook sheet names
        const wbFile = zip.file('xl/workbook.xml');
        if (wbFile) {
          const wbXml = await wbFile.async('string');
          for (const m of wbXml.matchAll(/<sheet\b[^>]*name="([^"]+)"/gi)) {
            activeSheets.push(decodeXmlAndHtmlEntities(m[1]));
          }
        }

        const sheetPaths = Object.keys(zip.files)
          .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
          .sort((a, b) => {
            const na = parseInt(a.match(/(\d+)\.xml$/)?.[1] || '0', 10);
            const nb = parseInt(b.match(/(\d+)\.xml$/)?.[1] || '0', 10);
            return na - nb;
          });

        if (activeSheets.length === 0) {
          sheetPaths.forEach((_, idx) => activeSheets.push(`Sheet${idx + 1}`));
        }
        spreadsheetText += `Sheets: ${activeSheets.join(', ')}\n\n`;

        for (let sIdx = 0; sIdx < sheetPaths.length; sIdx++) {
          const sheetTitle = activeSheets[sIdx] || `Sheet${sIdx + 1}`;
          const sheetXml = await zip.file(sheetPaths[sIdx])!.async('string');
          const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) || [];
          const grid: string[][] = [];

          for (let r = 0; r < Math.min(rowMatches.length, 80); r++) {
            const rowXml = rowMatches[r];
            const rowCells: string[] = [];
            for (const cMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
              const attrs = cMatch[1];
              const body = cMatch[2];
              const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1] || '';
              const colIdx = ref ? colRefToIndex(ref) : rowCells.length;
              const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || '';
              let val = '';
              if (type === 'inlineStr') {
                val = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi))
                  .map((t) => decodeXmlAndHtmlEntities(t[1]))
                  .join('');
              } else {
                const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
                const rawV = vMatch ? decodeXmlAndHtmlEntities(vMatch[1]) : '';
                if (type === 's') {
                  const strIdx = parseInt(rawV, 10);
                  val = Number.isFinite(strIdx) && sharedStrings[strIdx] !== undefined ? sharedStrings[strIdx] : rawV;
                } else {
                  val = rawV;
                }
              }
              rowCells[colIdx] = val.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
            }
            if (rowCells.some((c) => c && c.length > 0)) {
              grid.push(rowCells.map((c) => c || ''));
            }
          }

          spreadsheetText += `## Sheet: ${sheetTitle}\n`;
          if (grid.length > 0) {
            const maxCols = Math.min(24, Math.max(...grid.map((g) => g.length)));
            const header = Array.from({ length: maxCols }, (_, i) => grid[0][i] || `Col ${i + 1}`);
            spreadsheetText += '| ' + header.join(' | ') + ' |\n';
            spreadsheetText += '| ' + header.map(() => '---').join(' | ') + ' |\n';
            for (let r = 1; r < grid.length; r++) {
              const padded = Array.from({ length: maxCols }, (_, i) => grid[r][i] || '');
              spreadsheetText += '| ' + padded.join(' | ') + ' |\n';
            }
            if (rowMatches.length > 80) {
              spreadsheetText += `\n*... and ${rowMatches.length - 80} more rows in "${sheetTitle}".*\n`;
            }
            spreadsheetText += '\n';
          } else {
            spreadsheetText += `*(Empty worksheet)*\n\n`;
          }
        }
      } catch (xlsxErr) {
        console.warn(`[DOCIUM Parser] XLSX ZIP parsing fallback for ${filename}:`, xlsxErr);
      }
    }

    if (activeSheets.length === 0) {
      activeSheets.push('Sheet1');
      const rawPrintable = new TextDecoder('utf-8', { fatal: false })
        .decode(nodeBuf)
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);
      spreadsheetText += rawPrintable
        ? `Extracted Legacy Spreadsheet Text:\n${rawPrintable}\n`
        : `[Legacy binary spreadsheet "${filename}" (${fileSize}) — upload .xlsx or .csv for full cell extraction]\n`;
    }

    const hash = computeContentHash(nodeBuf.subarray(0, 1024 * 512).toString('base64') + spreadsheetText);

    return {
      title: filename,
      type: 'xlsx',
      extractedText: spreadsheetText.trim(),
      snippet: `Spreadsheet with ${activeSheets.length} sheet(s): ${activeSheets.join(', ')} (${fileSize})`,
      sheetNames: activeSheets,
      mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize,
      contentHash: hash,
    };
  }

  // 5. PRESENTATIONS (PPTX, PPT) — Real OOXML slide & media extraction via JSZip
  if (ext === 'pptx' || ext === 'ppt') {
    const arrayBuf = await file.arrayBuffer();
    const nodeBuf = Buffer.from(arrayBuf);
    const embeddedImages: DocumentImageAsset[] = [];
    let presentationText = `# Presentation: ${filename}\n`;
    let slideCount = 0;

    if (isZipSignature(nodeBuf)) {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(nodeBuf);

        const slidePaths = Object.keys(zip.files)
          .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
          .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)\.xml$/i)?.[1] || '0', 10);
            const nb = parseInt(b.match(/slide(\d+)\.xml$/i)?.[1] || '0', 10);
            return na - nb;
          });

        slideCount = slidePaths.length;
        for (let i = 0; i < slidePaths.length; i++) {
          const slideNum = i + 1;
          const slideXml = await zip.file(slidePaths[i])!.async('string');
          const paragraphs: string[] = [];
          for (const pMatch of slideXml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi)) {
            const runs = Array.from(pMatch[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)).map((t) =>
              decodeXmlAndHtmlEntities(t[1])
            );
            const line = runs.join('').replace(/\s+/g, ' ').trim();
            if (line) paragraphs.push(line);
          }

          presentationText += `--- Slide ${slideNum} ---\n`;
          presentationText += paragraphs.length > 0 ? paragraphs.map((p, idx) => (idx === 0 ? `## ${p}` : `- ${p}`)).join('\n') : '*(Visual slide / no text runs)*';
          presentationText += '\n\n';
        }

        // Extract real embedded media assets from ppt/media/
        const mediaPaths = Object.keys(zip.files).filter((p) =>
          /^ppt\/media\/.+\.(png|jpe?g|webp|gif)$/i.test(p)
        );
        for (let idx = 0; idx < Math.min(mediaPaths.length, 15); idx++) {
          const mp = mediaPaths[idx];
          const mediaBuf = await zip.file(mp)!.async('nodebuffer');
          if (!mediaBuf || mediaBuf.length === 0) continue;
          const mExt = mp.split('.').pop()?.toLowerCase() || 'png';
          const origMime = mExt === 'png' ? 'image/png' : mExt === 'webp' ? 'image/webp' : mExt === 'gif' ? 'image/gif' : 'image/jpeg';
          const opt = await optimizeImageBufferForVision(mediaBuf, origMime, { maxDimension: 1280, maxBytes: 700 * 1024 });
          const imgId = `${sourceIdPrefix}-img-media-${idx + 1}`;
          embeddedImages.push({
            id: imgId,
            sourceId: sourceIdPrefix,
            position: idx + 1,
            dimensions: opt.width && opt.height ? { width: opt.width, height: opt.height } : undefined,
            mimeType: opt.mimeType,
            url: `data:${opt.mimeType};base64,${opt.buffer.toString('base64')}`,
            caption: `${filename} — ${mp.split('/').pop()}`,
          });
          presentationText += `[Image: ${imgId} (${mp.split('/').pop()})]\n`;
        }
      } catch (pptxErr) {
        console.warn(`[DOCIUM Parser] PPTX parsing fallback for ${filename}:`, pptxErr);
      }
    }

    if (slideCount === 0) {
      slideCount = 1;
      presentationText += `--- Slide 1 ---\n[Unable to extract XML slides from "${filename}" (${fileSize})]\n`;
    }

    const hash = computeContentHash(presentationText);

    return {
      title: filename,
      type: 'pptx',
      extractedText: presentationText.trim(),
      snippet: `Presentation: ${slideCount} slide(s)${embeddedImages.length > 0 ? `, ${embeddedImages.length} embedded image(s)` : ''} (${fileSize})`,
      slideCount,
      mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize,
      contentHash: hash,
      embeddedImages,
    };
  }

  // 6. PDF DOCUMENTS
  if (ext === 'pdf') {
    const arrayBuf = await file.arrayBuffer();
    const nodeBuf = Buffer.from(arrayBuf);
    const pdfAnalysis = await extractPdfDocument(nodeBuf, filename);

    if (pdfAnalysis.success && pdfAnalysis.totalPages > 0) {
      const hash = computeContentHash(pdfAnalysis.fullText);
      const visualCount = pdfAnalysis.visualPages?.length || 0;
      const metaTitleNote =
        pdfAnalysis.title && pdfAnalysis.title.toLowerCase() !== filename.toLowerCase()
          ? ` (Metadata Title: "${pdfAnalysis.title}")`
          : '';
      const snippet = `PDF document: ${pdfAnalysis.totalPages} pages, ${
        pdfAnalysis.hasNativeText ? 'native text extracted' : 'scanned/visual document'
      }${visualCount > 0 ? `, ${visualCount} visual/diagram page(s)` : ''}${metaTitleNote} (${fileSize})`;

      return {
        title: filename,
        type: 'pdf',
        extractedText: pdfAnalysis.fullText,
        snippet,
        pageCount: pdfAnalysis.totalPages,
        visualPages: pdfAnalysis.visualPages,
        mimeType: 'application/pdf',
        fileSize,
        contentHash: hash,
        embeddedImages: [],
      };
    }

    // Fallback: raw stream text extraction if parser had an issue
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuf);
    const textMatches = raw.match(/\(([^)]+)\)\s*Tj/g) || [];
    const extractedWords = textMatches
      .map((m) => m.replace(/^[(\s]+|[)\s*Tj]+$/g, ''))
      .filter((w) => w.length > 1)
      .join(' ');

    const fallbackText = extractedWords
      ? `--- Page 1 ---\n# ${filename}\n${extractedWords}\n`
      : `--- Page 1 ---\n# ${filename}\n[Scanned or binary PDF document]\n`;
    const hash = computeContentHash(fallbackText);

    return {
      title: filename,
      type: 'pdf',
      extractedText: fallbackText,
      snippet: `PDF document: 1 page (${fileSize})`,
      pageCount: 1,
      mimeType: 'application/pdf',
      fileSize,
      contentHash: hash,
      embeddedImages: [],
    };
  }

  // 7. WORD DOCUMENTS (DOCX, DOC) — Real mammoth + OOXML parsing with embedded image extraction
  if (ext === 'docx' || ext === 'doc') {
    const arrayBuf = await file.arrayBuffer();
    const nodeBuf = Buffer.from(arrayBuf);
    const embeddedImages: DocumentImageAsset[] = [];
    let docxText = '';
    let outline: string[] = [];

    if (ext === 'docx' && isZipSignature(nodeBuf)) {
      try {
        const mammoth = (await import('mammoth')).default;
        let imageIndex = 0;

        const result = await mammoth.convertToHtml(
          { buffer: nodeBuf },
          {
            styleMap: [
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
              'u => u',
              'strike => s',
              'b => strong',
              'i => em',
            ],
            includeDefaultStyleMap: true,
            convertImage: mammoth.images.imgElement(async (image) => {
              const rawImgBuf = await image.readAsBuffer();
              const mime = (image.contentType || 'image/png').toLowerCase();
              // Only extract raster web-compatible formats
              if (/^image\/(png|jpe?g|webp|gif)$/i.test(mime) && rawImgBuf.length > 0 && embeddedImages.length < 20) {
                imageIndex++;
                const imgId = `${sourceIdPrefix}-img-${imageIndex}`;
                const opt = await optimizeImageBufferForVision(rawImgBuf, mime, { maxDimension: 1280, maxBytes: 700 * 1024 });
                embeddedImages.push({
                  id: imgId,
                  sourceId: sourceIdPrefix,
                  position: imageIndex,
                  dimensions: opt.width && opt.height ? { width: opt.width, height: opt.height } : undefined,
                  mimeType: opt.mimeType,
                  url: `data:${opt.mimeType};base64,${opt.buffer.toString('base64')}`,
                  caption: `${filename} — Embedded Image ${imageIndex}`,
                });
                return { src: imgId, alt: `[Image: ${imgId}]` };
              }
              return { src: '', alt: '' };
            }),
          }
        );

        const structured = htmlToStructuredMarkdown(result.value || '');
        docxText = structured.markdown;
        outline = structured.outline;
      } catch (docxErr) {
        console.warn(`[DOCIUM Parser] Mammoth DOCX extraction fallback for ${filename}:`, docxErr);
      }
    }

    if (!docxText.trim()) {
      // Honest legacy binary (.doc) or corrupted file ASCII/UTF-16 run extraction
      const rawUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(nodeBuf);
      const cleanSegments = rawUtf8.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      docxText = cleanSegments
        ? `# ${filename}\n\n${cleanSegments.slice(0, 8000)}`
        : `# ${filename}\n\n[Binary Word document "${filename}" (${fileSize}) — save as .docx for full structured extraction]`;
    }

    const snippet = docxText.replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim().slice(0, 280) ||
      `Word document "${filename}" (${fileSize})`;
    const hash = computeContentHash(docxText + `:${embeddedImages.length}`);

    return {
      title: filename,
      type: 'docx',
      extractedText: docxText,
      snippet,
      outline: outline.slice(0, 30),
      mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize,
      contentHash: hash,
      embeddedImages,
    };
  }

  // 8. STANDALONE IMAGES (PNG, JPG, JPEG, WEBP, SVG)
  if (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'webp' ||
    ext === 'svg' ||
    file.type.startsWith('image/')
  ) {
    const arrayBuf = await file.arrayBuffer();
    const rawBuf = Buffer.from(arrayBuf);
    const cleanExt = ext.toLowerCase();
    const declaredMime =
      file.type && file.type !== 'application/octet-stream'
        ? file.type
        : cleanExt === 'png'
        ? 'image/png'
        : cleanExt === 'webp'
        ? 'image/webp'
        : cleanExt === 'svg'
        ? 'image/svg+xml'
        : 'image/jpeg';

    const opt = await optimizeImageBufferForVision(rawBuf, declaredMime, { maxDimension: 1568, maxBytes: 900 * 1024 });
    const mime = opt.mimeType || declaredMime;
    const base64 = opt.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    // Honest unanalyzed metadata placeholder until real VLM captioning runs in upload route / inspect_source_image
    const dimLabel = opt.width && opt.height ? `${opt.width}x${opt.height}, ` : '';
    const imageDescription = `Image asset "${filename}" (${dimLabel}${fileSize}, ${mime}). Ready for visual inspection.`;
    const hash = computeContentHash(rawBuf.toString('base64'));

    const standaloneAsset: DocumentImageAsset = {
      id: `${sourceIdPrefix}-img-standalone`,
      sourceId: sourceIdPrefix,
      position: 1,
      dimensions: opt.width && opt.height ? { width: opt.width, height: opt.height } : undefined,
      mimeType: mime,
      url: dataUrl,
      caption: filename,
    };

    return {
      title: filename,
      type: 'image',
      extractedText: `[Image: ${filename}]\n${imageDescription}`,
      snippet: imageDescription,
      mimeType: mime,
      fileSize,
      contentHash: hash,
      embeddedImages: [standaloneAsset],
      imageDescription,
    };
  }

  // 9. DEFAULT FALLBACK
  const buffer = await file.arrayBuffer();
  const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const printableText = rawText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  const hash = computeContentHash(printableText);

  return {
    title: filename,
    type: 'txt',
    extractedText: printableText || `Reference documentation for ${filename}.`,
    snippet: `Attachment: ${filename} (${fileSize})`,
    mimeType: file.type || 'application/octet-stream',
    fileSize,
    contentHash: hash,
  };
}
