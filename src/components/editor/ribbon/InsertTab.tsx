'use client';

import React, { useState, useRef } from 'react';
import { type Editor } from '@tiptap/react';
import {
  Table as TableIcon,
  Image as ImageIcon,
  Link2,
  FileCode,
  Minus,
  Bookmark,
  ChevronDown,
  Info,
  AlertTriangle,
  Lightbulb,
  ShieldAlert,
  StickyNote,
  Columns,
  Rows,
  Trash2,
  BookOpen,
  Shapes,
  FilePlus,
  Type,
  Omega,
  Combine,
  Split,
} from 'lucide-react';
import { TableGridPicker } from './TableGridPicker';
import { ShapesPicker } from './ShapesPicker';
import { SymbolsPopover } from './SymbolsPopover';
import { CalloutType } from '../extensions/Callout';
import { ShapeType } from '../extensions/ShapeNode';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Popover } from '@/components/ui/Popover';

interface InsertTabProps {
  editor: Editor | null;
  onOpenLinkModal: () => void;
  onOpenCitationModal: () => void;
  onOpenPageSetupModal: () => void;
}

export function InsertTab({
  editor,
  onOpenLinkModal,
  onOpenCitationModal,
  onOpenPageSetupModal,
}: InsertTabProps) {
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showShapesPicker, setShowShapesPicker] = useState(false);
  const [showSymbolsPopover, setShowSymbolsPopover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleInsertTable = (rows: number, cols: number) => {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        if (src) {
          editor.chain().focus().setImage({ src }).run();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInsertImageUrl = () => {
    const url = prompt('Enter Image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleInsertShape = (shapeType: ShapeType) => {
    editor
      .chain()
      .focus()
      .insertShape({
        shapeType,
        width: 180,
        height: 110,
        fill: '#E7EAE4',
        stroke: '#245C45',
        strokeWidth: 2,
        rotation: 0,
        alignment: 'center',
      })
      .run();
  };

  const handleInsertCallout = (type: CalloutType) => {
    editor.chain().focus().setCallout({ type }).run();
  };

  const isInsideTable = editor.isActive('table');

  const pageDropdownItems: DropdownItem[] = [
    {
      id: 'blank-page',
      label: 'Blank Page',
      sublabel: 'Insert a new blank page at cursor position',
      icon: FilePlus,
      onClick: () => {
        editor
          .chain()
          .focus()
          .insertContent([
            { type: 'pageBreak' },
            { type: 'paragraph' },
            { type: 'pageBreak' },
          ])
          .run();
      },
    },
    {
      id: 'page-break',
      label: 'Page Break',
      sublabel: 'End current page and move to next',
      badge: 'Ctrl+Enter',
      icon: Minus,
      onClick: () => editor.chain().focus().setPageBreak().run(),
    },
    {
      id: 'section-break',
      label: 'Section Break (Next Page)',
      sublabel: 'Start a new section with separate page layout',
      icon: Split,
      onClick: () => editor.chain().focus().setSectionBreak().run(),
    },
  ];

  const imageDropdownItems: DropdownItem[] = [
    {
      id: 'img-upload',
      label: 'Upload from Device',
      icon: ImageIcon,
      onClick: () => fileInputRef.current?.click(),
    },
    {
      id: 'img-url',
      label: 'Insert by URL...',
      icon: ImageIcon,
      onClick: handleInsertImageUrl,
    },
  ];

  const calloutDropdownItems: DropdownItem[] = [
    {
      id: 'callout-info',
      label: 'Information Callout',
      icon: Info,
      onClick: () => handleInsertCallout('info'),
    },
    {
      id: 'callout-tip',
      label: 'Tip Callout',
      icon: Lightbulb,
      onClick: () => handleInsertCallout('tip'),
    },
    {
      id: 'callout-warning',
      label: 'Warning Callout',
      icon: AlertTriangle,
      onClick: () => handleInsertCallout('warning'),
    },
    {
      id: 'callout-danger',
      label: 'Danger Callout',
      icon: ShieldAlert,
      onClick: () => handleInsertCallout('danger'),
    },
    {
      id: 'callout-note',
      label: 'Note Callout',
      icon: StickyNote,
      onClick: () => handleInsertCallout('note'),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* 1. Pages Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium text-[var(--text)] cursor-pointer">
              <FilePlus className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>New Page</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
          items={pageDropdownItems}
          menuWidth="w-64"
        />
        <button
          type="button"
          onClick={() => editor.chain().focus().setPageBreak().run()}
          className="hidden sm:flex h-7 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
          title="Insert Page Break (Ctrl+Enter)"
        >
          <Minus className="h-3 w-3" />
          <span>Break</span>
        </button>
      </div>

      {/* 2. Tables Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Popover
          isOpen={showTablePicker}
          onClose={() => setShowTablePicker(false)}
          trigger={
            <button
              type="button"
              onClick={() => setShowTablePicker(!showTablePicker)}
              className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors cursor-pointer ${
                showTablePicker
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--accent)] text-[var(--text)]'
              }`}
              title="Insert Table Grid"
            >
              <TableIcon className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Table</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          }
        >
          <TableGridPicker
            onSelectDimensions={handleInsertTable}
            onClose={() => setShowTablePicker(false)}
          />
        </Popover>

        {/* Quick Table Manipulation Controls */}
        {isInsideTable && (
          <div className="flex items-center gap-0.5 ml-1 bg-[var(--surface-elevated)] p-0.5 rounded border border-[var(--border)]">
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] hover:bg-[var(--accent)]"
              title="Add Row Below"
            >
              <Rows className="h-3 w-3" />
              <span>+Row</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] hover:bg-[var(--accent)]"
              title="Add Column Right"
            >
              <Columns className="h-3 w-3" />
              <span>+Col</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().mergeCells().run()}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] hover:bg-[var(--accent)]"
              title="Merge Cells"
            >
              <Combine className="h-3 w-3" />
              <span>Merge</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().splitCell().run()}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] hover:bg-[var(--accent)]"
              title="Split Cell"
            >
              <Split className="h-3 w-3" />
              <span>Split</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-rose-50 text-rose-600"
              title="Delete Entire Table"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Illustrations & Shapes */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)] relative">
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]">
              <ImageIcon className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Image</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
          items={imageDropdownItems}
          menuWidth="w-48"
        />

        {/* Shapes Menu Popover */}
        <Popover
          isOpen={showShapesPicker}
          onClose={() => setShowShapesPicker(false)}
          trigger={
            <button
              type="button"
              onClick={() => setShowShapesPicker(!showShapesPicker)}
              className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors cursor-pointer ${
                showShapesPicker
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--accent)] text-[var(--text)]'
              }`}
              title="Insert Vector Shapes"
            >
              <Shapes className="h-3.5 w-3.5 text-[var(--secondary)]" />
              <span>Shapes</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          }
        >
          <ShapesPicker
            onSelectShape={handleInsertShape}
            onClose={() => setShowShapesPicker(false)}
          />
        </Popover>
      </div>

      {/* 4. Text & Building Blocks */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={() => {
            editor
              .chain()
              .focus()
              .insertContent(
                '<div style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 12px 0; background: var(--surface-elevated);"><p>Text box content...</p></div><p></p>'
              )
              .run();
          }}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]"
          title="Insert Text Box"
        >
          <Type className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Text Box</span>
        </button>

        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]">
              <StickyNote className="h-3.5 w-3.5 text-amber-500" />
              <span>Callout</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
          items={calloutDropdownItems}
          menuWidth="w-48"
        />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]"
          title="Code Block"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>Code Block</span>
        </button>

        {/* Special Characters / Symbols */}
        <Popover
          isOpen={showSymbolsPopover}
          onClose={() => setShowSymbolsPopover(false)}
          trigger={
            <button
              type="button"
              onClick={() => setShowSymbolsPopover(!showSymbolsPopover)}
              className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
              title="Insert Special Characters & Symbols"
            >
              <Omega className="h-3.5 w-3.5 text-[var(--secondary)]" />
              <span>Symbols</span>
            </button>
          }
        >
          <SymbolsPopover
            editor={editor}
            onClose={() => setShowSymbolsPopover(false)}
          />
        </Popover>
      </div>

      {/* 5. Links, Citations & Header/Footer */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenLinkModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]"
          title="Insert Link"
        >
          <Link2 className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Link</span>
        </button>

        <button
          type="button"
          onClick={onOpenCitationModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]"
          title="Insert Citation"
        >
          <BookOpen className="h-3.5 w-3.5 text-[var(--secondary)]" />
          <span>Citation</span>
        </button>

        <button
          type="button"
          onClick={onOpenPageSetupModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)]"
          title="Configure Header, Footer, and Page Numbers"
        >
          <Bookmark className="h-3.5 w-3.5 opacity-70" />
          <span>Header / Footer</span>
        </button>
      </div>
    </div>
  );
}
