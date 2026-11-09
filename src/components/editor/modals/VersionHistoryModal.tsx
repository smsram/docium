'use client';

import React, { useState } from 'react';
import { X, History, RotateCcw, Plus, Calendar, Bookmark } from 'lucide-react';
import { DocumentVersionSnapshot } from '@/lib/types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: DocumentVersionSnapshot[];
  currentWordCount: number;
  onSaveCurrentVersion: (title: string) => void;
  onRestoreVersion: (version: DocumentVersionSnapshot) => void;
}

export function VersionHistoryModal({
  isOpen,
  onClose,
  versions,
  currentWordCount,
  onSaveCurrentVersion,
  onRestoreVersion,
}: VersionHistoryModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersionSnapshot | null>(
    versions[0] || null
  );
  const [newVersionName, setNewVersionName] = useState('');
  const [isNaming, setIsNaming] = useState(false);

  if (!isOpen) return null;

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersionName.trim()) return;
    onSaveCurrentVersion(newVersionName.trim());
    setNewVersionName('');
    setIsNaming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-5 bg-[var(--surface-elevated)] shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <span>Version History & Snapshots</span>
              {currentWordCount !== undefined && (
                <span className="text-xs font-normal text-[var(--text-muted)]">({currentWordCount} words)</span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Versions list */}
          <div className="w-72 border-r border-[var(--border)] bg-[var(--surface-elevated)] flex flex-col shrink-0 text-xs">
            <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)]">
              {isNaming ? (
                <form onSubmit={handleCreateSnapshot} className="space-y-2">
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newVersionName}
                    onChange={(e) => setNewVersionName(e.target.value)}
                    placeholder="Version name (e.g. Pre-review draft)"
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs outline-none focus:border-[var(--primary)]"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsNaming(false)}
                      className="px-2 py-0.5 text-[11px] rounded text-[var(--text-muted)] hover:bg-[var(--accent)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-0.5 text-[11px] rounded bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)]"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsNaming(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] py-1.5 px-3 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary-light)] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Name current version</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {versions.length === 0 ? (
                <div className="p-4 text-center text-[var(--text-muted)] text-[11px] leading-relaxed">
                  No previous snapshots recorded yet. Click above to name and record your first version!
                </div>
              ) : (
                versions.map((ver) => {
                  const isSelected = selectedVersion?.id === ver.id;
                  const dateStr = new Date(ver.timestamp).toLocaleString();
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => setSelectedVersion(ver)}
                      className={`w-full text-left rounded-lg p-2.5 transition-all flex flex-col gap-1 border ${
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--surface)] shadow-xs'
                          : 'border-transparent hover:bg-[var(--accent)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[11px] text-[var(--text)] flex items-center gap-1.5 truncate">
                          {ver.isNamed ? (
                            <Bookmark className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                          ) : (
                            <History className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                          )}
                          <span className="truncate">{ver.title}</span>
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">
                          {ver.wordCount} words
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                        <Calendar className="h-2.5 w-2.5" />
                        <span>{dateStr}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="flex-1 flex flex-col bg-[var(--surface)] overflow-hidden">
            {selectedVersion ? (
              <>
                <div className="h-11 border-b border-[var(--border)] px-4 flex items-center justify-between bg-[var(--surface-elevated)] shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-[var(--text)]">{selectedVersion.title}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      ({new Date(selectedVersion.timestamp).toLocaleString()})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Restore version "${selectedVersion.title}"? Current unsaved work will be replaced.`)) {
                        onRestoreVersion(selectedVersion);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore this version
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 text-xs text-[var(--text)]">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedVersion.content }}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs">
                Select a version to preview its contents
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

