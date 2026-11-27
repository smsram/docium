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
  BarChart3,
  PenTool,
  Sigma,
  Calendar,
  BookMarked,
  PaintBucket,
  Hash,
} from 'lucide-react';
import { TableGridPicker } from './TableGridPicker';
import { ShapesPicker } from './ShapesPicker';
import { SymbolsPopover } from './SymbolsPopover';
import { ColorPickerPopover } from './ColorPickerPopover';
import { CalloutType } from '../extensions/Callout';
import { ShapeType } from '../extensions/ShapeNode';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Popover } from '@/components/ui/Popover';
import { InputDialog } from '@/components/ui/InputDialog';

interface InsertTabProps {
  editor: Editor | null;
  onOpenLinkModal: () => void;
  onOpenCitationModal: () => void;
  onOpenPageSetupModal: () => void;
  onOpenChartModal: () => void;
  onOpenDrawingModal: () => void;
  onOpenEquationModal: () => void;
  onEnablePageNumbers?: () => void;
}

export function InsertTab({
  editor,
  onOpenLinkModal,
  onOpenCitationModal,
  onOpenPageSetupModal,
  onOpenChartModal,
  onOpenDrawingModal,
  onOpenEquationModal,
  onEnablePageNumbers,
}: InsertTabProps) {
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showShapesPicker, setShowShapesPicker] = useState(false);
  const [showSymbolsPopover, setShowSymbolsPopover] = useState(false);
  const [showCellShading, setShowCellShading] = useState(false);
  const [showImageUrlDialog, setShowImageUrlDialog] = useState(false);
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
    setShowImageUrlDialog(true);
  };

  const handleInsertShape = (shapeType: ShapeType) => {
    const isLine =
      shapeType === 'line' ||
      shapeType === 'arrow' ||
      shapeType === 'left-arrow' ||
      shapeType === 'double-arrow';
    editor
      .chain()
      .focus()
      .insertShape({
        shapeType,
        width: isLine ? 240 : 180,
        height: isLine ? 40 : 110,
        fill: '#EAF2ED',
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

  const handleInsertCoverPage = (style: 'executive' | 'modern' | 'academic') => {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    let coverHtml = '';
    if (style === 'executive') {
      coverHtml = `
        <div data-type="docium-textbox" data-width="0" data-min-height="220" data-fill="#245C45" data-border-color="#245C45" data-border-width="2" data-border-style="solid" data-border-radius="6" data-padding="28" data-alignment="full">
          <h1><span style="color: #FFFFFF; font-size: 26pt">DOCUMENT TITLE</span></h1>
          <p><span style="color: #D1FAE5; font-size: 13pt">Executive Summary &amp; Strategic Analysis</span></p>
        </div>
        <p></p>
        <p><strong>Prepared By:</strong> Author Name</p>
        <p><strong>Date:</strong> ${today}</p>
        <hr />
        <div data-type="page-break" class="docium-page-break"></div>
        <p></p>
      `;
    } else if (style === 'academic') {
      coverHtml = `
        <h1 style="text-align: center"><span style="font-size: 22pt">Research Paper Title</span></h1>
        <p style="text-align: center"><em>Subtitle or Institutional Department</em></p>
        <p></p>
        <p style="text-align: center"><strong>Author Name</strong></p>
        <p style="text-align: center">${today}</p>
        <div data-type="docium-textbox" data-width="0" data-min-height="100" data-fill="#F8FAFC" data-border-color="#CBD5E1" data-border-width="1" data-border-style="solid" data-border-radius="4" data-padding="16" data-alignment="full">
          <p><strong>Abstract:</strong> Summarize the primary objectives, methodology, and findings of your paper here.</p>
        </div>
        <div data-type="page-break" class="docium-page-break"></div>
        <p></p>
      `;
    } else {
      coverHtml = `
        <h1><span style="font-size: 28pt; color: #171C19">Project Proposal</span></h1>
        <p><span style="font-size: 13pt; color: #398568">Comprehensive Overview &amp; Roadmap</span></p>
        <hr />
        <p><strong>Date:</strong> ${today}</p>
        <div data-type="page-break" class="docium-page-break"></div>
        <p></p>
      `;
    }
    editor.chain().focus('start').insertContent(coverHtml).run();
  };

  const isInsideTable = editor.isActive('table');

  const pageDropdownItems: DropdownItem[] = [
    {
      id: 'cover-exec',
      label: 'Cover Page: Executive Forest',
      sublabel: 'Bold header banner cover sheet',
      icon: BookMarked,
      onClick: () => handleInsertCoverPage('executive'),
    },
    {
      id: 'cover-modern',
      label: 'Cover Page: Modern Minimal',
      sublabel: 'Clean typographic title sheet',
      icon: BookMarked,
      onClick: () => handleInsertCoverPage('modern'),
    },
    {
      id: 'cover-academic',
      label: 'Cover Page: Academic / Report',
      sublabel: 'Centered title with Abstract box',
      icon: BookMarked,
      onClick: () => handleInsertCoverPage('academic'),
    },
    {
      id: 'blank-page',
      label: 'Blank Page',
      sublabel: 'Insert a new blank page at cursor',
      separator: true,
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
      sublabel: 'Start a new section break',
      icon: Split,
      onClick: () => editor.chain().focus().setSectionBreak().run(),
    },
    {
      id: 'horiz-line',
      label: 'Horizontal Line',
      sublabel: 'Insert a full-width visual divider',
      icon: Minus,
      onClick: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];

  const textBoxDropdownItems: DropdownItem[] = [
    {
      id: 'tb-simple',
      label: 'Simple Text Box',
      sublabel: 'Resizable bordered box with rich text',
      icon: Type,
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertTextBox({
            width: 0,
            fill: '#FFFFFF',
            borderColor: '#245C45',
            borderWidth: 1,
            borderStyle: 'solid',
            alignment: 'full',
          })
          .run(),
    },
    {
      id: 'tb-sidebar-right',
      label: 'Sidebar Box (Float Right Wrap)',
      sublabel: 'Floats on right while document text wraps around',
      icon: Type,
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertTextBox({
            width: 230,
            minHeight: 110,
            fill: '#F4F8F6',
            borderColor: '#245C45',
            borderWidth: 1,
            borderStyle: 'solid',
            alignment: 'float-right',
            shadow: true,
            contentHtml: 'Sidebar Key Takeaway...',
          })
          .run(),
    },
    {
      id: 'tb-quote',
      label: 'Accent Pull-Quote Box',
      sublabel: 'Centered shaded highlight box',
      icon: Type,
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertTextBox({
            width: 420,
            minHeight: 72,
            fill: '#EAF2ED',
            borderColor: '#245C45',
            borderWidth: 2,
            borderStyle: 'solid',
            alignment: 'center',
            contentHtml: '"Insert highlighted quote or executive note..."',
          })
          .run(),
    },
    {
      id: 'tb-sticky',
      label: 'Warm Note Box',
      sublabel: 'Dashed amber note container',
      icon: StickyNote,
      onClick: () =>
        editor
          .chain()
          .focus()
          .insertTextBox({
            width: 320,
            fill: '#FFFBEB',
            borderColor: '#F59E0B',
            borderWidth: 1,
            borderStyle: 'dashed',
            alignment: 'center',
            contentHtml: 'Important note...',
          })
          .run(),
    },
  ];

  const tableStyleDropdownItems: DropdownItem[] = [
    {
      id: 'ts-grid',
      label: 'Plain Table Grid',
      onClick: () => editor.chain().focus().applyTableStylePreset('grid').run(),
    },
    {
      id: 'ts-forest',
      label: 'Forest Accent Table',
      onClick: () => editor.chain().focus().applyTableStylePreset('forest').run(),
    },
    {
      id: 'ts-striped',
      label: 'Banded / Striped Rows',
      onClick: () => editor.chain().focus().applyTableStylePreset('striped').run(),
    },
    {
      id: 'ts-exec',
      label: 'Executive Slate Header',
      onClick: () => editor.chain().focus().applyTableStylePreset('executive').run(),
    },
    {
      id: 'ts-minimal',
      label: 'Borderless Minimal',
      onClick: () => editor.chain().focus().applyTableStylePreset('minimal').run(),
    },
  ];

  const imageDropdownItems: DropdownItem[] = [
    {
      id: 'img-upload',
      label: 'Upload from Device...',
      icon: ImageIcon,
      onClick: () => fileInputRef.current?.click(),
    },
    {
      id: 'img-url',
      label: 'Insert Image by URL...',
      icon: ImageIcon,
      onClick: handleInsertImageUrl,
    },
  ];

  const calloutDropdownItems: DropdownItem[] = [
    { id: 'callout-info', label: 'Information Callout', icon: Info, onClick: () => handleInsertCallout('info') },
    { id: 'callout-tip', label: 'Tip Callout', icon: Lightbulb, onClick: () => handleInsertCallout('tip') },
    { id: 'callout-warning', label: 'Warning Callout', icon: AlertTriangle, onClick: () => handleInsertCallout('warning') },
    { id: 'callout-danger', label: 'Danger Callout', icon: ShieldAlert, onClick: () => handleInsertCallout('danger') },
    { id: 'callout-note', label: 'Note Callout', icon: StickyNote, onClick: () => handleInsertCallout('note') },
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

      {/* 1. Pages & Cover Page Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium text-[var(--text)] cursor-pointer">
              <FilePlus className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Pages</span>
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

      {/* 2. Tables & Contextual Table Design Group */}
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

        {isInsideTable && (
          <div className="flex items-center gap-0.5 ml-1 bg-[var(--surface-elevated)] p-0.5 rounded border border-[var(--border)]">
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] hover:bg-[var(--accent)] cursor-pointer"
              title="Add Row Below"
            >
              <Rows className="h-3 w-3" />
              <span>+Row</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] hover:bg-[var(--accent)] cursor-pointer"
              title="Add Column Right"
            >
              <Columns className="h-3 w-3" />
              <span>+Col</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().mergeCells().run()}
              className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] hover:bg-[var(--accent)] cursor-pointer"
              title="Merge Selected Cells"
            >
              <Combine className="h-3 w-3" />
              <span>Merge</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().splitCell().run()}
              className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] hover:bg-[var(--accent)] cursor-pointer"
              title="Split Cell"
            >
              <Split className="h-3 w-3" />
              <span>Split</span>
            </button>

            {/* Cell Shading Color Picker */}
            <Popover
              isOpen={showCellShading}
              onClose={() => setShowCellShading(false)}
              trigger={
                <button
                  type="button"
                  onClick={() => setShowCellShading(!showCellShading)}
                  className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] hover:bg-[var(--accent)] cursor-pointer"
                  title="Table Cell Shading Color"
                >
                  <PaintBucket className="h-3 w-3 text-[var(--primary)]" />
                  <span>Shading</span>
                </button>
              }
            >
              <ColorPickerPopover
                isHighlight
                onSelectColor={(c) => {
                  editor.chain().focus().setCellBackground(c).run();
                  setShowCellShading(false);
                }}
                onClear={() => {
                  editor.chain().focus().setCellBackground(null).run();
                  setShowCellShading(false);
                }}
              />
            </Popover>

            {/* Table Style Presets */}
            <Dropdown
              trigger={
                <div className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] hover:bg-[var(--accent)] font-medium text-[var(--primary)] cursor-pointer">
                  <span>Styles</span>
                  <ChevronDown className="h-2.5 w-2.5" />
                </div>
              }
              items={tableStyleDropdownItems}
              menuWidth="w-48"
            />

            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
              title="Delete Entire Table"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Illustrations: Image, Shapes, Drawing, Chart */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)] relative">
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer">
              <ImageIcon className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Image</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
          items={imageDropdownItems}
          menuWidth="w-48"
        />

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
              title="Insert Resizable Vector Shapes"
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

        <button
          type="button"
          onClick={onOpenDrawingModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Insert Freehand Drawing or Signature (Google Docs / Word Draw)"
        >
          <PenTool className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Drawing</span>
        </button>

        <button
          type="button"
          onClick={onOpenChartModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Insert Data Chart (Column, Bar, Line, Pie)"
        >
          <BarChart3 className="h-3.5 w-3.5 text-[var(--secondary)]" />
          <span>Chart</span>
        </button>
      </div>

      {/* 4. Text Box, Callout, Equation, Symbols, Code, Date */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium cursor-pointer">
              <Type className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Text Box</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
          items={textBoxDropdownItems}
          menuWidth="w-64"
        />

        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer">
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
          onClick={onOpenEquationModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Insert Mathematical Equation"
        >
          <Sigma className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Equation</span>
        </button>

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

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Code Block"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>Code</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const stamp = new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            editor.chain().focus().insertContent(stamp).run();
          }}
          className="hidden xl:flex h-7 items-center gap-1 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Insert Current Date"
        >
          <Calendar className="h-3.5 w-3.5 opacity-70" />
          <span>Date</span>
        </button>
      </div>

      {/* 5. Links, Citations, Header/Footer & Page Numbers */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenLinkModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Insert Hyperlink"
        >
          <Link2 className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Link</span>
        </button>

        <button
          type="button"
          onClick={onOpenCitationModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Insert Citation"
        >
          <BookOpen className="h-3.5 w-3.5 text-[var(--secondary)]" />
          <span>Citation</span>
        </button>

        <button
          type="button"
          onClick={onOpenPageSetupModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
          title="Configure Header & Footer"
        >
          <Bookmark className="h-3.5 w-3.5 opacity-70" />
          <span>Header/Footer</span>
        </button>

        {onEnablePageNumbers && (
          <button
            type="button"
            onClick={onEnablePageNumbers}
            className="flex h-7 items-center gap-1 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
            title="Toggle Page Numbers in Footer"
          >
            <Hash className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Page #</span>
          </button>
        )}
      </div>

      <InputDialog
        isOpen={showImageUrlDialog}
        title="Insert Image from URL"
        fields={[
          {
            id: 'url',
            label: 'Image URL',
            type: 'url',
            placeholder: 'https://example.com/image.png',
          },
        ]}
        confirmLabel="Insert Image"
        onConfirm={(vals) => {
          const url = (vals.url || '').trim();
          if (url) {
            editor.chain().focus().setImage({ src: url }).run();
          }
          setShowImageUrlDialog(false);
        }}
        onCancel={() => setShowImageUrlDialog(false)}
      />
    </div>
  );
}
