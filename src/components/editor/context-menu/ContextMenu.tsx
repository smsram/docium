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
} from 'lucide-react';
import { ShapeAttributes } from '../extensions/ShapeNode';

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
  const [adjustedPos, setAdjustedPos] = useState({ x: state.x, y: state.y });
  const [isPositioned, setIsPositioned] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Reposition within viewport boundaries with zero initial frame (0,0) flash
  useLayoutEffect(() => {
    if (state.isOpen) {
      const menuEl = menuRef.current;
      const padding = 10;
      const menuWidth = menuEl?.offsetWidth || 256;
      const menuHeight = menuEl?.offsetHeight || 300;

      let newX = state.x;
      let newY = state.y;

      if (newX + menuWidth > window.innerWidth - padding) {
        newX = window.innerWidth - menuWidth - padding;
      }
      if (newY + menuHeight > window.innerHeight - padding) {
        newY = window.innerHeight - menuHeight - padding;
      }
      if (newX < padding) newX = padding;
      if (newY < padding) newY = padding;

      setAdjustedPos({ x: newX, y: newY });
      setIsPositioned(true);
    }
  }, [state.isOpen, state.x, state.y]);

  const handleClose = useCallback(() => {
    setIsPositioned(false);
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
    setIsPositioned(false);
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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.chain().focus().insertContent(text).run();
      }
    } catch {
      // Fallback
    }
  };

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
        <MenuItem icon={ClipboardPaste} label="Paste" shortcut="Ctrl+V" onClick={() => runAndClose(handlePaste)} />

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
        <MenuItem icon={ClipboardPaste} label="Paste" shortcut="Ctrl+V" onClick={() => runAndClose(handlePaste)} />

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
        <MenuItem icon={ClipboardPaste} label="Paste" shortcut="Ctrl+V" onClick={() => runAndClose(handlePaste)} />
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
      </div>
    );
  };

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        left: `${adjustedPos.x}px`,
        top: `${adjustedPos.y}px`,
        visibility: isPositioned ? 'visible' : 'hidden',
        opacity: isPositioned ? 1 : 0,
      }}
      className="fixed z-[60] w-64 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 text-xs text-[var(--text)] select-none"
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
