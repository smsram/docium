'use client';

import React from 'react';
import { type Editor } from '@tiptap/react';
import {
  ListTree,
  BookOpen,
  FileText,
  Bookmark,
  Subscript as FootnoteIcon,
  FileSpreadsheet,
  Link2,
} from 'lucide-react';
import { DocumentCitation } from '@/lib/types';

interface ReferencesTabProps {
  editor: Editor | null;
  citations: DocumentCitation[];
  onOpenCitationModal: () => void;
}

export function ReferencesTab({
  editor,
  citations,
  onOpenCitationModal,
}: ReferencesTabProps) {
  if (!editor) return null;

  // Insert Table of Contents block generated from document headings
  const handleInsertTableOfContents = () => {
    const headings: { text: string; level: number; id: string }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const text = node.textContent.trim();
        if (text) {
          headings.push({
            text,
            level: node.attrs.level || 1,
            id: `heading-${pos}`,
          });
        }
      }
    });

    if (headings.length === 0) {
      alert('No headings found. Add some Heading 1 or Heading 2 sections first!');
      return;
    }

    let tocHtml = `
      <div class="toc-container my-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 not-prose">
        <h3 class="text-sm font-bold text-[var(--primary)] uppercase tracking-wider mb-3">Table of Contents</h3>
        <ul class="space-y-1.5 text-xs text-[var(--text)]">
    `;

    headings.forEach((h) => {
      const indentClass =
        h.level === 1
          ? 'font-semibold'
          : h.level === 2
          ? 'pl-4 text-[var(--text)]'
          : 'pl-8 text-[var(--text-muted)]';
      tocHtml += `
        <li class="${indentClass} flex items-center justify-between hover:text-[var(--primary)]">
          <span>${h.text}</span>
          <span class="border-b border-dotted border-[var(--border)] flex-1 mx-2"></span>
          <span class="font-mono text-[10px] text-[var(--text-muted)]">§</span>
        </li>
      `;
    });

    tocHtml += `</ul></div><p></p>`;
    editor.chain().focus().insertContent(tocHtml).run();
  };

  // Insert Bibliography from stored citations
  const handleInsertBibliography = () => {
    if (citations.length === 0) {
      alert('No citations added yet. Click "Add Citation" first to record references.');
      return;
    }

    let bibHtml = `
      <div class="bibliography-container my-6 pt-4 border-t-2 border-[var(--border)]">
        <h2 class="text-base font-bold text-[var(--primary)] mb-3">References & Bibliography</h2>
        <ol class="list-decimal pl-5 space-y-2 text-xs text-[var(--text)]">
    `;

    citations.forEach((cit) => {
      const yearStr = cit.year ? ` (${cit.year}).` : '';
      const pubStr = cit.publisher ? ` ${cit.publisher}.` : '';
      const urlStr = cit.url
        ? ` <a href="${cit.url}" target="_blank" class="text-[var(--primary)] underline font-mono text-[11px]">${cit.url}</a>`
        : '';
      bibHtml += `<li><strong>${cit.author}</strong>${yearStr} <em>${cit.title}</em>.${pubStr}${urlStr}</li>`;
    });

    bibHtml += `</ol></div><p></p>`;
    editor.chain().focus().insertContent(bibHtml).run();
  };

  const handleInsertFootnote = () => {
    const noteText = prompt('Enter footnote text:');
    if (noteText) {
      editor
        .chain()
        .focus()
        .insertContent(`<sup>[<span title="${noteText}">*</span>]</sup> `)
        .run();
    }
  };

  const handleInsertEndnote = () => {
    const noteText = prompt('Enter endnote text:');
    if (noteText) {
      editor
        .chain()
        .focus()
        .insertContent(`<sup>[i]</sup> `)
        .run();
      // Append note at document bottom
      editor
        .chain()
        .focus()
        .insertContentAt(editor.state.doc.content.size, `<p class="text-[11px] text-[var(--text-muted)] mt-4"><em>[i] ${noteText}</em></p>`)
        .run();
    }
  };

  const handleInsertCaption = () => {
    const caption = prompt('Enter figure or table caption:');
    if (caption) {
      editor
        .chain()
        .focus()
        .insertContent(`<p class="text-center text-[11px] italic text-[var(--text-muted)] my-1">Figure: ${caption}</p>`)
        .run();
    }
  };

  const handleInsertCrossReference = () => {
    const refText = prompt('Enter cross-reference label (e.g. "See Section 2.1"):', 'See Section 1');
    if (refText) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="#" class="text-[var(--primary)] font-medium underline">${refText}</a> `)
        .run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Table of Contents */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={handleInsertTableOfContents}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Insert Table of Contents generated from headings"
        >
          <ListTree className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Table of Contents</span>
        </button>
      </div>

      {/* 2. Footnotes & Endnotes */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={handleInsertFootnote}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Insert Footnote at cursor"
        >
          <FootnoteIcon className="h-3.5 w-3.5 text-[var(--secondary)]" />
          <span>Footnote</span>
        </button>

        <button
          type="button"
          onClick={handleInsertEndnote}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Insert Endnote at document end"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 opacity-70" />
          <span>Endnote</span>
        </button>
      </div>

      {/* 3. Citations & Bibliography */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={onOpenCitationModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Add new Citation"
        >
          <BookOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Add Citation</span>
        </button>

        <button
          type="button"
          onClick={handleInsertBibliography}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Insert formatted Bibliography list"
        >
          <Bookmark className="h-3.5 w-3.5 opacity-70" />
          <span>Bibliography ({citations.length})</span>
        </button>
      </div>

      {/* 4. Captions & Cross-References */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleInsertCaption}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Insert Figure / Table Caption"
        >
          <FileText className="h-3.5 w-3.5 opacity-60" />
          <span>Caption</span>
        </button>

        <button
          type="button"
          onClick={handleInsertCrossReference}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="Insert Cross-Reference"
        >
          <Link2 className="h-3.5 w-3.5 opacity-60" />
          <span>Cross-Ref</span>
        </button>
      </div>
    </div>
  );
}
