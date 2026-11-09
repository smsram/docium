'use client';

import React from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { Toggle } from '@/components/ui/Toggle';
import { Sun, Moon, Laptop, Type, Check } from 'lucide-react';

export default function AppearanceSettingsPage() {
  const { theme, setTheme, appearanceSettings, updateAppearanceSettings } = useWorkspaceStore();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text)]">Appearance &amp; Typography</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Customize the visual aesthetic, typography baseline, and workspace density.
        </p>
      </div>

      {/* Theme Cards */}
      <div>
        <label className="text-xs font-semibold text-[var(--text)] block mb-3">Workspace Theme</label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setTheme('light')}
            className={`flex flex-col items-center rounded-xl border p-4 text-center transition-all ${
              theme === 'light'
                ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-xs'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Sun className="h-6 w-6 mb-2" />
            <span className="text-xs">Light Theme</span>
            <span className="text-[10px] text-[var(--text-muted)] mt-0.5">#F7F7F2 Clean Canvas</span>
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={`flex flex-col items-center rounded-xl border p-4 text-center transition-all ${
              theme === 'dark'
                ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-xs'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Moon className="h-6 w-6 mb-2" />
            <span className="text-xs">Dark Theme</span>
            <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Forest &amp; Slate Minimal</span>
          </button>

          <button
            onClick={() => setTheme('system')}
            className={`flex flex-col items-center rounded-xl border p-4 text-center transition-all ${
              theme === 'system'
                ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-xs'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Laptop className="h-6 w-6 mb-2" />
            <span className="text-xs">System Default</span>
            <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Follow OS Preference</span>
          </button>
        </div>
      </div>

      {/* Typography Selection */}
      <div className="pt-4 border-t border-[var(--border)] space-y-3">
        <label className="text-xs font-semibold text-[var(--text)] block">Primary Document Typography</label>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div
            onClick={() => updateAppearanceSettings({ fontFamily: 'geist' })}
            className={`rounded-lg border p-3 cursor-pointer transition-all ${
              appearanceSettings.fontFamily === 'geist'
                ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                : 'border-[var(--border)]'
            }`}
          >
            <span className="font-semibold text-xs block text-[var(--text)]">Geist Sans (Vercel)</span>
            <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">
              Precision engineered geometric typeface for deep productivity.
            </span>
          </div>

          <div
            onClick={() => updateAppearanceSettings({ fontFamily: 'inter' })}
            className={`rounded-lg border p-3 cursor-pointer transition-all ${
              appearanceSettings.fontFamily === 'inter'
                ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                : 'border-[var(--border)]'
            }`}
          >
            <span className="font-semibold text-xs block text-[var(--text)]">Inter (Modern Standard)</span>
            <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">
              Highly legible screen font optimized for dense paragraphs.
            </span>
          </div>
        </div>
      </div>

      {/* Compact Mode */}
      <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-[var(--text)] block">Compact Interface Mode</span>
          <span className="text-[11px] text-[var(--text-muted)]">
            Reduce sidebar and toolbar padding by 20% for smaller laptop displays.
          </span>
        </div>
        <Toggle
          checked={appearanceSettings.compactMode}
          onChange={(checked) => updateAppearanceSettings({ compactMode: checked })}
        />
      </div>
    </div>
  );
}
