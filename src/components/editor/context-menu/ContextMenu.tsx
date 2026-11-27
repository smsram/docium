'use client';

import React, { useEffect, useRef, useState, useLayoutEffect, useSyncExternalStore, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { type Editor } from '@tiptap/react';
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Link2,
  MessageSquarePlus,
  Sparkles,
  RemoveFormatting,
  Rows,
  Columns,
  Trash2,
  Combine,
  Split,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CopyPlus,
  RotateCw,
  ExternalLink,
  Minus,
  Sliders,
  FilePlus,
  CheckSquare,
  Sigma,
} from 'lucide-react';
import { ShapeAttributes } from '../extensions/ShapeNode';
import { convertMarkdownAndLatexToHtml } from '../utils/markdownToHtml';

export type ContextMenuType =
  | 'selection'
  | 'paragraph'
  | 'image'
  | 'table'
  | 'shape'
  | 'link'
  | 'canvas';

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  type: ContextMenuType;
  targetNodePos?: number;
  linkHref?: string;
  imageSrc?: string;
  shapeAttrs?: ShapeAttributes;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  editor: Editor | null;
  onAddComment: () => void;
  onRewriteWithAi: (text: string) => void;
  onOpenLinkModal: (url?: string, text?: string) => void;
  onOpenPageSetup: () => void;
}

interface MenuItemProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  colorClass?: string;
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled = false,
  danger = false,
  bold = false,
  italic = false,
  underline = false,
  colorClass = '',
}: MenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer select-none ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-[var(--text-muted)]'
          : danger
          ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20'
          : colorClass || 'text-[var(--text)] hover:bg-[var(--accent)]'
      } ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''} ${underline ? 'underline' : ''}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      <span className="truncate flex-1 min-w-0">{label}</span>
      {shortcut && (
        <span className="font-mono text-[10px] text-[var(--text-muted)] ml-auto shrink-0 pl-2">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-[var(--border)]" />;
}

export function ContextMenu({
  state,
  onClose,
  editor,
  onAddComment,
  onRewriteWithAi,
  onOpenLinkModal,
  onOpenPageSetup,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [edgeOffset, setEdgeOffset] = useState<{ x: number; y: number } | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Clamp synchronously to viewport on initial render so it NEVER starts at (0, 0)
  const clampToViewport = useCallback((rawX: number, rawY: number, width = 256, height = 320) => {
    if (typeof window === 'undefined') return { x: rawX, y: rawY };
    const padding = 10;
    let x = rawX;
    let y = rawY;
    if (x + width > window.innerWidth - padding) x = window.innerWidth - width - padding;
    if (y + height > window.innerHeight - padding) y = window.innerHeight - height - padding;
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    return { x, y };
  }, []);

  // Fine-tune using actual measured menu dimensions once mounted
  useLayoutEffect(() => {
    if (!state.isOpen) {
      setEdgeOffset(null);
      return;
    }
    const menuEl = menuRef.current;
    if (!menuEl) return;
    const clamped = clampToViewport(state.x, state.y, menuEl.offsetWidth || 256, menuEl.offsetHeight || 320);
    setEdgeOffset(clamped);
  }, [state.isOpen, state.x, state.y, clampToViewport]);

  const handleClose = useCallback(() => {
    setEdgeOffset(null);
    onClose();
  }, [onClose]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!state.isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state.isOpen, handleClose]);

  if (!state.isOpen || !editor) return null;

  const runAndClose = (action: () => void) => {
    setEdgeOffset(null);
    action();
    onClose();
  };

  const handleCut = async () => {
    const { from, to } = editor.state.selection;
    if (from !== to) {
      const text = editor.state.doc.textBetween(from, to, '\n');
      await navigator.clipboard.writeText(text);
      editor.chain().focus().deleteSelection().run();
    }
  };

  const handleCopy = async () => {
    const { from, to } = editor.state.selection;
    if (from !== to) {
      const text = editor.state.doc.textBetween(from, to, '\n');
      await navigator.clipboard.writeText(text);
    }
  };

  const handlePaste = async (mode: 'default' | 'with-formatting' | 'without-formatting' = 'default') => {
    try {
      let clipboardHtml = '';
      let clipboardText = '';

      if (typeof navigator.clipboard.read === 'function') {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (!clipboardHtml && item.types.includes('text/html')) {
              clipboardHtml = await (await item.getType('text/html')).text();
            }
            if (!clipboardText && item.types.includes('text/plain')) {
              clipboardText = await (await item.getType('text/plain')).text();
            }
          }
        } catch {
          // Fall back to readText below
        }
      }

      if (!clipboardText) {
        clipboardText = await navigator.clipboard.readText();
      }

      if (mode === 'without-formatting') {
        if (clipboardText) {
          editor.chain().focus().unsetAllMarks().insertContent({ type: 'text', text: clipboardText }).run();
        }
        return;
      }

      // If Paste with Formatting (or Default) and plain text contains Markdown (*, **, #, -, >, ```, tables) or LaTeX ($...$, $$...$$, \(...\), \[...\])
      const hasMarkdownOrLatex = Boolean(
        clipboardText &&
          /(?:\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|^#{1,6}\s|^[-*+]\s|^\d+\.\s|^>\s|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\d)[^$\n]+\$)/m.test(
            clipboardText
          )
      );

      if (hasMarkdownOrLatex && clipboardText) {
        const renderedHtml = convertMarkdownAndLatexToHtml(clipboardText);
        editor.chain().focus().insertContent(renderedHtml).run();
        return;
      }

      if (clipboardHtml.trim()) {
        editor.chain().focus().insertContent(clipboardHtml).run();
        return;
      }

      if (clipboardText) {
        editor.chain().focus().insertContent(clipboardText).run();
      }
    } catch {
      editor.chain().focus().run();
    }
  };

  const renderSelectedFormula = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const raw = editor.state.doc.textBetween(from, to, '\n').trim();
    if (!raw) return;

    const isBlock = /^\$\$[\s\S]+\$\$$|^\\\[[\s\S]+\\\]$/.test(raw);
    const cleaned = raw
      .replace(/^\$\$([\s\S]+)\$\$$/, '$1')
      .replace(/^\\\[([\s\S]+)\\\]$/, '$1')
      .replace(/^\$([\s\S]+)\$$/, '$1')
      .replace(/^\\\(([\s\S]+)\\\)$/, '$1')
      .trim();
    if (!cleaned) return;

    editor
      .chain()
      .focus()
      .insertContentAt(
        { from, to },
        {
          type: isBlock ? 'equation' : 'inlineEquation',
          attrs: { latex: cleaned, ...(isBlock ? { displayMode: true } : {}) },
        }
      )
      .run();
  };

  const renderAllFormulasInDocument = () => {
    const replacements: Array<{ from: number; to: number; nodeType: 'equation' | 'inlineEquation'; latex: string }> = [];
    const latexRe = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$(?!\d+(?:[.,]\d+)?(?:\s|$|[.,;!?)]))([^$\n]+?)\$/g;

    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        let m: RegExpExecArray | null;
        latexRe.lastIndex = 0;
        while ((m = latexRe.exec(node.text)) !== null) {
          const isBlock = Boolean(m[1] || m[2]);
          const latex = (m[1] || m[2] || m[3] || m[4] || '').trim();
          if (latex) {
            replacements.push({
              from: pos + m.index,
              to: pos + m.index + m[0].length,
              nodeType: isBlock ? 'equation' : 'inlineEquation',
              latex,
            });
          }
        }
      }
    });

    if (replacements.length === 0) return;
    const tr = editor.state.tr;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      const schemaNode = editor.state.schema.nodes[r.nodeType];
      if (schemaNode) {
        tr.replaceWith(
          r.from,
          r.to,
          schemaNode.create({ latex: r.latex, ...(r.nodeType === 'equation' ? { displayMode: true } : {}) })
        );
      }
    }
    editor.view.dispatch(tr);
  };

  const derenderSelectedFormula = () => {
    const { from, to } = editor.state.selection;
    const nodes: Array<{ from: number; to: number; text: string }> = [];
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'inlineEquation') {
        nodes.push({ from: pos, to: pos + node.nodeSize, text: `$${node.attrs.latex || ''}$` });
      } else if (node.type.name === 'equation') {
        nodes.push({ from: pos, to: pos + node.nodeSize, text: `$$${node.attrs.latex || ''}$$` });
      }
    });
    if (nodes.length === 0) return;
    const tr = editor.state.tr;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      tr.replaceWith(n.from, n.to, editor.state.schema.text(n.text));
    }
    editor.view.dispatch(tr);
  };

  const derenderAllFormulasInDocument = () => {
    const nodes: Array<{ from: number; to: number; text: string; isBlock: boolean }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'inlineEquation') {
        nodes.push({ from: pos, to: pos + node.nodeSize, text: `$${node.attrs.latex || ''}$`, isBlock: false });
      } else if (node.type.name === 'equation') {
        nodes.push({ from: pos, to: pos + node.nodeSize, text: `$$${node.attrs.latex || ''}$$`, isBlock: true });
      }
    });
    if (nodes.length === 0) return;
    const tr = editor.state.tr;
    const pType = editor.state.schema.nodes.paragraph;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.isBlock && pType) {
        tr.replaceWith(n.from, n.to, pType.create(null, editor.state.schema.text(n.text)));
      } else {
        tr.replaceWith(n.from, n.to, editor.state.schema.text(n.text));
      }
    }
    editor.view.dispatch(tr);
  };

  const renderPasteOptions = () => (
    <>
      <MenuItem
        icon={ClipboardPaste}
        label="Paste"
        shortcut="Ctrl+V"
        onClick={() => runAndClose(() => void handlePaste('default'))}
      />
      <MenuItem
        icon={ClipboardPaste}
        label="Paste with Formatting"
        onClick={() => runAndClose(() => void handlePaste('with-formatting'))}
      />
      <MenuItem
        icon={RemoveFormatting}
        label="Paste without Formatting"
        shortcut="Ctrl+Shift+V"
        onClick={() => runAndClose(() => void handlePaste('without-formatting'))}
      />
    </>
  );

  // ==================== A. SELECTED TEXT MENU ====================
  const renderSelectionMenu = () => {
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      ' '
    );

    return (
      <div className="flex flex-col w-full">
        <MenuItem icon={Scissors} label="Cut" shortcut="Ctrl+X" onClick={() => runAndClose(handleCut)} />
        <MenuItem icon={Copy} label="Copy" shortcut="Ctrl+C" onClick={() => runAndClose(handleCopy)} />
        {renderPasteOptions()}

        <MenuDivider />

        <MenuItem
          icon={Bold}
          label="Bold"
          shortcut="Ctrl+B"
          bold
          onClick={() => runAndClose(() => editor.chain().focus().toggleBold().run())}
        />
        <MenuItem
          icon={Italic}
          label="Italic"
          shortcut="Ctrl+I"
          italic
          onClick={() => runAndClose(() => editor.chain().focus().toggleItalic().run())}
        />
        <MenuItem
          icon={UnderlineIcon}
          label="Underline"
          shortcut="Ctrl+U"
          underline
          onClick={() => runAndClose(() => editor.chain().focus().toggleUnderline().run())}
        />
        <MenuItem
          icon={Strikethrough}
          label="Strikethrough"
          onClick={() => runAndClose(() => editor.chain().focus().toggleStrike().run())}
        />
        <MenuItem
          icon={SubscriptIcon}
          label="Subscript"
          onClick={() => runAndClose(() => editor.chain().focus().toggleSubscript().run())}
        />
        <MenuItem
          icon={SuperscriptIcon}
          label="Superscript"
          onClick={() => runAndClose(() => editor.chain().focus().toggleSuperscript().run())}
        />

        <MenuDivider />

        <MenuItem
          icon={Link2}
          label="Link..."
          colorClass="text-[var(--primary)]"
          onClick={() => runAndClose(() => onOpenLinkModal('', selectedText))}
        />
        <MenuItem
          icon={MessageSquarePlus}
          label="Add Comment"
          colorClass="text-amber-600 dark:text-amber-400"
          onClick={() => runAndClose(onAddComment)}
        />
        <MenuItem
          icon={Sparkles}
          label="Rewrite with Docium AI"
          colorClass="text-[var(--primary)] font-semibold"
          onClick={() => runAndClose(() => onRewriteWithAi(selectedText))}
        />

        <MenuDivider />

        <MenuItem
          icon={Sigma}
          label="Render Selected Formula (LaTeX)"
          colorClass="text-[var(--primary)]"
          onClick={() => runAndClose(renderSelectedFormula)}
        />
        <MenuItem
          icon={Sigma}
          label="Render All Formulas in Document"
          onClick={() => runAndClose(renderAllFormulasInDocument)}
        />
        <MenuItem
          icon={RemoveFormatting}
          label="Derender Selected Formula"
          onClick={() => runAndClose(derenderSelectedFormula)}
        />
        <MenuItem
          icon={RemoveFormatting}
          label="Derender All Formulas"
          onClick={() => runAndClose(derenderAllFormulasInDocument)}
        />

        <MenuDivider />

        <MenuItem
          icon={RemoveFormatting}
          label="Clear Formatting"
          colorClass="text-[var(--text-muted)]"
          onClick={() => runAndClose(() => editor.chain().focus().unsetAllMarks().run())}
        />
      </div>
    );
  };

  // ==================== B. PARAGRAPH / HEADING MENU ====================
  const renderParagraphMenu = () => {
    return (
      <div className="flex flex-col w-full">
        {renderPasteOptions()}

        <MenuDivider />

        <MenuItem
          icon={AlignLeft}
          label="Align Left"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('left').run())}
        />
        <MenuItem
          icon={AlignCenter}
          label="Align Center"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('center').run())}
        />
        <MenuItem
          icon={AlignRight}
          label="Align Right"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('right').run())}
        />
        <MenuItem
          icon={AlignJustify}
          label="Justify"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('justify').run())}
        />

        <MenuDivider />

        <MenuItem
          icon={List}
          label="Bullet List"
          onClick={() => runAndClose(() => editor.chain().focus().toggleBulletList().run())}
        />
        <MenuItem
          icon={ListOrdered}
          label="Numbered List"
          onClick={() => runAndClose(() => editor.chain().focus().toggleOrderedList().run())}
        />
        <MenuItem
          icon={CheckSquare}
          label="Task List"
          onClick={() => runAndClose(() => editor.chain().focus().toggleTaskList().run())}
        />

        <MenuDivider />

        <MenuItem
          icon={Minus}
          label="Insert Page Break"
          shortcut="Ctrl+Enter"
          onClick={() => runAndClose(() => editor.chain().focus().setPageBreak().run())}
        />
        <MenuItem
          icon={MessageSquarePlus}
          label="Add Comment"
          colorClass="text-amber-600 dark:text-amber-400"
          onClick={() => runAndClose(onAddComment)}
        />
        <MenuItem
          icon={Sparkles}
          label="Draft with AI"
          colorClass="text-[var(--primary)] font-semibold"
          onClick={() => runAndClose(() => onRewriteWithAi(''))}
        />
      </div>
    );
  };

  // ==================== C. IMAGE MENU ====================
  const renderImageMenu = () => {
    return (
      <div className="flex flex-col w-full">
        <MenuItem
          icon={Copy}
          label="Copy Image URL"
          onClick={() => {
            if (state.imageSrc) {
              navigator.clipboard.writeText(state.imageSrc);
            }
            onClose();
          }}
        />

        <MenuDivider />

        <MenuItem
          icon={AlignLeft}
          label="Align Left"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('left').run())}
        />
        <MenuItem
          icon={AlignCenter}
          label="Align Center"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('center').run())}
        />
        <MenuItem
          icon={AlignRight}
          label="Align Right"
          onClick={() => runAndClose(() => editor.chain().focus().setTextAlign('right').run())}
        />

        <MenuDivider />

        <MenuItem
          icon={Trash2}
          label="Delete Image"
          danger
          onClick={() => runAndClose(() => editor.chain().focus().deleteSelection().run())}
        />
      </div>
    );
  };

  // ==================== D. TABLE MENU ====================
  const renderTableMenu = () => {
    return (
      <div className="flex flex-col w-full">
        <MenuItem
          icon={Rows}
          label="Add Row Above"
          onClick={() => runAndClose(() => editor.chain().focus().addRowBefore().run())}
        />
        <MenuItem
          icon={Rows}
          label="Add Row Below"
          onClick={() => runAndClose(() => editor.chain().focus().addRowAfter().run())}
        />
        <MenuItem
          icon={Trash2}
          label="Delete Row"
          danger
          onClick={() => runAndClose(() => editor.chain().focus().deleteRow().run())}
        />

        <MenuDivider />

        <MenuItem
          icon={Columns}
          label="Add Column Left"
          onClick={() => runAndClose(() => editor.chain().focus().addColumnBefore().run())}
        />
        <MenuItem
          icon={Columns}
          label="Add Column Right"
          onClick={() => runAndClose(() => editor.chain().focus().addColumnAfter().run())}
        />
        <MenuItem
          icon={Trash2}
          label="Delete Column"
          danger
          onClick={() => runAndClose(() => editor.chain().focus().deleteColumn().run())}
        />

        <MenuDivider />

        <MenuItem
          icon={Combine}
          label="Merge Cells"
          onClick={() => runAndClose(() => editor.chain().focus().mergeCells().run())}
        />
        <MenuItem
          icon={Split}
          label="Split Cell"
          onClick={() => runAndClose(() => editor.chain().focus().splitCell().run())}
        />

        <MenuDivider />

        <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Cell Shading
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1">
          {['#FFFFFF', '#F1F5F3', '#EAF2ED', '#DBEAFE', '#FEF3C7', '#FFE4E6', '#245C45'].map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => runAndClose(() => editor.chain().focus().setCellBackground(color === '#FFFFFF' ? null : color).run())}
              style={{ backgroundColor: color }}
              className="w-4 h-4 rounded-full border border-[var(--border)] hover:scale-125 transition-transform cursor-pointer"
              title={`Shade cell ${color}`}
            />
          ))}
        </div>

        <MenuDivider />

        <MenuItem
          icon={Trash2}
          label="Delete Entire Table"
          danger
          onClick={() => runAndClose(() => editor.chain().focus().deleteTable().run())}
        />
      </div>
    );
  };

  // ==================== E. SHAPE MENU ====================
  const renderShapeMenu = () => {
    const attrs = state.shapeAttrs;
    if (!attrs) return null;

    return (
      <div className="flex flex-col w-full">
        <MenuItem
          icon={CopyPlus}
          label="Duplicate Shape"
          onClick={() => runAndClose(() => editor.chain().focus().insertShape({ ...attrs }).run())}
        />
        <MenuItem
          icon={RotateCw}
          label={`Rotate 90° (Now: ${(attrs.rotation + 90) % 360}°)`}
          onClick={() =>
            runAndClose(() => {
              editor.chain().focus().updateShape({ rotation: (attrs.rotation + 90) % 360 }).run();
            })
          }
        />

        <MenuDivider />

        <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Shape Fill Color
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1">
          {['#245C45', '#398568', '#E7EAE4', '#FFFFFF', '#1E40AF', '#DC2626', '#F59E0B'].map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => runAndClose(() => editor.chain().focus().updateShape({ fill: color }).run())}
              style={{ backgroundColor: color }}
              className="w-4 h-4 rounded-full border border-[var(--border)] hover:scale-125 transition-transform cursor-pointer"
              title={`Set fill to ${color}`}
            />
          ))}
        </div>

        <MenuDivider />

        <MenuItem
          icon={Trash2}
          label="Delete Shape"
          danger
          onClick={() => runAndClose(() => editor.chain().focus().deleteSelection().run())}
        />
      </div>
    );
  };

  // ==================== F. HYPERLINK MENU ====================
  const renderLinkMenu = () => {
    return (
      <div className="flex flex-col w-full">
        {state.linkHref && (
          <MenuItem
            icon={ExternalLink}
            label="Open Link in New Tab"
            colorClass="text-[var(--primary)] font-medium"
            onClick={() => {
              window.open(state.linkHref, '_blank');
              onClose();
            }}
          />
        )}
        <MenuItem
          icon={Link2}
          label="Edit Link..."
          onClick={() => runAndClose(() => onOpenLinkModal(state.linkHref))}
        />
        <MenuItem
          icon={Copy}
          label="Copy Link Address"
          onClick={() => {
            if (state.linkHref) {
              navigator.clipboard.writeText(state.linkHref);
            }
            onClose();
          }}
        />

        <MenuDivider />

        <MenuItem
          icon={Trash2}
          label="Remove Link"
          danger
          onClick={() =>
            runAndClose(() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
            })
          }
        />
      </div>
    );
  };

  // ==================== G. PAGE CANVAS MENU ====================
  const renderCanvasMenu = () => {
    return (
      <div className="flex flex-col w-full">
        {renderPasteOptions()}
        <MenuItem
          icon={CheckSquare}
          label="Select All"
          shortcut="Ctrl+A"
          onClick={() => runAndClose(() => editor.chain().focus().selectAll().run())}
        />

        <MenuDivider />

        <MenuItem
          icon={FilePlus}
          label="Insert Blank Page"
          onClick={() =>
            runAndClose(() => {
              editor
                .chain()
                .focus()
                .insertContent([
                  { type: 'pageBreak' },
                  { type: 'paragraph' },
                  { type: 'pageBreak' },
                ])
                .run();
            })
          }
        />
        <MenuItem
          icon={Minus}
          label="Insert Page Break"
          shortcut="Ctrl+Enter"
          onClick={() => runAndClose(() => editor.chain().focus().setPageBreak().run())}
        />
        <MenuItem
          icon={Split}
          label="Insert Section Break"
          onClick={() => runAndClose(() => editor.chain().focus().setSectionBreak().run())}
        />

        <MenuDivider />

        <MenuItem
          icon={Sliders}
          label="Page Setup (Size, Margins, Orientation)..."
          colorClass="text-[var(--primary)] font-medium"
          onClick={() => runAndClose(onOpenPageSetup)}
        />

        <MenuDivider />

        <MenuItem
          icon={Sigma}
          label="Render All Formulas in Document"
          onClick={() => runAndClose(renderAllFormulasInDocument)}
        />
        <MenuItem
          icon={RemoveFormatting}
          label="Derender All Formulas"
          onClick={() => runAndClose(derenderAllFormulasInDocument)}
        />
      </div>
    );
  };

  if (!mounted || typeof document === 'undefined') return null;

  const displayPos = edgeOffset ?? clampToViewport(state.x, state.y);

  return createPortal(
    <div
      key={`${state.x}-${state.y}`}
      ref={menuRef}
      style={{
        left: `${displayPos.x}px`,
        top: `${displayPos.y}px`,
      }}
      className="fixed z-[60] w-64 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl text-xs text-[var(--text)] select-none"
    >
      {state.type === 'selection' && renderSelectionMenu()}
      {state.type === 'paragraph' && renderParagraphMenu()}
      {state.type === 'image' && renderImageMenu()}
      {state.type === 'table' && renderTableMenu()}
      {state.type === 'shape' && renderShapeMenu()}
      {state.type === 'link' && renderLinkMenu()}
      {state.type === 'canvas' && renderCanvasMenu()}
    </div>,
    document.body
  );
}
