import { DocumentPageSize, DocumentOrientation, DocumentMargins, MarginPreset } from '@/lib/types';
import { getResolvedMargins, PAPER_SIZES_MM } from './pageMetrics';

const PAGE_GAP_PX = 32;

/**
 * Strips live editor selection highlights, resize handles, context menus, and floating UI chrome
 * inside html2canvas's cloned DOM so exported PDFs are 100% clean print output.
 */
function stripEditorSelectionChrome(clonedDoc: Document) {
  clonedDoc.querySelectorAll('[data-docium-ui-only="true"], .column-resize-handle, .no-print').forEach((el) => {
    (el as HTMLElement).style.display = 'none';
  });
  clonedDoc.querySelectorAll('.ProseMirror-selectednode, .ring-2, .ring-1').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.boxShadow = 'none';
    htmlEl.style.outline = 'none';
    htmlEl.classList.remove('ProseMirror-selectednode', 'ring-2', 'ring-1');
  });
  const style = clonedDoc.createElement('style');
  style.textContent = `
    .ProseMirror .selectedCell::after { display: none !important; background: transparent !important; }
    .ProseMirror .column-resize-handle { display: none !important; }
    .ProseMirror-selectednode { outline: none !important; box-shadow: none !important; }
    [data-docium-ui-only="true"], .print\\:hidden { display: none !important; }
  `;
  clonedDoc.head.appendChild(style);
}

export async function exportToPdf(
  title: string,
  options?: {
    pageSize?: DocumentPageSize;
    orientation?: DocumentOrientation;
    margins?: DocumentMargins | MarginPreset;
    pageColor?: string;
  }
): Promise<void> {
  const orientation = options?.orientation || 'portrait';
  const pageSize = options?.pageSize || 'A4';
  const safeTitle = (title || 'Untitled_Document').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '_');

  const sizeSpec = PAPER_SIZES_MM[pageSize as keyof typeof PAPER_SIZES_MM] || PAPER_SIZES_MM.A4;
  const pdfWidthMm = orientation === 'portrait' ? sizeSpec.width : sizeSpec.height;
  const pdfHeightMm = orientation === 'portrait' ? sizeSpec.height : sizeSpec.width;

  const paginatedEl = document.getElementById('docium-paginated-sheet');
  const continuousSheet = document.getElementById('docium-page-1');
  const captureEl = paginatedEl || continuousSheet;

  if (captureEl) {
    // Temporarily reset any CSS zoom transform on parent wrapper so capture is crisp 1:1
    const scaleParent = captureEl.parentElement;
    const prevTransform = scaleParent?.style.transform || '';
    const prevTransition = scaleParent?.style.transition || '';
    if (scaleParent && prevTransform.includes('scale(')) {
      scaleParent.style.transition = 'none';
      scaleParent.style.transform = 'scale(1)';
    }

    const captureScale = 3;
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ]);

      const fullCanvas = await html2canvas(captureEl, {
        scale: captureScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: options?.pageColor || '#ffffff',
        logging: false,
        onclone: stripEditorSelectionChrome,
        ignoreElements: (el) => {
          return (
            el.classList?.contains('no-print') ||
            el.classList?.contains('print:hidden') ||
            el.getAttribute?.('data-docium-ui-only') === 'true'
          );
        },
      });

      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [pdfWidthMm, pdfHeightMm],
        compress: true,
      });

      if (paginatedEl) {
        const sheets = paginatedEl.querySelectorAll('.docium-paper-sheet');
        const pageCount = Math.max(1, sheets.length);
        const firstSheet = sheets[0] as HTMLElement | undefined;
        const pageWidthPx = firstSheet?.offsetWidth || paginatedEl.offsetWidth;
        const pageHeightPx = firstSheet?.offsetHeight || Math.round(pageWidthPx * (pdfHeightMm / pdfWidthMm));
        const pageStridePx = pageHeightPx + PAGE_GAP_PX;

        const sliceWidthPx = Math.round(pageWidthPx * captureScale);
        const sliceHeightPx = Math.round(pageHeightPx * captureScale);
        const stridePx = Math.round(pageStridePx * captureScale);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = sliceWidthPx;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext('2d');

        for (let i = 0; i < pageCount; i++) {
          if (!ctx) break;
          const srcY = i * stridePx;
          if (srcY >= fullCanvas.height) break;

          const availH = Math.min(sliceHeightPx, fullCanvas.height - srcY);
          ctx.fillStyle = options?.pageColor || '#ffffff';
          ctx.fillRect(0, 0, sliceWidthPx, sliceHeightPx);
          ctx.drawImage(fullCanvas, 0, srcY, sliceWidthPx, availH, 0, 0, sliceWidthPx, availH);

          if (i > 0) {
            pdf.addPage([pdfWidthMm, pdfHeightMm], orientation);
          }
          const imgData = pageCanvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
        }
      } else {
        // Continuous / Web Layout mode: paginate directly into crisp multi-page PDF without print dialog
        const pageWidthPx = fullCanvas.width;
        const pageHeightPx = Math.round(pageWidthPx * (pdfHeightMm / pdfWidthMm));
        const totalPages = Math.max(1, Math.ceil(fullCanvas.height / pageHeightPx));

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = pageWidthPx;
        pageCanvas.height = pageHeightPx;
        const ctx = pageCanvas.getContext('2d');

        for (let i = 0; i < totalPages; i++) {
          if (!ctx) break;
          const srcY = i * pageHeightPx;
          const availH = Math.min(pageHeightPx, fullCanvas.height - srcY);
          ctx.fillStyle = options?.pageColor || '#ffffff';
          ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);
          ctx.drawImage(fullCanvas, 0, srcY, pageWidthPx, availH, 0, 0, pageWidthPx, availH);

          if (i > 0) {
            pdf.addPage([pdfWidthMm, pdfHeightMm], orientation);
          }
          const imgData = pageCanvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
        }
      }

      pdf.save(`${safeTitle}.pdf`);
      return;
    } finally {
      if (scaleParent) {
        scaleParent.style.transform = prevTransform;
        scaleParent.style.transition = prevTransition;
      }
    }
  }

  triggerPrintPdf({ title, pageSize, orientation, margins: options?.margins });
}

export function triggerPrintPdf(options?: {
  title?: string;
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins | MarginPreset;
}) {
  const orientation = options?.orientation || 'portrait';
  const pageSize = options?.pageSize || 'A4';
  const resolvedMargins = getResolvedMargins(options?.margins);

  const styleId = 'docium-print-page-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  const printCss = `
    @media print {
      @page {
        size: ${pageSize} ${orientation};
        margin: ${resolvedMargins.top}mm ${resolvedMargins.right}mm ${resolvedMargins.bottom}mm ${resolvedMargins.left}mm;
      }
    }
  `;

  styleEl.textContent = printCss;

  setTimeout(() => {
    window.print();
  }, 100);
}
