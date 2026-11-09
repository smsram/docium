/**
 * Document Importer Utility
 * Parses incoming files (.docx, .md, .html, .txt) into clean HTML for Tiptap
 */

export async function parseImportedFile(file: File): Promise<{ title: string; html: string }> {
  const fileName = file.name;
  const title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'html' || extension === 'htm') {
    const text = await file.text();
    // Extract body content if present
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = bodyMatch ? bodyMatch[1] : text;
    return { title, html: sanitizeImportedHtml(content) };
  }

  if (extension === 'md' || extension === 'markdown') {
    const text = await file.text();
    return { title, html: markdownToHtml(text) };
  }

  if (extension === 'txt') {
    const text = await file.text();
    const paragraphs = text
      .split(/\r?\n\r?\n/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
    return { title, html: paragraphs || '<p></p>' };
  }

  // Fallback for doc/docx or binary files: read as text or strip XML tags if Word XML
  const text = await file.text();
  if (text.includes('<w:p') || text.includes('<html')) {
    return { title, html: sanitizeImportedHtml(text) };
  }

  return {
    title,
    html: `<p>${escapeHtml(text.slice(0, 10000))}</p>`,
  };
}

function markdownToHtml(md: string): string {
  return md
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('# ')) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith('### ')) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith('#### ')) return `<h4>${escapeHtml(trimmed.slice(5))}</h4>`;
      if (trimmed.startsWith('> ')) return `<blockquote>${escapeHtml(trimmed.slice(2))}</blockquote>`;
      if (trimmed.startsWith('---') || trimmed.startsWith('***')) {
        return `<div data-type="page-break" class="docium-page-break"></div>`;
      }
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const items = trimmed
          .split(/\r?\n/)
          .map((line) => `<li>${escapeHtml(line.replace(/^[-*]\s*/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      if (/^\d+\.\s/.test(trimmed)) {
        const items = trimmed
          .split(/\r?\n/)
          .map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s*/, ''))}</li>`)
          .join('');
        return `<ol>${items}</ol>`;
      }
      // Inline styling replacement
      const formatted = escapeHtml(trimmed)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      return `<p>${formatted}</p>`;
    })
    .join('');
}

function sanitizeImportedHtml(html: string): string {
  // Strip out head, script, style, comments
  const clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  return clean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

