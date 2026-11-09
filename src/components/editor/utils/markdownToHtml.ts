/**
 * Markdown to HTML Converter for DOCIUM Document Editor
 * Transforms Markdown and plain text into clean, canonical HTML for Tiptap & ProseMirror.
 * Correctly parses headings, paragraphs, lists, tables, callouts, blockquotes, and formatting marks.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInline(text: string): string {
  return text
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    // Strike
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * Checks whether text is already structured HTML (e.g. starts with <p>, <h1>, <div>, <table>).
 */
export function isHtmlContent(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith('<') &&
    (trimmed.startsWith('<p') ||
      trimmed.startsWith('<h1') ||
      trimmed.startsWith('<h2') ||
      trimmed.startsWith('<h3') ||
      trimmed.startsWith('<h4') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<table') ||
      trimmed.startsWith('<div') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.endsWith('>'))
  );
}

/**
 * Converts Markdown or mixed text into clean HTML that Tiptap ProseMirror can directly parse into nodes.
 */
export function convertMarkdownToDocumentHtml(mdOrHtml: string): string {
  if (!mdOrHtml || !mdOrHtml.trim()) {
    return '<p></p>';
  }

  const raw = mdOrHtml.trim();

  // If already full HTML, return as-is
  if (isHtmlContent(raw)) {
    return raw;
  }

  // Clean conversational AI prefixes if present (e.g., "Certainly! Here is the content:\n\n# ...")
  let clean = raw;
  const preambleMatch = clean.match(/^(?:Sure!|Certainly!|Here (?:is|are)|I'll|I have|Of course)[^\n]*\n+/i);
  if (preambleMatch && clean.length > preambleMatch[0].length + 15) {
    clean = clean.substring(preambleMatch[0].length).trim();
  }

  const lines = clean.split(/\r?\n/);
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Headings (# H1 to ###### H6)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = formatInline(escapeHtml(headingMatch[2].trim()));
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // 3. Page break or horizontal rule (--- or ***)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      htmlParts.push('<div data-type="page-break" class="docium-page-break"></div>');
      i++;
      continue;
    }

    // 4. Blockquote (> quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      const quoteContent = quoteLines.map((l) => formatInline(escapeHtml(l))).join(' ');
      htmlParts.push(`<blockquote><p>${quoteContent}</p></blockquote>`);
      continue;
    }

    // 5. Tables (| col 1 | col 2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .slice(1, -1)
          .split('|')
          .map((c) => formatInline(escapeHtml(c.trim())));

        // Check if line 1 is separator (e.g. |---|---|)
        const isSep = /^[:\s\-\|]+$/.test(tableLines[1]);
        const dataStartIndex = isSep ? 2 : 1;

        let tableHtml = '<table><thead><tr>';
        for (const h of headerCells) {
          tableHtml += `<th><p>${h}</p></th>`;
        }
        tableHtml += '</tr></thead><tbody>';

        for (let r = dataStartIndex; r < tableLines.length; r++) {
          const cells = tableLines[r]
            .slice(1, -1)
            .split('|')
            .map((c) => formatInline(escapeHtml(c.trim())));
          tableHtml += '<tr>';
          for (let c = 0; c < headerCells.length; c++) {
            const cellVal = cells[c] || '';
            tableHtml += `<td><p>${cellVal}</p></td>`;
          }
          tableHtml += '</tr>';
        }

        tableHtml += '</tbody></table>';
        htmlParts.push(tableHtml);
        continue;
      }
    }

    // 6. Unordered lists (- item, * item)
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(formatInline(escapeHtml(itemText)));
        i++;
      }
      htmlParts.push(`<ul>${items.map((it) => `<li><p>${it}</p></li>`).join('')}</ul>`);
      continue;
    }

    // 7. Ordered lists (1. item, 2. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(formatInline(escapeHtml(itemText)));
        i++;
      }
      htmlParts.push(`<ol>${items.map((it) => `<li><p>${it}</p></li>`).join('')}</ol>`);
      continue;
    }

    // 8. Regular paragraph (collect contiguous non-blank lines)
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      pLines.push(lines[i].trim());
      i++;
    }

    if (pLines.length > 0) {
      const pText = formatInline(escapeHtml(pLines.join(' ')));
      htmlParts.push(`<p>${pText}</p>`);
    }
  }

  return htmlParts.length > 0 ? htmlParts.join('') : `<p>${formatInline(escapeHtml(clean))}</p>`;
}

