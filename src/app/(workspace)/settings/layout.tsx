'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  Palette,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const settingsTabs = [
    { label: 'AI Providers', href: '/settings/ai', icon: Sparkles },
    { label: 'Appearance', href: '/settings/appearance', icon: Palette },
    { label: 'General', href: '/settings/general', icon: SlidersHorizontal },
    { label: 'Integrations', href: '/settings/integrations', icon: Layers },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Settings Header */}
      <div className="pb-4 border-b border-[var(--border)]">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Settings</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Manage AI providers, reasoning models, visual aesthetics, and integrations.
        </p>

        {/* Tab navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-4 pb-1 text-xs">
          {settingsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[var(--primary)] text-white shadow-2xs font-semibold'
                    : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Settings Tab Content */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
