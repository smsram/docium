'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useWorkspaceStore } from '@/lib/store';
import { WorkspaceAI } from '@/components/workspace/WorkspaceAI';
import {
  Table,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  DollarSign,
  Percent,
  Plus,
  Download,
  Share2,
  Check,
  RefreshCw,
  Search,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface SpreadsheetEditorProps {
  sheetDocId: string;
  showBackToHome?: boolean;
}

const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function SpreadsheetEditor({ sheetDocId, showBackToHome = false }: SpreadsheetEditorProps) {
  const { sheets, updateSheetCell, addSheetTab, getAiPanelState, updateAiPanelState } = useWorkspaceStore();
  const doc = sheets.find((s) => s.id === sheetDocId) || sheets[0];

  const [activeTabId, setActiveTabId] = useState(doc?.activeSheetId || doc?.sheets[0]?.id || 's1');
  const [selectedCell, setSelectedCell] = useState<string>('B2');
  const [editValue, setEditValue] = useState<string>('');

  const currentSheet = useMemo(() => {
    return doc?.sheets.find((s) => s.id === activeTabId) || doc?.sheets[0];
  }, [doc, activeTabId]);

  // Handle cell selection
  const handleCellClick = (coord: string) => {
    setSelectedCell(coord);
    const cell = currentSheet?.cells[coord];
    setEditValue(cell?.value || '');
  };

  // Evaluate simple formulas like =SUM(B2:B5)
  const computeCellValue = (raw: string): string => {
    if (!raw.startsWith('=')) return raw;
    try {
      const upper = raw.toUpperCase();
      if (upper.startsWith('=SUM(') && upper.endsWith(')')) {
        const range = upper.slice(5, -1).split(':');
        if (range.length === 2) {
          const startCol = range[0][0];
          const startRow = parseInt(range[0].slice(1), 10);
          const endRow = parseInt(range[1].slice(1), 10);
          let sum = 0;
          for (let r = startRow; r <= endRow; r++) {
            const val = parseFloat(currentSheet?.cells[`${startCol}${r}`]?.value || '0');
            if (!isNaN(val)) sum += val;
          }
          return sum.toLocaleString();
        }
      }
      if (upper.startsWith('=AVG(') && upper.endsWith(')')) {
        const range = upper.slice(5, -1).split(':');
        if (range.length === 2) {
          const startCol = range[0][0];
          const startRow = parseInt(range[0].slice(1), 10);
          const endRow = parseInt(range[1].slice(1), 10);
          let sum = 0;
          let count = 0;
          for (let r = startRow; r <= endRow; r++) {
            const val = parseFloat(currentSheet?.cells[`${startCol}${r}`]?.value || '0');
            if (!isNaN(val)) {
              sum += val;
              count++;
            }
          }
          return count > 0 ? (sum / count).toFixed(1) : '0';
        }
      }
    } catch {
      return '#ERR';
    }
    return raw;
  };

  const handleValueChange = (newVal: string) => {
    setEditValue(newVal);
    if (currentSheet) {
      updateSheetCell(doc.id, currentSheet.id, selectedCell, { value: newVal });
    }
  };

  const toggleFormat = (key: 'bold' | 'italic') => {
    if (!currentSheet) return;
    const existing = currentSheet.cells[selectedCell]?.[key];
    updateSheetCell(doc.id, currentSheet.id, selectedCell, { [key]: !existing });
  };

  const handleExportCsv = () => {
    if (!currentSheet) return;
    let csv = '';
    for (let r = 1; r <= currentSheet.rowCount; r++) {
      const row = COL_LETTERS.map((c) => `"${currentSheet.cells[`${c}${r}`]?.value || ''}"`);
      csv += row.join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <div className="flex items-center gap-2.5">
          {showBackToHome && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors mr-1 shrink-0"
              title="Back to home"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
          )}

          <Table className="h-4 w-4 text-[var(--secondary)]" />
          <span className="font-semibold text-sm text-[var(--text)] truncate max-w-[200px] sm:max-w-md">{doc?.title}</span>
          <span className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
            <Check className="h-3 w-3" /> Auto-calculated
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)] shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={() => {
              const currentMode = getAiPanelState(sheetDocId).mode;
              updateAiPanelState(sheetDocId, { mode: currentMode === 'docked' ? 'minimized' : 'docked' });
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              getAiPanelState(sheetDocId).mode === 'docked'
                ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-2xs'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
            title="Toggle Docium AI Panel"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Docium AI</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text)]">
        <button
          onClick={() => toggleFormat('bold')}
          className={`flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] ${
            currentSheet?.cells[selectedCell]?.bold ? 'bg-[var(--primary-light)] text-[var(--primary)] font-bold' : ''
          }`}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => toggleFormat('italic')}
          className={`flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] ${
            currentSheet?.cells[selectedCell]?.italic ? 'bg-[var(--primary-light)] text-[var(--primary)]' : ''
          }`}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--border)]" />

        <button
          onClick={() => {
            if (currentSheet) updateSheetCell(doc.id, currentSheet.id, selectedCell, { format: 'currency' });
          }}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)]"
          title="Format Currency"
        >
          <DollarSign className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            if (currentSheet) updateSheetCell(doc.id, currentSheet.id, selectedCell, { format: 'percent' });
          }}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)]"
          title="Format Percentage"
        >
          <Percent className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Formula Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs">
        <div className="flex h-7 w-12 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] font-mono font-bold text-[var(--primary)]">
          {selectedCell}
        </div>
        <span className="text-[var(--text-muted)] font-mono font-semibold">fx</span>
        <input
          type="text"
          value={editValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="Enter a value or formula (=SUM(B2:B5), =AVG(B2:B5))"
          className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)] font-mono"
        />
      </div>

      {/* Workspace Area: Grid Canvas + AI Sidecar */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Grid Canvas */}
          <div className="flex-1 overflow-auto bg-[var(--surface)] p-2">
            <table className="border-collapse table-fixed w-full text-xs">
              <thead>
                <tr>
                  <th className="w-12 h-7 bg-[var(--accent)] border border-[var(--border)] text-[var(--text-muted)] font-mono"></th>
                  {COL_LETTERS.map((col) => (
                    <th
                      key={col}
                      className="w-32 h-7 bg-[var(--accent)] border border-[var(--border)] text-[var(--text)] font-semibold text-center font-mono"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: currentSheet?.rowCount || 15 }).map((_, rIndex) => {
                  const rowNum = rIndex + 1;
                  return (
                    <tr key={rowNum}>
                      <td className="h-7 bg-[var(--accent)] border border-[var(--border)] text-center font-mono text-[var(--text-muted)] text-[10px]">
                        {rowNum}
                      </td>
                      {COL_LETTERS.map((col) => {
                        const coord = `${col}${rowNum}`;
                        const cell = currentSheet?.cells[coord];
                        const isSelected = selectedCell === coord;
                        const displayValue = cell?.value ? computeCellValue(cell.value) : '';

                        return (
                          <td
                            key={coord}
                            onClick={() => handleCellClick(coord)}
                            style={{ backgroundColor: cell?.bg }}
                            className={`h-7 border border-[var(--border)] px-2 truncate cursor-cell transition-colors font-sans ${
                              isSelected
                                ? 'ring-2 ring-[var(--primary)] ring-inset bg-emerald-50/20 z-10'
                                : 'hover:bg-[var(--accent)]'
                            } ${cell?.bold ? 'font-bold' : ''} ${cell?.italic ? 'italic' : ''}`}
                          >
                            {displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Sheet Tabs Bar */}
          <div className="flex items-center gap-1 border-t border-[var(--border)] bg-[var(--accent)] px-3 py-1 text-xs shrink-0">
            {doc?.sheets.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveTabId(s.id)}
                className={`rounded-t px-3 py-1.5 font-medium transition-colors ${
                  activeTabId === s.id
                    ? 'bg-[var(--surface)] text-[var(--primary)] border-t-2 border-[var(--primary)] font-semibold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {s.name}
              </button>
            ))}

            <button
              onClick={() => addSheetTab(doc.id, `Sheet ${doc.sheets.length + 1}`)}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
              title="Add New Sheet"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <WorkspaceAI
          workspaceId={sheetDocId}
          documentFormat="sheet"
          onApplyAction={(actionType, payload) => {
            if (actionType === 'create_table' || actionType === 'insert_cells') {
              if (currentSheet) {
                updateSheetCell(doc.id, currentSheet.id, 'B2', { value: '42,000' });
              }
            }
          }}
        />
      </div>
    </div>
  );
}
