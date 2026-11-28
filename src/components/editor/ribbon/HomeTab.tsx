'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  X,
  IndentIncrease,
  IndentDecrease,
  CaseSensitive,
} from 'lucide-react';
import { ColorPickerPopover } from './ColorPickerPopover';
import { convertMarkdownAndLatexToHtml } from '../utils/markdownToHtml';
import { Select, SelectOption } from '@/components/ui/Select';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Popover } from '@/components/ui/Popover';
import {
  FONT_FAMILY_SELECT_OPTIONS,
  FONT_SIZE_SELECT_OPTIONS,
  resolveFontFamilyValue,
  normalizeFontSizeToPt,
  ensureGoogleFontLoaded,
  preloadPopularGoogleFonts,
} from '@/lib/editor/fontCatalog';
import {
  searchProseMirrorDoc,
  replaceTextInRange,
  replaceAllMatches,
} from '@/lib/editor/documentSearch';

interface HomeTabProps {
  editor: Editor | null;
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
}

const HEADING_OPTIONS: SelectOption[] = [
  { value: 'p', label: 'Normal text' },
  { value: '1', label: 'Heading 1', badge: 'H1' },
  { value: '2', label: 'Heading 2', badge: 'H2' },
  { value: '3', label: 'Heading 3', badge: 'H3' },
  { value: '4', label: 'Heading 4', badge: 'H4' },
  { value: '5', label: 'Heading 5', badge: 'H5' },
  { value: '6', label: 'Heading 6', badge: 'H6' },
];

const HEADING_DEFAULT_PT: Record<string, number> = {
  '1': 20,
  '2': 15,
  '3': 12.5,
  '4': 11,
  '5': 10.5,
  '6': 10,
  p: 11,
};

export function HomeTab({ editor, formatPainterActive, onToggleFormatPainter }: HomeTabProps) {
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlightColor, setShowHighlightColor] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOpenFind = () => {
      if (editor && !editor.state.selection.empty) {
        const { from: sFrom, to: sTo } = editor.state.selection;
        const selText = editor.state.doc.textBetween(sFrom, sTo, ' ').trim();
        if (selText && selText.length <= 80) {
          setFindQuery(selText);
        }
      }
      setShowFindReplace(true);
      setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 40);
    };
    window.addEventListener('docium:open-find-replace', handleOpenFind);
    return () => window.removeEventListener('docium:open-find-replace', handleOpenFind);
  }, [editor]);

  // Trigger re-render on every selection or document transaction so Ribbon always reflects current selection styling
  const [, setSelectionTick] = useState(0);
  const savedSelectionRef = useRef<{ from: number; to: number; empty: boolean }>({
    from: 0,
    to: 0,
    empty: true,
  });

  useEffect(() => {
    preloadPopularGoogleFonts();
  }, []);

  useEffect(() => {
    if (!editor) return;

    const handleSync = () => {
      const { from, to, empty } = editor.state.selection;
      if (!empty || editor.isFocused) {
        savedSelectionRef.current = { from, to, empty };
      }
      setSelectionTick((t) => t + 1);
    };

    editor.on('selectionUpdate', handleSync);
    editor.on('transaction', handleSync);
    editor.on('update', handleSync);
    editor.on('focus', handleSync);
    editor.on('blur', handleSync);

    return () => {
      editor.off('selectionUpdate', handleSync);
      editor.off('transaction', handleSync);
      editor.off('update', handleSync);
      editor.off('focus', handleSync);
      editor.off('blur', handleSync);
    };
  }, [editor]);

  const findResults = useMemo(() => {
    if (!editor || !findQuery.trim()) return { matches: [], totalMatches: 0 };
    return searchProseMirrorDoc(editor.state.doc, {
      query: findQuery,
      caseSensitive,
    });
  }, [editor, findQuery, caseSensitive, editor?.state.doc]);

  // Sync Find & Replace highlights on the editor canvas without stealing input focus
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (!showFindReplace || !findQuery.trim() || findResults.matches.length === 0) {
      editor.commands.clearFindHighlight?.();
      return;
    }
    const bounded = Math.max(0, Math.min(activeMatchIdx, findResults.matches.length - 1));
    editor.commands.setFindHighlight?.(
      findResults.matches.map((m) => ({ from: m.from, to: m.to })),
      bounded
    );
    const raf = requestAnimationFrame(() => {
      const activeEl = document.querySelector('[data-docium-active-match="true"]') as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [editor, showFindReplace, findQuery, findResults, activeMatchIdx]);

  if (!editor) return null;

  // Helper that restores non-empty selection if a popover/search input briefly took focus
  const runChainWithSelection = (callback: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    const chain = editor.chain().focus();
    const currentSel = editor.state.selection;
    if (currentSel.empty && !savedSelectionRef.current.empty) {
      const maxPos = editor.state.doc.content.size;
      const from = Math.max(0, Math.min(savedSelectionRef.current.from, maxPos));
      const to = Math.max(from, Math.min(savedSelectionRef.current.to, maxPos));
      if (from === 0 && to === maxPos) {
        chain.selectAll();
      } else if (to > from) {
        chain.setTextSelection({ from, to });
      }
    }
    callback(chain).run();
  };

  // Inspect active styling attributes at cursor or across selected text range
  const { from, to, empty } = editor.state.selection;

  const getActiveHeadingValue = (): string => {
    if (editor.isActive('heading', { level: 1 })) return '1';
    if (editor.isActive('heading', { level: 2 })) return '2';
    if (editor.isActive('heading', { level: 3 })) return '3';
    if (editor.isActive('heading', { level: 4 })) return '4';
    if (editor.isActive('heading', { level: 5 })) return '5';
    if (editor.isActive('heading', { level: 6 })) return '6';
    return 'p';
  };

  const activeHeadingVal = getActiveHeadingValue();
  const fallbackFontSizePt = HEADING_DEFAULT_PT[activeHeadingVal] || 11;

  // Inspect marks in selection (supports multi-node selections where getAttributes at top level may return empty)
  let detectedFontFamily: string | null = editor.getAttributes('fontFamily').font || null;
  let detectedFontSize: string | null = editor.getAttributes('fontSize').size || null;
  let detectedTextColor: string | null = editor.getAttributes('textStyle').color || null;
  let detectedHighlightColor: string | null = editor.getAttributes('highlight').color || null;
  let detectedLineHeight: string | null =
    editor.getAttributes('paragraph').lineHeight ||
    editor.getAttributes('heading').lineHeight ||
    null;
  let detectedMarginTop: string | null =
    editor.getAttributes('paragraph').marginTop ||
    editor.getAttributes('heading').marginTop ||
    null;
  let detectedMarginBottom: string | null =
    editor.getAttributes('paragraph').marginBottom ||
    editor.getAttributes('heading').marginBottom ||
    null;
  let detectedTextAlign: string | null =
    editor.getAttributes('paragraph').textAlign ||
    editor.getAttributes('heading').textAlign ||
    null;

  if (!empty) {
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        if (!detectedLineHeight && node.attrs.lineHeight) {
          detectedLineHeight = String(node.attrs.lineHeight);
        }
        if (!detectedMarginTop && node.attrs.marginTop) {
          detectedMarginTop = String(node.attrs.marginTop);
        }
        if (!detectedMarginBottom && node.attrs.marginBottom) {
          detectedMarginBottom = String(node.attrs.marginBottom);
        }
        if (!detectedTextAlign && node.attrs.textAlign) {
          detectedTextAlign = String(node.attrs.textAlign);
        }
      }
      if (node.isText && node.marks?.length) {
        for (const mark of node.marks) {
          if (mark.type.name === 'fontFamily' && !detectedFontFamily && mark.attrs.font) {
            detectedFontFamily = String(mark.attrs.font);
          }
          if (mark.type.name === 'fontSize' && !detectedFontSize && mark.attrs.size) {
            detectedFontSize = String(mark.attrs.size);
          }
          if (mark.type.name === 'textStyle' && !detectedTextColor && mark.attrs.color) {
            detectedTextColor = String(mark.attrs.color);
          }
          if (mark.type.name === 'highlight' && !detectedHighlightColor && mark.attrs.color) {
            detectedHighlightColor = String(mark.attrs.color);
          }
        }
      }
    });
  }

  const currentFontFamily = resolveFontFamilyValue(detectedFontFamily);
  const currentFontSizePtStr = normalizeFontSizeToPt(detectedFontSize, fallbackFontSizePt);
  const currentFontSizeNum = parseFloat(currentFontSizePtStr) || fallbackFontSizePt;

  // Ensure currentFontSizePtStr is always present in font size dropdown options
  const fontSizeOptions: SelectOption[] = FONT_SIZE_SELECT_OPTIONS.some(
    (opt) => opt.value === currentFontSizePtStr
  )
    ? FONT_SIZE_SELECT_OPTIONS
    : [
        ...FONT_SIZE_SELECT_OPTIONS,
        { label: String(currentFontSizeNum), value: currentFontSizePtStr },
      ].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

  // Ensure currentFontFamily is always present in font family dropdown options
  const fontFamilyOptions: SelectOption[] = FONT_FAMILY_SELECT_OPTIONS.some(
    (opt) => opt.value === currentFontFamily
  )
    ? FONT_FAMILY_SELECT_OPTIONS
    : [
        {
          label: currentFontFamily.split(',')[0].replace(/['"]/g, '').trim(),
          value: currentFontFamily,
        },
        ...FONT_FAMILY_SELECT_OPTIONS,
      ];

  const activeLineHeight = detectedLineHeight
    ? detectedLineHeight === '1'
      ? '1.0'
      : detectedLineHeight === '2'
      ? '2.0'
      : detectedLineHeight
    : '1.5';

  const activeAlign =
    editor.isActive({ textAlign: 'center' }) || detectedTextAlign === 'center'
      ? 'center'
      : editor.isActive({ textAlign: 'right' }) || detectedTextAlign === 'right'
      ? 'right'
      : editor.isActive({ textAlign: 'justify' }) || detectedTextAlign === 'justify'
      ? 'justify'
      : 'left';

  const handleHeadingChange = (val: string) => {
    if (val === 'p') {
      runChainWithSelection((chain) => chain.setParagraph());
    } else {
      const level = parseInt(val, 10) as 1 | 2 | 3 | 4 | 5 | 6;
      runChainWithSelection((chain) => chain.setHeading({ level }));
    }
  };

  const handleChangeCase = (mode: 'upper' | 'lower' | 'title' | 'sentence') => {
    const sel = editor.state.selection;
    const fromPos = !sel.empty ? sel.from : savedSelectionRef.current.from;
    const toPos = !sel.empty ? sel.to : savedSelectionRef.current.to;
    if (toPos <= fromPos) return;
    const text = editor.state.doc.textBetween(fromPos, toPos, ' ');
    if (!text) return;
    let transformed = text;
    if (mode === 'upper') transformed = text.toUpperCase();
    else if (mode === 'lower') transformed = text.toLowerCase();
    else if (mode === 'title') {
      transformed = text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    } else if (mode === 'sentence') {
      transformed = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }
    editor.chain().focus().insertContentAt({ from: fromPos, to: toPos }, transformed).setTextSelection({ from: fromPos, to: fromPos + transformed.length }).run();
  };

  const changeCaseItems: DropdownItem[] = [
    { id: 'cc-sentence', label: 'Sentence case.', onClick: () => handleChangeCase('sentence') },
    { id: 'cc-lower', label: 'lowercase', onClick: () => handleChangeCase('lower') },
    { id: 'cc-upper', label: 'UPPERCASE', onClick: () => handleChangeCase('upper') },
    { id: 'cc-title', label: 'Capitalize Each Word', onClick: () => handleChangeCase('title') },
  ];

  const handleFontSizeChange = (delta: number) => {
    const nextSize = Math.max(8, Math.min(96, Math.round((currentFontSizeNum + delta) * 2) / 2));
    runChainWithSelection((chain) => chain.setFontSize(`${nextSize}pt`));
  };

  const handleCut = async () => {
    const { from: selFrom, to: selTo } = editor.state.selection;
    if (selFrom === selTo) return;
    const selectedText = editor.state.doc.textBetween(selFrom, selTo, '\n');
    await navigator.clipboard.writeText(selectedText);
    editor.chain().focus().deleteSelection().run();
  };

  const handleCopy = async () => {
    const { from: selFrom, to: selTo } = editor.state.selection;
    if (selFrom === selTo) return;
    const selectedText = editor.state.doc.textBetween(selFrom, selTo, '\n');
    await navigator.clipboard.writeText(selectedText);
  };

  const handlePaste = async () => {
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
          // Fall back to readText
        }
      }
      if (!clipboardText) {
        clipboardText = await navigator.clipboard.readText();
      }
      const hasMarkdownOrLatex = Boolean(
        clipboardText &&
          /(?:\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|^#{1,6}\s|^[-*+]\s|^\d+\.\s|^>\s|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\d)[^$\n]+\$)/m.test(
            clipboardText
          )
      );
      if (hasMarkdownOrLatex && clipboardText) {
        editor.chain().focus().insertContent(convertMarkdownAndLatexToHtml(clipboardText)).run();
      } else if (clipboardHtml.trim()) {
        editor.chain().focus().insertContent(clipboardHtml).run();
      } else if (clipboardText) {
        editor.chain().focus().insertContent(clipboardText).run();
      }
    } catch {
      editor.chain().focus().run();
    }
  };

  const jumpToMatch = (idx: number) => {
    if (findResults.matches.length === 0) return;
    const bounded = ((idx % findResults.matches.length) + findResults.matches.length) % findResults.matches.length;
    setActiveMatchIdx(bounded);
    const match = findResults.matches[bounded];
    if (match) {
      savedSelectionRef.current = { from: match.from, to: match.to, empty: false };
      editor.commands.setFindHighlight?.(
        findResults.matches.map((m) => ({ from: m.from, to: m.to })),
        bounded
      );
      requestAnimationFrame(() => {
        const activeEl = document.querySelector('[data-docium-active-match="true"]') as HTMLElement | null;
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } else {
          editor.chain().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run();
        }
      });
    }
  };

  const handleReplaceCurrent = () => {
    if (findResults.matches.length === 0) return;
    const idx = Math.min(activeMatchIdx, findResults.matches.length - 1);
    const match = findResults.matches[idx];
    if (match) {
      replaceTextInRange(editor, { from: match.from, to: match.to }, replaceQuery, { plainTextOnly: true });
    }
  };

  const handleReplaceAll = () => {
    if (!findQuery.trim()) return;
    replaceAllMatches(editor, findQuery, replaceQuery, { caseSensitive, plainTextOnly: true });
    setActiveMatchIdx(0);
  };

  const hasSpaceBefore = Boolean(detectedMarginTop && parseFloat(detectedMarginTop) > 0);
  const hasSpaceAfter = Boolean(detectedMarginBottom && parseFloat(detectedMarginBottom) > 0);

  const lineSpacingDropdownItems: DropdownItem[] = [
    {
      id: 'ls-1.0',
      label: 'Single (1.0)',
      checked: activeLineHeight === '1.0',
      onClick: () => runChainWithSelection((chain) => chain.setLineHeight('1.0')),
    },
    {
      id: 'ls-1.15',
      label: '1.15 Spacing',
      checked: activeLineHeight === '1.15',
      onClick: () => runChainWithSelection((chain) => chain.setLineHeight('1.15')),
    },
    {
      id: 'ls-1.5',
      label: '1.5 Spacing',
      checked: activeLineHeight === '1.5',
      onClick: () => runChainWithSelection((chain) => chain.setLineHeight('1.5')),
    },
    {
      id: 'ls-2.0',
      label: 'Double (2.0)',
      checked: activeLineHeight === '2.0',
      onClick: () => runChainWithSelection((chain) => chain.setLineHeight('2.0')),
    },
    {
      id: 'para-before',
      label: hasSpaceBefore ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph',
      checked: hasSpaceBefore,
      separator: true,
      onClick: () => {
        runChainWithSelection((chain) =>
          chain.setParagraphSpacing({ marginTop: hasSpaceBefore ? null : '14px' })
        );
      },
    },
    {
      id: 'para-after',
      label: hasSpaceAfter ? 'Remove Space After Paragraph' : 'Add Space After Paragraph',
      checked: hasSpaceAfter,
      onClick: () => {
        runChainWithSelection((chain) =>
          chain.setParagraphSpacing({ marginBottom: hasSpaceAfter ? null : '14px' })
        );
      },
    },
  ];

  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Clipboard Group */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={handleCut}
          disabled={editor.state.selection.empty}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30"
          title="Cut (Ctrl+X)"
        >
          <Scissors className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={handleCopy}
          disabled={editor.state.selection.empty}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30"
          title="Copy (Ctrl+C)"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={handlePaste}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)]"
          title="Paste (Ctrl+V)"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
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
        {/* Searchable Google Fonts + Microsoft Word Font Family Dropdown */}
        <div className="w-36">
          <Select
            size="xs"
            value={currentFontFamily}
            onChange={(val) => {
              if (val) {
                ensureGoogleFontLoaded(val);
                runChainWithSelection((chain) => chain.setFontFamily(val));
              } else {
                runChainWithSelection((chain) => chain.unsetFontFamily());
              }
            }}
            options={fontFamilyOptions}
            placeholder="Font Family"
            menuWidth="w-56"
            searchable
            searchPlaceholder="Search Google & Word fonts..."
            optionStyle={(opt) => ({ fontFamily: opt.value })}
          />
        </div>

        {/* Custom Font Size Dropdown & Steppers */}
        <div className="flex items-center rounded border border-[var(--border)] bg-[var(--surface-elevated)] h-7">
          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => handleFontSizeChange(-1)}
            className="flex h-full w-5 items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
            title="Decrease font size"
          >
            <Minus className="h-2.5 w-2.5" />
          </button>
          <div className="w-16">
            <Select
              size="xs"
              value={currentFontSizePtStr}
              onChange={(val) => {
                runChainWithSelection((chain) => chain.setFontSize(val));
              }}
              options={fontSizeOptions}
              placeholder="11"
              triggerClassName="border-0 bg-transparent px-1 font-mono text-center justify-center"
              menuWidth="w-24"
            />
          </div>
          <button
            type="button"
            onMouseDown={preventFocusLoss}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleBold())}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleItalic())}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleUnderline())}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleStrike())}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleSubscript())}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleSuperscript())}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.toggleCode())}
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

        {/* Text color and Highlight color with active color indicators */}
        <div className="flex items-center gap-0.5">
          <Popover
            isOpen={showTextColor}
            onClose={() => setShowTextColor(false)}
            trigger={
              <button
                type="button"
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  setShowTextColor(!showTextColor);
                  setShowHighlightColor(false);
                }}
                className="flex flex-col h-7 items-center justify-center rounded px-1.5 hover:bg-[var(--accent)] text-[var(--text)] border border-[var(--border)] bg-[var(--surface-elevated)] cursor-pointer"
                title="Text Color"
              >
                <Baseline className="h-3.5 w-3.5" />
                <span
                  className="h-0.5 w-3.5 rounded-full mt-0.5"
                  style={{ backgroundColor: detectedTextColor || 'var(--primary)' }}
                />
              </button>
            }
          >
            <ColorPickerPopover
              currentColor={detectedTextColor || undefined}
              onSelectColor={(color) => {
                runChainWithSelection((chain) => {
                  const c = chain.setColor(color);
                  return editor.isActive('blockquote')
                    ? c.updateAttributes('blockquote', { borderColor: color })
                    : c;
                });
                setShowTextColor(false);
              }}
              onClear={() => {
                runChainWithSelection((chain) => {
                  const c = chain.unsetColor();
                  return editor.isActive('blockquote')
                    ? c.updateAttributes('blockquote', { borderColor: null })
                    : c;
                });
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
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  setShowHighlightColor(!showHighlightColor);
                  setShowTextColor(false);
                }}
                className="flex flex-col h-7 items-center justify-center rounded px-1.5 hover:bg-[var(--accent)] text-[var(--text)] border border-[var(--border)] bg-[var(--surface-elevated)] cursor-pointer"
                title="Highlight Color"
              >
                <Highlighter className="h-3.5 w-3.5 text-amber-500" />
                <span
                  className="h-0.5 w-3.5 rounded-full mt-0.5"
                  style={{ backgroundColor: detectedHighlightColor || '#f59e0b' }}
                />
              </button>
            }
          >
            <ColorPickerPopover
              isHighlight
              onSelectColor={(color) => {
                runChainWithSelection((chain) => chain.setHighlight({ color }));
                setShowHighlightColor(false);
              }}
              onClear={() => {
                runChainWithSelection((chain) => chain.unsetHighlight());
                setShowHighlightColor(false);
              }}
            />
          </Popover>

          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.unsetAllMarks().unsetLineHeight())}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-rose-600"
            title="Clear formatting"
          >
            <RemoveFormatting className="h-3.5 w-3.5" />
          </button>

          <Dropdown
            trigger={
              <div
                onMouseDown={preventFocusLoss}
                className="flex h-7 items-center justify-center rounded px-1.5 hover:bg-[var(--accent)] text-[var(--text)] cursor-pointer"
                title="Change Case (UPPERCASE, lowercase, Title Case)"
              >
                <CaseSensitive className="h-3.5 w-3.5" />
              </div>
            }
            items={changeCaseItems}
            menuWidth="w-44"
          />
        </div>
      </div>

      {/* 3. Paragraph Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        {/* Custom Heading Dropdown */}
        <div className="w-28">
          <Select
            size="xs"
            value={activeHeadingVal}
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
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.setTextAlign('left'))}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              activeAlign === 'left'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Align Left"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.setTextAlign('center'))}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              activeAlign === 'center'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Align Center"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.setTextAlign('right'))}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              activeAlign === 'right'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'hover:bg-[var(--accent)]'
            }`}
            title="Align Right"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => runChainWithSelection((chain) => chain.setTextAlign('justify'))}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              activeAlign === 'justify'
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
            <div
              onMouseDown={preventFocusLoss}
              className="flex h-7 items-center gap-1 rounded px-2 hover:bg-[var(--accent)] border border-[var(--border)] bg-[var(--surface-elevated)] font-mono text-[11px]"
              title={`Current Line Spacing: ${activeLineHeight}`}
            >
              <Space className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>{activeLineHeight}</span>
            </div>
          }
          items={lineSpacingDropdownItems}
          menuWidth="w-56"
        />

        {/* Decrease / Increase Indent (Word & Google Docs) */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => {
              if (editor.isActive('listItem') || editor.isActive('taskItem')) {
                editor.chain().focus().liftListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem').run();
              } else {
                runChainWithSelection((chain) => chain.outdentParagraph());
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] cursor-pointer"
            title="Decrease Indent (Shift+Tab)"
          >
            <IndentDecrease className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={preventFocusLoss}
            onClick={() => {
              if (editor.isActive('listItem') || editor.isActive('taskItem')) {
                editor.chain().focus().sinkListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem').run();
              } else {
                runChainWithSelection((chain) => chain.indentParagraph());
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] cursor-pointer"
            title="Increase Indent (Tab)"
          >
            <IndentIncrease className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 4. Lists, Blockquote & Find/Replace Group */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => runChainWithSelection((chain) => chain.toggleBulletList())}
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
          onMouseDown={preventFocusLoss}
          onClick={() => runChainWithSelection((chain) => chain.toggleOrderedList())}
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
          onMouseDown={preventFocusLoss}
          onClick={() => runChainWithSelection((chain) => chain.toggleTaskList())}
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
          onMouseDown={preventFocusLoss}
          onClick={() => runChainWithSelection((chain) => chain.toggleBlockquote())}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            editor.isActive('blockquote')
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)]'
          }`}
          title="Blockquote"
        >
          <Quote className="h-3.5 w-3.5" />
        </button>

        {/* Find & Replace Tool */}
        <div className="pl-1.5 ml-1 border-l border-[var(--border)]">
          <Popover
            isOpen={showFindReplace}
            onClose={() => setShowFindReplace(false)}
            align="right"
            trigger={
              <button
                type="button"
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  if (!showFindReplace && !editor.state.selection.empty) {
                    const selText = editor.state.doc.textBetween(from, to, ' ').trim();
                    if (selText && selText.length <= 80) {
                      setFindQuery(selText);
                    }
                  }
                  setShowFindReplace(!showFindReplace);
                }}
                className={`flex h-7 items-center gap-1 rounded px-2 border transition-colors cursor-pointer ${
                  showFindReplace
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] text-[var(--text)]'
                }`}
                title="Find & Replace in Document"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Find & Replace</span>
              </button>
            }
          >
            <div className="w-72 p-3 flex flex-col gap-2.5 text-xs bg-[var(--surface)] rounded-xl">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Replace className="h-3.5 w-3.5 text-[var(--primary)]" />
                  Find & Replace
                </span>
                <button
                  type="button"
                  onClick={() => setShowFindReplace(false)}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--accent)] text-[var(--text-muted)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="relative flex items-center">
                  <input
                    ref={findInputRef}
                    type="text"
                    value={findQuery}
                    onChange={(e) => {
                      setFindQuery(e.target.value);
                      setActiveMatchIdx(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        jumpToMatch(activeMatchIdx + (e.shiftKey ? -1 : 1));
                      }
                    }}
                    placeholder="Find text in document..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] pl-2.5 pr-16 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
                  />
                  <span className="absolute right-2 text-[10px] font-mono text-[var(--text-muted)]">
                    {findQuery.trim()
                      ? `${findResults.totalMatches > 0 ? Math.min(activeMatchIdx + 1, findResults.totalMatches) : 0}/${findResults.totalMatches}`
                      : '0/0'}
                  </span>
                </div>

                <input
                  type="text"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleReplaceCurrent();
                    }
                  }}
                  placeholder="Replace with..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  Match case
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    disabled={findResults.totalMatches === 0}
                    onClick={() => jumpToMatch(activeMatchIdx - 1)}
                    className="h-6 w-6 flex items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] disabled:opacity-40"
                    title="Previous Match"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    disabled={findResults.totalMatches === 0}
                    onClick={() => jumpToMatch(activeMatchIdx + 1)}
                    className="h-6 w-6 flex items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] disabled:opacity-40"
                    title="Next Match"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onMouseDown={preventFocusLoss}
                  disabled={findResults.totalMatches === 0}
                  onClick={handleReplaceCurrent}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] py-1.5 text-xs font-medium hover:bg-[var(--accent)] disabled:opacity-40"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onMouseDown={preventFocusLoss}
                  disabled={findResults.totalMatches === 0}
                  onClick={handleReplaceAll}
                  className="flex-1 rounded-lg bg-[var(--primary)] text-white py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-40"
                >
                  Replace All
                </button>
              </div>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
}
