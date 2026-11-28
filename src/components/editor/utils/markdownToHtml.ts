/**
 * Markdown to HTML Converter for DOCIUM Document Editor
 * Transforms Markdown and plain text into clean, canonical HTML for Tiptap & ProseMirror.
 * Preserves Word/Google Docs natural flow without injecting artificial mid-content page breaks.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInline(text: string): string {
  // Stash inline LaTeX ($...$ and \(...\)) before running Markdown italic/underscore rules
  const latexTokens: string[] = [];
  const stashLatex = (expr: string) => {
    const idx = latexTokens.length;
    const clean = expr.trim();
    latexTokens.push(
      `<span data-type="docium-inline-equation" data-latex="${escapeHtml(clean)}">${escapeHtml(clean)}</span>`
    );
    return `\u0000LATEX${idx}\u0000`;
  };

  let s = text
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner) => stashLatex(inner))
    .replace(/(?<!\\)\$(?!\d+(?:[.,]\d+)?(?:\s|$|[.,;!?)]))([^$\n]+?)\$/g, (_m, inner) => stashLatex(inner));

  s = s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return s.replace(/\u0000LATEX(\d+)\u0000/g, (_m, i) => latexTokens[Number(i)] || '');
}

/**
 * Converts pasted Markdown + LaTeX ($$...$$, \[...\], $...$, \(...\), **, *, #, lists, tables)
 * into rich WYSIWYG HTML with rendered LaTeX formula nodes.
 */
export function convertMarkdownAndLatexToHtml(rawInput: string): string {
  if (!rawInput || !rawInput.trim()) return '<p></p>';
  // Normalize block LaTeX delimiters ($$...$$ and \[...\]) onto isolated blocks before passing to Markdown parser
  const blockLatexTokens: string[] = [];
  const withStashedBlocks = rawInput
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner) => {
      const idx = blockLatexTokens.length;
      const clean = inner.trim();
      blockLatexTokens.push(
        `<div data-type="docium-equation" data-latex="${escapeHtml(clean)}">${escapeHtml(clean)}</div>`
      );
      return `\n\n__DOCIUM_BLOCK_LATEX_${idx}__\n\n`;
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => {
      const idx = blockLatexTokens.length;
      const clean = inner.trim();
      blockLatexTokens.push(
        `<div data-type="docium-equation" data-latex="${escapeHtml(clean)}">${escapeHtml(clean)}</div>`
      );
      return `\n\n__DOCIUM_BLOCK_LATEX_${idx}__\n\n`;
    });

  let html = convertMarkdownToDocumentHtml(withStashedBlocks);
  html = html.replace(/<p>__DOCIUM_BLOCK_LATEX_(\d+)__<\/p>|__DOCIUM_BLOCK_LATEX_(\d+)__/g, (_m, a, b) => {
    const idx = Number(a ?? b);
    return blockLatexTokens[idx] || '';
  });
  return html;
}

/**
 * Removes whitespace text nodes between HTML table structural tags (<table>, <thead>, <tbody>,
 * <tfoot>, <tr>, <th>, <td>) so ProseMirror's DOMParser never creates phantom blank rows or columns
 * when ingesting formatted/indented HTML tables.
 */
export function sanitizeTableHtmlWhitespace(html: string): string {
  if (!html || !/<table\b/i.test(html)) return html;
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (tableBlock) =>
    tableBlock
      .replace(/(<\/?(?:table|thead|tbody|tfoot|colgroup|col|tr)\b[^>]*>)\s+(?=<)/gi, '$1')
      .replace(/>\s+(<\/?(?:table|thead|tbody|tfoot|colgroup|col|tr|th|td)\b[^>]*>)/gi, '>$1')
      .replace(/(<(?:th|td)\b[^>]*>)\s+(?=<(?:p|div|ul|ol|h[1-6]|\/th|\/td)\b)/gi, '$1')
      .replace(/(<\/(?:p|div|ul|ol|h[1-6])>)\s+(<\/(?:th|td)>)/gi, '$1$2')
  );
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
      trimmed.startsWith('<h5') ||
      trimmed.startsWith('<h6') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<table') ||
      trimmed.startsWith('<div') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<hr') ||
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

  if (isHtmlContent(raw)) {
    return sanitizeTableHtmlWhitespace(raw);
  }

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

    // 2. Explicit Page Break token (\pagebreak, [PAGE_BREAK], <!-- pagebreak -->)
    if (/^(\\pagebreak|\\newpage|\[page[_\s-]?break\]|<!--\s*pagebreak\s*-->)$/i.test(trimmed)) {
      htmlParts.push('<div data-type="page-break" class="docium-page-break"></div>');
      i++;
      continue;
    }

    // 3. Fenced Code Block (```lang or ~~~lang)
    const codeFenceMatch = line.match(/^([ \t]*)(`{3,}|~{3,})([a-zA-Z0-9_+-]*)/);
    if (codeFenceMatch) {
      const fenceMarker = codeFenceMatch[2][0];
      const fenceLength = codeFenceMatch[2].length;
      const language = codeFenceMatch[3].trim() || 'plaintext';
      i++;

      const codeLines: string[] = [];
      const closeFencePattern = new RegExp(`^[ \\t]*${fenceMarker === '`' ? '`' : '~'}{${fenceLength},}[ \\t]*$`);

      while (i < lines.length) {
        if (closeFencePattern.test(lines[i])) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }

      const escapedCode = escapeHtml(codeLines.join('\n'));
      const langClass = language ? ` class="language-${escapeHtml(language)}"` : '';
      htmlParts.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
      continue;
    }

    // 4. Headings (# H1 to ###### H6)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      const text = formatInline(escapeHtml(headingMatch[2].trim()));
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // 5. Horizontal Rule (--- or *** or ___) -> real <hr>, NOT an unexpected page break!
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      htmlParts.push('<hr />');
      i++;
      continue;
    }

    // 6. Callout or Blockquote (> [!NOTE] or > quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }

      const firstLine = quoteLines[0] || '';
      const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|DANGER)\]\s*(.*)$/i);
      if (alertMatch) {
        const rawType = alertMatch[1].toUpperCase();
        const calloutType =
          rawType === 'TIP'
            ? 'tip'
            : rawType === 'WARNING'
            ? 'warning'
            : rawType === 'CAUTION' || rawType === 'DANGER'
            ? 'danger'
            : rawType === 'NOTE'
            ? 'note'
            : 'info';
        const restFirst = alertMatch[2].trim();
        const bodyLines = [restFirst, ...quoteLines.slice(1)].filter((l) => l.trim().length > 0);
        const innerHtml =
          bodyLines.length > 0
            ? bodyLines.map((l) => `<p>${formatInline(escapeHtml(l))}</p>`).join('')
            : '<p></p>';
        htmlParts.push(`<div data-type="callout" data-callout-type="${calloutType}">${innerHtml}</div>`);
      } else {
        const quoteContent = quoteLines
          .filter((l) => l.length > 0)
          .map((l) => `<p>${formatInline(escapeHtml(l))}</p>`)
          .join('');
        htmlParts.push(`<blockquote>${quoteContent || '<p></p>'}</blockquote>`);
      }
      continue;
    }

    // 7. Tables (| col 1 | col 2 |)
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

    // 8. Task lists (- [ ] item, - [x] item)
    if (/^[-*]\s+\[([ xX])\]\s+/.test(trimmed)) {
      const taskItems: { checked: boolean; text: string }[] = [];
      while (i < lines.length && /^[-*]\s+\[([ xX])\]\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
        if (m) {
          taskItems.push({
            checked: m[1].toLowerCase() === 'x',
            text: formatInline(escapeHtml(m[2])),
          });
        }
        i++;
      }
      htmlParts.push(
        `<ul data-type="taskList">${taskItems
          .map((it) => `<li data-type="taskItem" data-checked="${it.checked}"><p>${it.text}</p></li>`)
          .join('')}</ul>`
      );
      continue;
    }

    // 9. Unordered lists (- item, * item)
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim()) && !/^[-*]\s+\[([ xX])\]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(formatInline(escapeHtml(itemText)));
        i++;
      }
      htmlParts.push(`<ul>${items.map((it) => `<li><p>${it}</p></li>`).join('')}</ul>`);
      continue;
    }

    // 10. Ordered lists (1. item, 2. item)
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

    // 11. Regular paragraph
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('~~~') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^(\\pagebreak|\\newpage|\[page[_\s-]?break\]|<!--\s*pagebreak\s*-->)$/i.test(lines[i].trim())
    ) {
      pLines.push(lines[i].trim());
      i++;
    }

    if (pLines.length > 0) {
      const pText = formatInline(escapeHtml(pLines.join(' ')));
      htmlParts.push(`<p>${pText}</p>`);
    }
  }

  const out = htmlParts.length > 0 ? htmlParts.join('') : `<p>${formatInline(escapeHtml(clean))}</p>`;
  return sanitizeTableHtmlWhitespace(out);
}
