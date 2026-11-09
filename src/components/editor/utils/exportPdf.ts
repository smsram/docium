import { DocumentPageSize, DocumentOrientation, DocumentMargins, MarginPreset } from '@/lib/types';
import { getResolvedMargins } from './pageMetrics';

export function triggerPrintPdf(options?: {
  title?: string;
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins | MarginPreset;
}) {
  const orientation = options?.orientation || 'portrait';
  const pageSize = options?.pageSize || 'A4';
  const resolvedMargins = getResolvedMargins(options?.margins);

  // Inject a temporary print style tag to enforce precise physical page setup during browser print
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
      body {
        background: #ffffff !important;
        color: #000000 !important;
      }
      .no-print, header, nav, aside, .docium-ribbon, .docium-topbar, .workspace-ai-panel, .docium-ruler {
        display: none !important;
      }
      .page-sheet {
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .docium-page-break {
        break-after: page !important;
        page-break-after: always !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }
    }
  `;

  styleEl.textContent = printCss;

  // Small delay to allow CSS calculation then trigger browser print
  setTimeout(() => {
    window.print();
  }, 100);
}

