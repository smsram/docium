'use client';

import React, { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import {
  SlidersHorizontal,
  Clock,
  Download,
  RotateCcw,
  Check,
  FileText,
  Table,
  Presentation,
  CheckCircle2,
} from 'lucide-react';

export default function GeneralSettingsPage() {
  const {
    appearanceSettings,
    updateAppearanceSettings,
    resetToSampleData,
    documents,
    sheets,
    slides,
  } = useWorkspaceStore();

  const [saved, setSaved] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const handleExportBackup = () => {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      documents,
      sheets,
      slides,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `docium-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    resetToSampleData();
    setResetConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="pb-4 border-b border-[var(--border)]">
        <h2 className="text-base font-semibold text-[var(--text)] tracking-tight">
          General Preferences
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Configure application defaults, autosave frequency, and data backup utilities.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>Preferences updated successfully.</span>
        </div>
      )}

      {/* Auto-save configuration */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Autosave Frequency</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Set how frequently changes are saved to your local storage while editing documents and sheets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {[1, 2, 5, 10].map((sec) => (
            <button
              key={sec}
              onClick={() => updateAppearanceSettings({ autoSaveInterval: sec })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                appearanceSettings.autoSaveInterval === sec
                  ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-2xs'
                  : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Every {sec}s
            </button>
          ))}
        </div>
      </div>

      {/* Data Backup & Export */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Workspace Data Backup</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Export a complete JSON snapshot of all your local documents, spreadsheets, presentations, and persistent AI conversations.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)] hover:border-[var(--primary)] transition-colors shadow-2xs"
          >
            <Download className="h-4 w-4 text-[var(--primary)]" />
            <span>Export Complete Workspace Archive</span>
          </button>
        </div>
      </div>

      {/* Reset Sample Data */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Reset Workspace</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Reset workspace documents and templates back to sample demonstration data.
          </p>
        </div>

        {resetConfirm ? (
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleReset}
              className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-700 transition-colors shadow-2xs"
            >
              Confirm Reset to Sample Data
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setResetConfirm(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-rose-500 hover:border-rose-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restore Default Sample Workspaces</span>
          </button>
        )}
      </div>
    </div>
  );
}

