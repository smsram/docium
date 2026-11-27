/**
 * Document Importer Utility
 * Parses incoming files (.docx via mammoth, .md, .html, .txt) into clean WYSIWYG HTML for Tiptap
 * while preserving Word headings, alignment, underline, strikethrough, quotes, tables, and lists.
 */

import mammoth from 'mammoth';
import { convertMarkdownToDocumentHtml, escapeHtml } from './markdownToHtml';

const DOCX_STYLE_MAP = [
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
  "p[style-name='Code'] => pre:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  'u => u',
  'strike => s',
  'b => strong',
  'i => em',
];

function injectDocxAlignmentStyles(html: string): string {
  // Mammoth supports custom transformDocument alignment annotations when mapped,
  // and we also normalize any align attributes into inline CSS text-align for Tiptap.
  return html
    .replace(/<(p|h[1-6])([^>]*)\salign="(center|right|justify|left)"([^>]*)>/gi, '<$1$2$4 style="text-align: $3;">')
    .replace(/<p>\s*<\/p>/gi, '<p></p>');
}

export async function parseImportedFile(file: File): Promise<{ title: string; html: string }> {
  const fileName = file.name;
  const title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: DOCX_STYLE_MAP,
        includeDefaultStyleMap: true,
      }
    );
    return {
      title,
      html: sanitizeImportedHtml(injectDocxAlignmentStyles(result.value || '<p></p>')),
    };
  }

  if (extension === 'html' || extension === 'htm') {
    const text = await file.text();
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = bodyMatch ? bodyMatch[1] : text;
    return { title, html: sanitizeImportedHtml(content) };
  }

  if (extension === 'md' || extension === 'markdown') {
    const text = await file.text();
    return { title, html: convertMarkdownToDocumentHtml(text) };
  }

  if (extension === 'txt') {
    const text = await file.text();
    const paragraphs = text
      .split(/\r?\n\r?\n/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
    return { title, html: paragraphs || '<p></p>' };
  }

  const text = await file.text();
  if (text.includes('<html') || text.includes('<body') || text.includes('<p')) {
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return { title, html: sanitizeImportedHtml(bodyMatch ? bodyMatch[1] : text) };
  }

  return {
    title,
    html: `<p>${escapeHtml(text.slice(0, 15000))}</p>`,
  };
}

function sanitizeImportedHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}
