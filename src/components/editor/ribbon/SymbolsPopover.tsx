'use client';

import React from 'react';
import { type Editor } from '@tiptap/react';

interface SymbolsPopoverProps {
  editor: Editor | null;
  onClose: () => void;
}

const SYMBOLS = [
  '©', '®', '™', '°', '±', '≠', '≈', '≤', '≥', '÷', '×', '∑', '√', '∞', 'π',
  '€', '£', '¥', '₹', '¢', '§', '¶', '•', '—', '–', '…', '‰', 'µ', 'Ω', 'α',
  'β', 'γ', 'δ', 'θ', 'λ', 'σ', 'ω', '←', '→', '↑', '↓', '↔', '⇒', '⇔', '✓',
  '✗', '★', '♥', '♦', '♣', '♠', '½', '¼', '¾', '¹', '²', '³', '€', '™', '℠'
];

export function SymbolsPopover({ editor, onClose }: SymbolsPopoverProps) {
  if (!editor) return null;

  const handleInsert = (sym: string) => {
    editor.chain().focus().insertContent(sym).run();
    onClose();
  };

  return (
    <div className="w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl z-[120] text-xs select-none animate-in fade-in zoom-in-95 duration-100">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
        <span className="font-semibold text-xs text-[var(--text)]">Special Characters & Symbols</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto p-1">
        {SYMBOLS.map((sym, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleInsert(sym)}
            className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--primary-light)] hover:text-[var(--primary)] hover:border-[var(--primary)] text-sm font-medium flex items-center justify-center transition-all"
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
}

