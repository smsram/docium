'use client';

import React, { useState } from 'react';
import { type Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Code,
  Highlighter,
  Baseline,
  RemoveFormatting,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Paintbrush,
  Copy,
  Scissors,
  ClipboardPaste,
  Plus,
  Minus,
  Space,
} from 'lucide-react';
import { ColorPickerPopover } from './ColorPickerPopover';
import { Select, SelectOption } from '@/components/ui/Select';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Popover } from '@/components/ui/Popover';

interface HomeTabProps {
  editor: Editor | null;
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
}

const FONT_FAMILY_OPTIONS: SelectOption[] = [
  { value: 'Inter, sans-serif', label: 'Inter (Default)' },
  { value: 'Geist, sans-serif', label: 'Geist Sans' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Merriweather, Georgia, serif', label: 'Merriweather' },
  { value: '"Playfair Display", Georgia, serif', label: 'Playfair Display' },
  { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
];

const FONT_SIZE_OPTIONS: SelectOption[] = [
  8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
].map((sz) => ({
  value: `${sz}pt`,
  label: `${sz}`,
}));

const HEADING_OPTIONS: SelectOption[] = [
  { value: 'p', label: 'Normal text' },
  { value: '1', label: 'Heading 1', badge: 'H1' },
  { value: '2', label: 'Heading 2', badge: 'H2' },
  { value: '3', label: 'Heading 3', badge: 'H3' },
  { value: '4', label: 'Heading 4', badge: 'H4' },
];

export function HomeTab({ editor, formatPainterActive, onToggleFormatPainter }: HomeTabProps) {
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlightColor, setShowHighlightColor] = useState(false);

  if (!editor) return null;

  // Active font size & family
  const currentFontSizeAttr = editor.getAttributes('fontSize').size || '11pt';
  const currentFontSizeNum = parseInt(currentFontSizeAttr, 10) || 11;
  const currentFontFamily = editor.getAttributes('fontFamily').font || 'Inter, sans-serif';

  // Active heading value
  const getActiveHeadingValue = () => {
    if (editor.isActive('heading', { level: 1 })) return '1';
    if (editor.isActive('heading', { level: 2 })) return '2';
    if (editor.isActive('heading', { level: 3 })) return '3';
    if (editor.isActive('heading', { level: 4 })) return '4';
    return 'p';
  };

  const handleHeadingChange = (val: string) => {
    if (val === 'p') {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: parseInt(val, 10) as 1 | 2 | 3 | 4 }).run();
    }
  };

  const handleFontSizeChange = (delta: number) => {
    const nextSize = Math.max(8, Math.min(96, currentFontSizeNum + delta));
    editor.chain().focus().setFontSize(`${nextSize}pt`).run();
  };

  const handleCut = async () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to, '\n');
    await navigator.clipboard.writeText(selectedText);
    editor.chain().focus().deleteSelection().run();
  };

  const handleCopy = async () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to, '\n');
    await navigator.clipboard.writeText(selectedText);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.chain().focus().insertContent(text).run();
      }
    } catch {
      alert('Clipboard access not granted. Use Ctrl+V / Cmd+V directly in the editor.');
    }
  };

  const lineSpacingDropdownItems: DropdownItem[] = [
    {
      id: 'ls-1.0',
      label: 'Single (1.0)',
      onClick: () => editor.chain().focus().setLineHeight('1.0').run(),
    },
    {
      id: 'ls-1.15',
      label: '1.15 Spacing',
      onClick: () => editor.chain().focus().setLineHeight('1.15').run(),
    },
    {
      id: 'ls-1.5',
      label: '1.5 Spacing',
      onClick: () => editor.chain().focus().setLineHeight('1.5').run(),
    },
    {
      id: 'ls-2.0',
      label: 'Double (2.0)',
      onClick: () => editor.chain().focus().setLineHeight('2.0').run(),
    },
    {
      id: 'para-before',
      label: 'Add Space Before Paragraph',
      separator: true,
      onClick: () => {
        editor.chain().focus().updateAttributes('paragraph', { style: 'margin-top: 14px' }).run();
      },
    },
    {
      id: 'para-after',
      label: 'Add Space After Paragraph',
      onClick: () => {
        editor.chain().focus().updateAttributes('paragraph', { style: 'margin-bottom: 14px' }).run();
      },
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Clipboard Group */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={handleCut}
          disabled={editor.state.selection.empty}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30"
          title="Cut (Ctrl+X)"
        >
          <Scissors className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={editor.state.selection.empty}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30"
          title="Copy (Ctrl+C)"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handlePaste}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)]"
          title="Paste (Ctrl+V)"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleFormatPainter}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            formatPainterActive
              ? 'bg-[var(--primary)] text-white shadow-xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Format Painter (Copy formatting from selection and click to apply)"
        >
          <Paintbrush className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 2. Typography Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        {/* Custom Font Family Dropdown */}
        <div className="w-32">
          <Select
            size="xs"
            value={currentFontFamily}
            onChange={(val) => {
              if (val) editor.chain().focus().setFontFamily(val).run();
              else editor.chain().focus().unsetFontFamily().run();
            }}
            options={FONT_FAMILY_OPTIONS}
            placeholder="Font Family"
            menuWidth="w-48"
          />
        </div>

        {/* Custom Font Size Dropdown & Steppers */}
        <div className="flex items-center rounded border border-[var(--border)] bg-[var(--surface-elevated)] h-7">
          <button
            type="button"
            onClick={() => handleFontSizeChange(-1)}
            className="flex h-full w-5 items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
            title="Decrease font size"
          >
            <Minus className="h-2.5 w-2.5" />
          </button>
          <div className="w-16">
            <Select
              size="xs"
              value={`${currentFontSizeNum}pt`}
              onChange={(val) => {
                editor.chain().focus().setFontSize(val).run();
              }}
              options={FONT_SIZE_OPTIONS}
              placeholder="11"
              triggerClassName="border-0 bg-transparent px-1 font-mono text-center justify-center"
              menuWidth="w-20"
            />
          </div>
          <button
            type="button"
            onClick={() => handleFontSizeChange(1)}
            className="flex h-full w-5 items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
            title="Increase font size"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        </div>

        {/* Inline styles */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`flex h-7 w-7 items-center justify-center rounded font-bold transition-colors ${
              editor.isActive('bold')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`flex h-7 w-7 items-center justify-center rounded italic transition-colors ${
              editor.isActive('italic')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive('underline')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive('strike')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Strikethrough"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive('subscript')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Subscript"
          >
            <SubscriptIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive('superscript')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Superscript"
          >
            <SuperscriptIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive('code')
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Inline Code"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Text color and Highlight color with portaled popovers */}
        <div className="flex items-center gap-0.5">
          <Popover
            isOpen={showTextColor}
            onClose={() => setShowTextColor(false)}
            trigger={
              <button
                type="button"
                onClick={() => {
                  setShowTextColor(!showTextColor);
                  setShowHighlightColor(false);
                }}
                className="flex h-7 items-center gap-1 rounded px-1.5 hover:bg-[var(--accent)] text-[var(--text)] border border-[var(--border)] bg-[var(--surface-elevated)] cursor-pointer"
                title="Text Color"
              >
                <Baseline className="h-3.5 w-3.5 text-[var(--primary)]" />
              </button>
            }
          >
            <ColorPickerPopover
              onSelectColor={(color) => {
                editor.chain().focus().setColor(color).run();
                setShowTextColor(false);
              }}
              onClear={() => {
                editor.chain().focus().unsetColor().run();
                setShowTextColor(false);
              }}
            />
          </Popover>

          <Popover
            isOpen={showHighlightColor}
            onClose={() => setShowHighlightColor(false)}
            trigger={
              <button
                type="button"
                onClick={() => {
                  setShowHighlightColor(!showHighlightColor);
                  setShowTextColor(false);
                }}
                className="flex h-7 items-center gap-1 rounded px-1.5 hover:bg-[var(--accent)] text-[var(--text)] border border-[var(--border)] bg-[var(--surface-elevated)] cursor-pointer"
                title="Highlight Color"
              >
                <Highlighter className="h-3.5 w-3.5 text-amber-500" />
              </button>
            }
          >
            <ColorPickerPopover
              isHighlight
              onSelectColor={(color) => {
                editor.chain().focus().setHighlight({ color }).run();
                setShowHighlightColor(false);
              }}
              onClear={() => {
                editor.chain().focus().unsetHighlight().run();
                setShowHighlightColor(false);
              }}
            />
          </Popover>

          <button
            type="button"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-rose-600"
            title="Clear formatting"
          >
            <RemoveFormatting className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Paragraph Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        {/* Custom Heading Dropdown */}
        <div className="w-28">
          <Select
            size="xs"
            value={getActiveHeadingValue()}
            onChange={handleHeadingChange}
            options={HEADING_OPTIONS}
            placeholder="Style"
            menuWidth="w-40"
          />
        </div>

        {/* Alignment */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive({ textAlign: 'left' })
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Align Left"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive({ textAlign: 'center' })
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Align Center"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive({ textAlign: 'right' })
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Align Right"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              editor.isActive({ textAlign: 'justify' })
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Justify"
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Custom Line & Paragraph Spacing Dropdown */}
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1 rounded px-2 hover:bg-[var(--accent)] border border-[var(--border)] bg-[var(--surface-elevated)] font-mono text-[11px]">
              <Space className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Spacing</span>
            </div>
          }
          items={lineSpacingDropdownItems}
          menuWidth="w-56"
        />
      </div>

      {/* 4. Lists & Blockquote Group */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            editor.isActive('bulletList')
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)]'
          }`}
          title="Bulleted List"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            editor.isActive('orderedList')
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)]'
          }`}
          title="Numbered List"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            editor.isActive('taskList')
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)]'
          }`}
          title="Task Checklist"
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            editor.isActive('blockquote')
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)]'
          }`}
          title="Blockquote"
        >
          <Quote className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
