'use client';

import React, { useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Trash2, Palette } from 'lucide-react';

const CODE_THEMES = [
  { label: 'Slate Light', bg: '#f4f6f4', color: '#171c19', border: '#dce2da' },
  { label: 'Forest Mint', bg: '#eaf2ed', color: '#133a2b', border: '#b7d4c4' },
  { label: 'Midnight', bg: '#1e293b', color: '#e2e8f0', border: '#334155' },
  { label: 'Warm Sand', bg: '#fdfbf3', color: '#3b2f1e', border: '#e6dcc3' },
];

const LANGUAGES = [
  '', 'javascript', 'typescript', 'python', 'html', 'css', 'json', 'bash', 'sql', 'java', 'cpp', 'plaintext',
];

function CodeBlockNodeView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [focusedInside, setFocusedInside] = useState(false);

  const language = String(node.attrs.language || '');
  const bg = String(node.attrs.backgroundColor || '#f4f6f4');
  const color = String(node.attrs.textColor || '#171c19');
  const borderColor = String(node.attrs.borderColor || '#dce2da');

  const showControls = selected || focusedInside;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos === 'number' && editor && !editor.isDestroyed) {
      editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
      return;
    }
    deleteNode();
  };

  return (
    <NodeViewWrapper
      as="div"
      data-type="docium-codeblock"
      onFocus={() => setFocusedInside(true)}
      onBlur={(e: React.FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) {
          setFocusedInside(false);
        }
      }}
      style={{
        backgroundColor: bg,
        color,
        borderColor,
        zIndex: showControls ? 40 : undefined,
      }}
      className={`relative rounded-md border my-2.5 transition-shadow ${
        showControls ? 'ring-2 ring-[#245c45] shadow-sm' : ''
      }`}
    >
      {/* Floating Format Toolbar — shown ONLY when clicked/focused, never taking layout space */}
      <div
        data-codeblock-ui="true"
        data-docium-ui-only="true"
        contentEditable={false}
        onMouseDown={(e) => e.preventDefault()}
        className={`absolute -top-9 left-0 z-50 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-xl text-[10px] text-gray-700 select-none whitespace-nowrap print:hidden ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium outline-none cursor-pointer"
          title="Code Language"
        >
          <option value="">Language...</option>
          {LANGUAGES.filter(Boolean).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <div className="h-3.5 w-px bg-gray-200" />

        {CODE_THEMES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() =>
              updateAttributes({
                backgroundColor: t.bg,
                textColor: t.color,
                borderColor: t.border,
              })
            }
            style={{ backgroundColor: t.bg, borderColor: t.border }}
            className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${
              bg.toLowerCase() === t.bg.toLowerCase() ? 'ring-2 ring-[#245c45]' : ''
            }`}
            title={`Theme: ${t.label}`}
          />
        ))}

        <label
          className="inline-flex items-center justify-center w-4 h-4 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer ml-0.5"
          title="Custom Background Color"
        >
          <Palette className="w-2.5 h-2.5 text-gray-700" />
          <input
            type="color"
            value={bg.startsWith('#') ? bg : '#f4f6f4'}
            onChange={(e) => updateAttributes({ backgroundColor: e.target.value })}
            className="sr-only"
          />
        </label>
        <label
          className="inline-flex items-center justify-center w-4 h-4 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer text-[9px] font-bold"
          title="Custom Text Color"
        >
          A
          <input
            type="color"
            value={color.startsWith('#') ? color : '#171c19'}
            onChange={(e) => updateAttributes({ textColor: e.target.value })}
            className="sr-only"
          />
        </label>

        <div className="h-3.5 w-px bg-gray-200" />

        <button
          type="button"
          onMouseDown={handleDelete}
          className="p-0.5 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
          title="Delete Code Block"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <pre
        style={{
          backgroundColor: 'transparent',
          color,
          border: 'none',
          margin: 0,
        }}
        className="p-3 font-mono text-[9.5pt] leading-[1.45] overflow-x-auto whitespace-pre-wrap"
      >
        <NodeViewContent className={language ? `language-${language}` : undefined} />
      </pre>
    </NodeViewWrapper>
  );
}

export const CustomCodeBlock = Node.create({
  name: 'codeBlock',
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: { default: '' },
      backgroundColor: { default: '#f4f6f4' },
      textColor: { default: '#171c19' },
      borderColor: { default: '#dce2da' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (el) => {
          const dom = el as HTMLElement;
          const codeEl = dom.querySelector('code');
          const cls = codeEl?.className || dom.className || '';
          const langMatch = cls.match(/language-([a-z0-9_-]+)/i);
          return {
            language: dom.getAttribute('data-language') || (langMatch ? langMatch[1] : ''),
            backgroundColor: dom.getAttribute('data-bg') || dom.style.backgroundColor || '#f4f6f4',
            textColor: dom.getAttribute('data-color') || dom.style.color || '#171c19',
            borderColor: dom.getAttribute('data-border-color') || '#dce2da',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const bg = HTMLAttributes.backgroundColor || '#f4f6f4';
    const color = HTMLAttributes.textColor || '#171c19';
    const borderColor = HTMLAttributes.borderColor || '#dce2da';
    const lang = HTMLAttributes.language || '';
    return [
      'pre',
      mergeAttributes({
        ...(lang ? { 'data-language': lang } : {}),
        'data-bg': bg,
        'data-color': color,
        'data-border-color': borderColor,
        style: `background-color: ${bg}; color: ${color}; border: 1px solid ${borderColor}; border-radius: 4px; padding: 8pt 10pt; margin: 8pt 0;`,
      }),
      ['code', lang ? { class: `language-${lang}` } : {}, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest('[data-codeblock-ui="true"]'));
      },
    });
  },

  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.setNode(this.name, attributes),
      toggleCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph', attributes),
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
    };
  },
});
