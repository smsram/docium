'use client';

import React, { useState } from 'react';
import { type Editor } from '@tiptap/react';
import {
  Undo,
  Redo,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Minus,
  Sparkles,
  ChevronDown,
  Type,
  Highlighter,
  SplitSquareVertical,
} from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor | null;
  onInsertPageBreak?: () => void;
}

export function EditorToolbar({ editor, onInsertPageBreak }: EditorToolbarProps) {
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!editor) return null;

  const setHeading = (level: 1 | 2 | 3 | 0) => {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  const getHeadingLabel = () => {
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    return 'Normal text';
  };

  const addImage = () => {
    const url = window.prompt('Enter Image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* Undo / Redo */}
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30"
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30"
        title="Redo (Ctrl+Y)"
      >
        <Redo className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-[var(--border)]" />

      {/* Headings Dropdown */}
      <div className="relative group">
        <button className="flex h-7 items-center gap-1.5 rounded px-2 font-medium hover:bg-[var(--accent)]">
          <Type className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span>{getHeadingLabel()}</span>
          <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
        </button>
        <div className="absolute left-0 top-full mt-1 hidden group-hover:flex flex-col w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg z-50">
          <button
            onClick={() => setHeading(0)}
            className="flex items-center px-2.5 py-1.5 text-left rounded hover:bg-[var(--accent)]"
          >
            Normal text
          </button>
          <button
            onClick={() => setHeading(1)}
            className="flex items-center px-2.5 py-1.5 text-left text-base font-bold rounded hover:bg-[var(--accent)]"
          >
            Heading 1
          </button>
          <button
            onClick={() => setHeading(2)}
            className="flex items-center px-2.5 py-1.5 text-left text-sm font-semibold rounded hover:bg-[var(--accent)]"
          >
            Heading 2
          </button>
          <button
            onClick={() => setHeading(3)}
            className="flex items-center px-2.5 py-1.5 text-left text-xs font-semibold rounded hover:bg-[var(--accent)]"
          >
            Heading 3
          </button>
        </div>
      </div>

      <div className="mx-1 h-4 w-px bg-[var(--border)]" />

      {/* Basic Marks: Bold, Italic, Underline, Strike, Code */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('bold') ? 'bg-[var(--primary-light)] text-[var(--primary)] font-bold' : 'hover:bg-[var(--accent)]'
        }`}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('italic') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('underline') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('strike') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('code') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Inline Code"
      >
        <Code className="h-3.5 w-3.5" />
      </button>

      {/* Highlighter */}
      <button
        onClick={() => editor.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('highlight') ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60' : 'hover:bg-[var(--accent)]'
        }`}
        title="Highlight"
      >
        <Highlighter className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-[var(--border)]" />

      {/* Text Alignment */}
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive({ textAlign: 'left' }) ? 'bg-[var(--accent)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Align Left"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive({ textAlign: 'center' }) ? 'bg-[var(--accent)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Align Center"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive({ textAlign: 'right' }) ? 'bg-[var(--accent)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Align Right"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive({ textAlign: 'justify' }) ? 'bg-[var(--accent)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Justify"
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-[var(--border)]" />

      {/* Lists */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('bulletList') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('orderedList') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Numbered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('taskList') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Checklist / Task list"
      >
        <CheckSquare className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-[var(--border)]" />

      {/* Table Dropdown Menu */}
      <div className="relative">
        <button
          onClick={() => setShowTableMenu(!showTableMenu)}
          className={`flex h-7 items-center gap-1 rounded px-1.5 transition-colors ${
            editor.isActive('table') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
          }`}
          title="Table Operations"
        >
          <TableIcon className="h-3.5 w-3.5" />
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>

        {showTableMenu && (
          <div
            className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl z-50 text-xs"
            onMouseLeave={() => setShowTableMenu(false)}
          >
            <button
              onClick={() => {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                setShowTableMenu(false);
              }}
              className="flex w-full items-center px-2 py-1.5 rounded hover:bg-[var(--accent)] text-left"
            >
              Insert 3x3 Table
            </button>
            <div className="my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => {
                editor.chain().focus().addRowAfter().run();
                setShowTableMenu(false);
              }}
              disabled={!editor.can().addRowAfter()}
              className="flex w-full items-center px-2 py-1.5 rounded hover:bg-[var(--accent)] disabled:opacity-40 text-left"
            >
              Add Row Below
            </button>
            <button
              onClick={() => {
                editor.chain().focus().addColumnAfter().run();
                setShowTableMenu(false);
              }}
              disabled={!editor.can().addColumnAfter()}
              className="flex w-full items-center px-2 py-1.5 rounded hover:bg-[var(--accent)] disabled:opacity-40 text-left"
            >
              Add Column Right
            </button>
            <button
              onClick={() => {
                editor.chain().focus().deleteRow().run();
                setShowTableMenu(false);
              }}
              disabled={!editor.can().deleteRow()}
              className="flex w-full items-center px-2 py-1.5 rounded hover:bg-[var(--accent)] text-red-600 disabled:opacity-40 text-left"
            >
              Delete Row
            </button>
            <button
              onClick={() => {
                editor.chain().focus().deleteTable().run();
                setShowTableMenu(false);
              }}
              disabled={!editor.can().deleteTable()}
              className="flex w-full items-center px-2 py-1.5 rounded hover:bg-[var(--accent)] text-red-600 disabled:opacity-40 text-left"
            >
              Delete Table
            </button>
          </div>
        )}
      </div>

      {/* Image & Link */}
      <button
        onClick={addImage}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)]"
        title="Insert Image"
      >
        <ImageIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={setLink}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('link') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Insert Link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          editor.isActive('blockquote') ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'hover:bg-[var(--accent)]'
        }`}
        title="Blockquote"
      >
        <Quote className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)]"
        title="Horizontal Line"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      {/* Page break */}
      <button
        onClick={onInsertPageBreak}
        className="flex h-7 items-center gap-1 rounded px-1.5 hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text)]"
        title="Insert Page Break"
      >
        <SplitSquareVertical className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-[11px]">Break</span>
      </button>
    </div>
  );
}
