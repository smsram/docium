/**
 * DOCX & Document Exporter Utility
 * Generates Microsoft Word compatible document format preserving styles, tables, headings, and margins.
 */

export function exportToDocx(title: string, htmlContent: string) {
  // Build a Word-compatible HTML document with WordprocessingML styling namespaces
  const cleanTitle = title || 'Untitled Document';

  const docTemplate = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${cleanTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 210mm 297mm;
      margin: 25.4mm 25.4mm 25.4mm 25.4mm;
      mso-header-margin: 12.7mm;
      mso-footer-margin: 12.7mm;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #171c19;
    }
    h1 {
      font-size: 20pt;
      font-weight: bold;
      color: #245c45;
      margin-top: 18pt;
      margin-bottom: 6pt;
    }
    h2 {
      font-size: 15pt;
      font-weight: bold;
      color: #398568;
      margin-top: 14pt;
      margin-bottom: 4pt;
    }
    h3 {
      font-size: 12.5pt;
      font-weight: bold;
      color: #171c19;
      margin-top: 10pt;
      margin-bottom: 2pt;
    }
    p {
      margin: 0 0 6pt 0;
    }
    blockquote {
      border-left: 3pt solid #245c45;
      padding-left: 10pt;
      margin-left: 0;
      color: #555;
      font-style: italic;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12pt 0;
    }
    th, td {
      border: 1px solid #d0d7d0;
      padding: 6pt 8pt;
      text-align: left;
    }
    th {
      background-color: #f7f7f2;
      font-weight: bold;
    }
    code {
      font-family: 'Consolas', 'Courier New', monospace;
      background-color: #f1f3f0;
      padding: 1pt 3pt;
      font-size: 9.5pt;
    }
    .docium-page-break {
      page-break-before: always;
      mso-break-type: page-break;
    }
  </style>
</head>
<body>
  <div class="Section1">
    ${htmlContent}
  </div>
</body>
</html>
`;

  const blob = new Blob(['\ufeff', docTemplate], {
    type: 'application/msword;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = `${cleanTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.doc`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
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
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 840px;
      margin: 40px auto;
      padding: 0 24px;
      color: #171c19;
      background: #ffffff;
    }
    h1, h2, h3, h4 { color: #245c45; }
    blockquote {
      border-left: 3px solid #245c45;
      padding-left: 16px;
      margin: 16px 0;
      color: #666;
      font-style: italic;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #e7eae4;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #f7f7f2;
      font-weight: 600;
    }
    code {
      font-family: monospace;
      background: #f1f3f0;
      padding: 2px 5px;
      border-radius: 4px;
    }
    .docium-page-break {
      page-break-after: always;
      border-bottom: 2px dashed #ccc;
      margin: 30px 0;
    }
    @media print {
      .docium-page-break { border: none; }
    }
  </style>
</head>
<body>
  ${htmlContent}
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

