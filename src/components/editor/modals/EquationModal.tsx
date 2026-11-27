'use client';

import React, { useMemo, useState } from 'react';
import { X, Sigma, Check } from 'lucide-react';
import { formatMathExpression, renderLatexToHtml } from '../extensions/EquationNode';

interface EquationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertEquation: (latex: string, displayMode?: boolean) => void;
}

const EQUATION_TEMPLATES = [
  { label: 'Quadratic Formula', expr: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Pythagorean', expr: 'a^2 + b^2 = c^2' },
  { label: 'Mass-Energy', expr: 'E = mc^2' },
  { label: 'Integral', expr: '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)' },
  { label: 'Summation', expr: '\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\dots + x_n' },
  { label: 'Normal Dist.', expr: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}' },
  { label: 'Matrix 2×2', expr: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Limit', expr: '\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = e' },
];

const QUICK_MATH_TOKENS = [
  '\\pm', '\\times', '\\div', '\\sqrt{x}', '\\frac{a}{b}', '\\sum_{i=1}^{n}', '\\int_{a}^{b}', '\\infty',
  '\\alpha', '\\beta', '\\gamma', '\\Delta', '\\theta', '\\lambda', '\\mu', '\\pi', '\\sigma', '\\Omega',
  '\\leq', '\\geq', '\\neq', '\\approx', '\\rightarrow', '\\Rightarrow', 'x^{n}', 'x_{i}',
];

export function EquationModal({ isOpen, onClose, onInsertEquation }: EquationModalProps) {
  const [expr, setExpr] = useState('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
  const [displayMode, setDisplayMode] = useState<boolean>(false);

  const preview = useMemo(() => renderLatexToHtml(expr, displayMode), [expr, displayMode]);

  if (!isOpen) return null;

  return (
    <div
      data-docium-ui-only="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden text-xs text-[var(--text)]">
        <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Sigma className="h-4 w-4 text-[var(--primary)]" />
            <span>Insert LaTeX Equation</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--accent)] cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Placement Mode: Inline inside paragraph vs Display centered */}
          <div className="flex items-center justify-between">
            <span className="font-semibold">Placement Style</span>
            <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
              <button
                type="button"
                onClick={() => setDisplayMode(false)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                  !displayMode ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Inline (with text)
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode(true)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                  displayMode ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Centered Block
              </button>
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1.5">Common Templates</label>
            <div className="flex flex-wrap gap-1.5">
              {EQUATION_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setExpr(t.expr)}
                  className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] hover:border-[var(--primary)] transition-colors cursor-pointer text-[11px]"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1.5">LaTeX Symbols & Operators</label>
            <div className="flex flex-wrap gap-1">
              {QUICK_MATH_TOKENS.map((tok) => (
                <button
                  key={tok}
                  type="button"
                  onClick={() => setExpr((prev) => (prev ? `${prev} ${tok}` : tok))}
                  className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] font-serif text-xs cursor-pointer"
                  title={tok}
                >
                  {formatMathExpression(tok)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">LaTeX Expression</label>
            <textarea
              rows={2}
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="e.g. \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)] resize-none"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-[#171c19] min-h-[72px] flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1.5">
              Live Preview
            </span>
            <div
              className="docium-katex-math"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3 bg-[var(--surface-elevated)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--accent)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (expr.trim()) {
                onInsertEquation(expr.trim(), displayMode);
                onClose();
              }
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-4 py-1.5 font-semibold hover:bg-[var(--primary-hover)] cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            Insert Formula
          </button>
        </div>
      </div>
    </div>
  );
}
