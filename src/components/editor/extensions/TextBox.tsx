'use client';

import React, { useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  Maximize2,
  Trash2,
  Palette,
} from 'lucide-react';

export type TextBoxAlign = 'full' | 'left' | 'center' | 'right' | 'float-left' | 'float-right';

export interface TextBoxAttributes {
  width: number; // px (0 = 100% full width)
  minHeight: number;
  fill: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  borderRadius: number;
  padding: number;
  alignment: TextBoxAlign;
  shadow: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textBox: {
      insertTextBox: (attributes?: Partial<TextBoxAttributes> & { contentHtml?: string }) => ReturnType;
      updateTextBox: (attributes: Partial<TextBoxAttributes>) => ReturnType;
    };
  }
}

const BOX_FILL_SWATCHES = ['#FFFFFF', '#F8FAFC', '#EAF2ED', '#EFF6FF', '#FFFBEB', '#FFF1F2', 'transparent'];
const BOX_BORDER_SWATCHES = ['#245C45', '#CBD5E1', '#3B82F6', '#F59E0B', '#171C19'];

function TextBoxNodeView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [isFocusedInside, setIsFocusedInside] = useState(false);

  const width = Number(node.attrs.width ?? 0);
  const minHeight = Number(node.attrs.minHeight ?? 64);
  const fill = String(node.attrs.fill || '#FFFFFF');
  const textColor = String(node.attrs.textColor || '#171C19');
  const borderColor = String(node.attrs.borderColor || '#245C45');
  const borderWidth = Number(node.attrs.borderWidth ?? 1);
  const borderStyle = (node.attrs.borderStyle || 'solid') as TextBoxAttributes['borderStyle'];
  const borderRadius = Number(node.attrs.borderRadius ?? 4);
  const padding = Number(node.attrs.padding ?? 12);
  const alignment = (node.attrs.alignment || 'full') as TextBoxAlign;
  const shadow = Boolean(node.attrs.shadow);

  const showControls = selected || isFocusedInside;

  const handleDeleteBox = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos === 'number' && editor && !editor.isDestroyed) {
        editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
        return;
      }
      deleteNode();
    } catch {
      deleteNode();
    }
  };

  const startResize = (mode: 'e' | 's' | 'se', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const boxEl = (e.currentTarget as HTMLElement).parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = width > 0 ? width : boxEl?.offsetWidth || 320;
    const origH = boxEl?.offsetHeight || minHeight;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const patch: Partial<TextBoxAttributes> = {};
      if (mode === 'e' || mode === 'se') {
        patch.width = Math.max(120, Math.min(680, Math.round(origW + dx)));
      }
      if (mode === 's' || mode === 'se') {
        patch.minHeight = Math.max(40, Math.round(origH + dy));
      }
      updateAttributes(patch);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const outerStyle: React.CSSProperties =
    alignment === 'float-left'
      ? { float: 'left', marginRight: '16px', marginBottom: '10px', marginTop: '4px', zIndex: 15 }
      : alignment === 'float-right'
      ? { float: 'right', marginLeft: '16px', marginBottom: '10px', marginTop: '4px', zIndex: 15 }
      : {
          display: 'flex',
          justifyContent:
            alignment === 'left'
              ? 'flex-start'
              : alignment === 'right'
              ? 'flex-end'
              : alignment === 'center'
              ? 'center'
              : 'stretch',
          margin: '8pt 0',
        };

  const boxStyle: React.CSSProperties = {
    width: width > 0 ? `${width}px` : '100%',
    minHeight: `${minHeight}px`,
    backgroundColor: fill === 'transparent' ? 'transparent' : fill,
    color: textColor,
    border:
      borderStyle === 'none' || borderWidth === 0
        ? '1px dashed rgba(148,163,184,0.45)'
        : `${borderWidth}px ${borderStyle} ${borderColor}`,
    borderRadius: `${borderRadius}px`,
    padding: `${padding}px`,
    boxShadow: shadow ? '0 4px 12px rgba(0,0,0,0.08)' : undefined,
    boxSizing: 'border-box',
  };

  return (
    <NodeViewWrapper
      as="div"
      data-type="docium-textbox"
      style={{
        ...outerStyle,
        zIndex: showControls ? 40 : outerStyle.zIndex,
      }}
      onFocus={() => setIsFocusedInside(true)}
      onBlur={(e: React.FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) {
          setIsFocusedInside(false);
        }
      }}
      className="docium-textbox-wrapper relative"
    >
      <div
        style={boxStyle}
        className={`relative transition-shadow ${
          showControls ? 'ring-2 ring-[#245c45]' : ''
        }`}
      >
        {/* Contextual Text Box Format Toolbar — visible ONLY when clicked/selected */}
        <div
          data-textbox-ui="true"
          data-docium-ui-only="true"
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
          className={`absolute -top-10 left-0 z-50 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-xl text-[10px] text-gray-700 select-none whitespace-nowrap print:hidden ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <span className="font-semibold text-[#245c45] pr-1 border-r border-gray-200">Text Box</span>

          {/* Fill presets + custom color */}
          <div className="flex items-center gap-0.5 pr-1 border-r border-gray-200">
            {BOX_FILL_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateAttributes({ fill: c })}
                style={{
                  backgroundColor: c === 'transparent' ? '#fff' : c,
                  backgroundImage:
                    c === 'transparent'
                      ? 'linear-gradient(45deg, #ef4444 45%, transparent 45%, transparent 55%, #ef4444 55%)'
                      : undefined,
                }}
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${
                  fill === c ? 'ring-2 ring-[#245c45]' : 'border-gray-300'
                }`}
                title={c === 'transparent' ? 'Transparent Fill' : `Fill ${c}`}
              />
            ))}
            <label
              className="inline-flex items-center justify-center w-4 h-4 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer ml-0.5"
              title="Custom Fill Color"
            >
              <Palette className="w-2.5 h-2.5 text-gray-700" />
              <input
                type="color"
                value={fill.startsWith('#') ? fill : '#FFFFFF'}
                onChange={(e) => updateAttributes({ fill: e.target.value })}
                className="sr-only"
              />
            </label>
          </div>

          {/* Border color & style & padding */}
          <div className="flex items-center gap-0.5 pr-1 border-r border-gray-200">
            {BOX_BORDER_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  updateAttributes({ borderColor: c, borderStyle: borderStyle === 'none' ? 'solid' : borderStyle })
                }
                style={{ backgroundColor: c }}
                className={`w-3 h-3 rounded-xs border cursor-pointer ${
                  borderColor === c && borderStyle !== 'none' ? 'ring-2 ring-[#245c45]' : 'border-gray-300'
                }`}
                title={`Border ${c}`}
              />
            ))}
            <select
              value={borderStyle}
              onChange={(e) => updateAttributes({ borderStyle: e.target.value as TextBoxAttributes['borderStyle'] })}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[10px] border border-gray-200 rounded px-1 py-0.2 bg-gray-50 cursor-pointer"
              title="Border Style"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="double">Double</option>
              <option value="none">No Border</option>
            </select>
            <select
              value={String(borderRadius)}
              onChange={(e) => updateAttributes({ borderRadius: Number(e.target.value) })}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[10px] border border-gray-200 rounded px-1 py-0.2 bg-gray-50 cursor-pointer"
              title="Corner Radius"
            >
              <option value="0">Sharp</option>
              <option value="4">Soft</option>
              <option value="12">Round</option>
            </select>
            <button
              type="button"
              onClick={() => updateAttributes({ shadow: !shadow })}
              className={`px-1 py-0.5 rounded border cursor-pointer ${
                shadow ? 'bg-[#eaf2ed] border-[#245c45] text-[#245c45]' : 'border-gray-200 hover:bg-gray-100'
              }`}
              title="Toggle Drop Shadow"
            >
              Shadow
            </button>
          </div>

          {/* Position / Text Wrap */}
          <button
            type="button"
            onClick={() => updateAttributes({ width: 0, alignment: 'full' })}
            className={`p-1 rounded cursor-pointer ${alignment === 'full' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
            title="Full Width"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => updateAttributes({ width: width || 260, alignment: 'left' })}
            className={`p-1 rounded cursor-pointer ${alignment === 'left' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
            title="Align Left"
          >
            <AlignLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => updateAttributes({ width: width || 320, alignment: 'center' })}
            className={`p-1 rounded cursor-pointer ${alignment === 'center' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
            title="Align Center"
          >
            <AlignCenter className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => updateAttributes({ width: width || 260, alignment: 'right' })}
            className={`p-1 rounded cursor-pointer ${alignment === 'right' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
            title="Align Right"
          >
            <AlignRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() =>
              updateAttributes({
                width: width || 240,
                alignment: alignment === 'float-left' ? 'float-right' : 'float-left',
              })
            }
            className={`p-1 rounded cursor-pointer ${alignment.startsWith('float-') ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
            title="Float Wrap Text"
          >
            <WrapText className="h-3 w-3" />
          </button>

          <button
            type="button"
            onMouseDown={handleDeleteBox}
            className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
            title="Delete Text Box"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Stable Dedicated ProseMirror Content Mount */}
        <NodeViewContent className="docium-textbox-content outline-none" />

        {/* Interactive Drag-Resize Handles (always mounted, visibility controlled via CSS) */}
        <div
          data-textbox-ui="true"
          data-docium-ui-only="true"
          contentEditable={false}
          onMouseDown={(e) => startResize('e', e)}
          className={`absolute top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-5 bg-white border-2 border-[#245c45] rounded-xs cursor-ew-resize z-30 print:hidden ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          title="Drag to resize width"
        />
        <div
          data-textbox-ui="true"
          data-docium-ui-only="true"
          contentEditable={false}
          onMouseDown={(e) => startResize('s', e)}
          className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-ns-resize z-30 print:hidden ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          title="Drag to resize height"
        />
        <div
          data-textbox-ui="true"
          data-docium-ui-only="true"
          contentEditable={false}
          onMouseDown={(e) => startResize('se', e)}
          className={`absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#245c45] border border-white rounded-xs cursor-nwse-resize z-30 print:hidden ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          title="Drag to resize Text Box"
        />
      </div>
    </NodeViewWrapper>
  );
}

export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      width: { default: 0 },
      minHeight: { default: 64 },
      fill: { default: '#FFFFFF' },
      textColor: { default: '#171C19' },
      borderColor: { default: '#245C45' },
      borderWidth: { default: 1 },
      borderStyle: { default: 'solid' },
      borderRadius: { default: 4 },
      padding: { default: 12 },
      alignment: { default: 'full' },
      shadow: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="docium-textbox"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            width: parseInt(el.getAttribute('data-width') || '0', 10),
            minHeight: parseInt(el.getAttribute('data-min-height') || '64', 10),
            fill: el.getAttribute('data-fill') || '#FFFFFF',
            textColor: el.getAttribute('data-text-color') || '#171C19',
            borderColor: el.getAttribute('data-border-color') || '#245C45',
            borderWidth: parseInt(el.getAttribute('data-border-width') || '1', 10),
            borderStyle: el.getAttribute('data-border-style') || 'solid',
            borderRadius: parseInt(el.getAttribute('data-border-radius') || '4', 10),
            padding: parseInt(el.getAttribute('data-padding') || '12', 10),
            alignment: el.getAttribute('data-alignment') || 'full',
            shadow: el.getAttribute('data-shadow') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const width = HTMLAttributes.width || 0;
    const minHeight = HTMLAttributes.minHeight || 64;
    const fill = HTMLAttributes.fill || '#FFFFFF';
    const textColor = HTMLAttributes.textColor || '#171C19';
    const borderColor = HTMLAttributes.borderColor || '#245C45';
    const borderWidth = HTMLAttributes.borderWidth ?? 1;
    const borderStyle = HTMLAttributes.borderStyle || 'solid';
    const borderRadius = HTMLAttributes.borderRadius ?? 4;
    const padding = HTMLAttributes.padding ?? 12;
    const alignment = HTMLAttributes.alignment || 'full';
    const shadow = Boolean(HTMLAttributes.shadow);

    const borderCss = borderStyle === 'none' ? 'none' : `${borderWidth}px ${borderStyle} ${borderColor}`;
    const widthCss = width > 0 ? `${width}px` : '100%';

    return [
      'div',
      mergeAttributes({
        'data-type': 'docium-textbox',
        'data-width': width,
        'data-min-height': minHeight,
        'data-fill': fill,
        'data-text-color': textColor,
        'data-border-color': borderColor,
        'data-border-width': borderWidth,
        'data-border-style': borderStyle,
        'data-border-radius': borderRadius,
        'data-padding': padding,
        'data-alignment': alignment,
        'data-shadow': String(shadow),
        style: `width: ${widthCss}; min-height: ${minHeight}px; background-color: ${fill}; color: ${textColor}; border: ${borderCss}; border-radius: ${borderRadius}px; padding: ${padding}px; margin: 8pt 0; box-sizing: border-box;`,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TextBoxNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest('[data-textbox-ui="true"]'));
      },
    });
  },

  addCommands() {
    return {
      insertTextBox:
        (attributes = {}) =>
        ({ chain }) => {
          const { contentHtml, ...boxAttrs } = attributes;
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                width: boxAttrs.width ?? 0,
                minHeight: boxAttrs.minHeight ?? 64,
                fill: boxAttrs.fill ?? '#F8FAF9',
                textColor: boxAttrs.textColor ?? '#171C19',
                borderColor: boxAttrs.borderColor ?? '#245C45',
                borderWidth: boxAttrs.borderWidth ?? 1,
                borderStyle: boxAttrs.borderStyle ?? 'solid',
                borderRadius: boxAttrs.borderRadius ?? 4,
                padding: boxAttrs.padding ?? 12,
                alignment: boxAttrs.alignment ?? 'full',
                shadow: boxAttrs.shadow ?? false,
              },
              content: [
                {
                  type: 'paragraph',
                  content: contentHtml
                    ? [{ type: 'text', text: contentHtml }]
                    : [{ type: 'text', text: 'Type inside text box...' }],
                },
              ],
            })
            .run();
        },
      updateTextBox:
        (attributes) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, attributes);
        },
    };
  },
});
