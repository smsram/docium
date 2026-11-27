'use client';

import React, { useMemo, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Edit2, Trash2, Check } from 'lucide-react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    equation: {
      insertEquation: (attrs: { latex: string; displayMode?: boolean }) => ReturnType;
    };
  }
}

/**
 * Formats LaTeX expressions into mathematical Unicode fallback text (used for plain-text/DOCX fallback).
 */
export function formatMathExpression(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1) / ($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\sum/g, '∑')
    .replace(/\\prod/g, '∏')
    .replace(/\\int/g, '∫')
    .replace(/\\infty/g, '∞')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\Sigma/g, 'Σ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Omega/g, 'Ω')
    .replace(/\\pm/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\Rightarrow/g, '⇒')
    .replace(/\\partial/g, '∂')
    .replace(/\\nabla/g, '∇')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\^n\b/g, 'ⁿ');
}

export function renderLatexToHtml(latex: string, displayMode: boolean): { html: string; valid: boolean } {
  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'html',
    });
    return { html, valid: true };
  } catch {
    return { html: formatMathExpression(latex), valid: false };
  }
}

function EquationViewInner({
  node,
  updateAttributes,
  deleteNode,
  selected,
  inline,
}: NodeViewProps & { inline: boolean }) {
  const latex = String(node.attrs.latex || 'E = mc^2');
  const displayMode = !inline && Boolean(node.attrs.displayMode ?? true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);

  const rendered = useMemo(() => renderLatexToHtml(latex, displayMode), [latex, displayMode]);

  const commit = () => {
    updateAttributes({ latex: draft.trim() || latex });
    setEditing(false);
  };

  const WrapperTag = inline ? 'span' : 'div';

  return (
    <NodeViewWrapper
      as={WrapperTag}
      data-type={inline ? 'docium-inline-equation' : 'docium-equation'}
      data-latex={latex}
      style={
        inline
          ? { display: 'inline-block', verticalAlign: 'baseline', margin: '0 2px' }
          : { display: 'block', textAlign: 'center', margin: '6pt 0' }
      }
      className="relative group"
    >
      <span
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(latex);
          setEditing(true);
        }}
        style={{
          fontFamily: 'inherit',
          color: 'inherit',
        }}
        className={`relative inline-flex items-center rounded transition-colors ${
          editing
            ? 'bg-white px-2 py-1 border border-[#245c45] shadow-sm'
            : selected
            ? 'ring-1 ring-[#245c45] bg-[#245c45]/5 px-1'
            : 'hover:bg-black/4 px-0.5'
        }`}
        title="Double-click to edit LaTeX formula"
      >
        {editing ? (
          <span
            data-docium-ui-only="true"
            className="inline-flex items-center gap-1.5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                }
              }}
              autoFocus
              className="font-mono text-xs bg-white text-gray-900 border border-gray-300 rounded px-2 py-0.5 min-w-[180px] outline-none focus:border-[#245c45]"
            />
            <button
              type="button"
              onClick={commit}
              className="p-1 rounded bg-[#245c45] text-white cursor-pointer"
              title="Apply Formula"
            >
              <Check className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <span
            className="docium-katex-math select-text"
            style={{ fontFamily: 'inherit', color: 'inherit' }}
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />
        )}

        {selected && !editing && (
          <span
            data-docium-ui-only="true"
            contentEditable={false}
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-0.5 ml-1.5 pl-1 border-l border-gray-300 print:hidden"
          >
            <button
              type="button"
              onClick={() => {
                setDraft(latex);
                setEditing(true);
              }}
              className="p-0.5 rounded hover:bg-gray-200 text-gray-600 cursor-pointer"
              title="Edit LaTeX"
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteNode();
              }}
              className="p-0.5 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
              title="Delete Formula"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
      </span>
    </NodeViewWrapper>
  );
}

/** Inline LaTeX Formula Node — sits smoothly inside paragraphs alongside text */
export const InlineEquationNode = Node.create({
  name: 'inlineEquation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: 'E = mc^2' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="docium-inline-equation"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute('data-latex') || (el as HTMLElement).textContent || 'E = mc^2',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = String(HTMLAttributes.latex || 'E = mc^2');
    return [
      'span',
      mergeAttributes({
        'data-type': 'docium-inline-equation',
        'data-latex': latex,
        style: 'display: inline-block; margin: 0 2px;',
      }),
      formatMathExpression(latex),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <EquationViewInner {...props} inline />);
  },
});

/** Display / Block LaTeX Formula Node — centered on its own line like Microsoft Word equations */
export const EquationNode = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: { default: 'E = mc^2' },
      displayMode: { default: true },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="docium-equation"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute('data-latex') || (el as HTMLElement).textContent || 'E = mc^2',
          displayMode: (el as HTMLElement).getAttribute('data-display') !== 'false',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = String(HTMLAttributes.latex || 'E = mc^2');
    return [
      'div',
      mergeAttributes({
        'data-type': 'docium-equation',
        'data-latex': latex,
        style: 'text-align: center; margin: 6pt 0;',
      }),
      formatMathExpression(latex),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <EquationViewInner {...props} inline={false} />);
  },

  addCommands() {
    return {
      insertEquation:
        (attrs) =>
        ({ chain, state }) => {
          const isInline = attrs.displayMode === false;
          if (isInline) {
            return chain()
              .insertContent({
                type: 'inlineEquation',
                attrs: { latex: attrs.latex || 'E = mc^2' },
              })
              .run();
          }
          // Auto-choose inline if cursor is right inside non-empty paragraph text and displayMode wasn't explicitly forced
          const { $from } = state.selection;
          const inText =
            attrs.displayMode === undefined &&
            $from.parent.type.name === 'paragraph' &&
            $from.parent.textContent.trim().length > 0;
          if (inText) {
            return chain()
              .insertContent({
                type: 'inlineEquation',
                attrs: { latex: attrs.latex || 'E = mc^2' },
              })
              .run();
          }
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                latex: attrs.latex || 'E = mc^2',
                displayMode: true,
              },
            })
            .run();
        },
    };
  },
});
