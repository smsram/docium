'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Layers, Check, ExternalLink, Sparkles, Globe, ImageIcon } from 'lucide-react';

export default function IntegrationsSettingsPage() {
  const [connected, setConnected] = useState<Record<string, boolean>>({
    github: true,
    slack: true,
    gdrive: false,
    notion: false,
    figma: false,
  });

  const toggleConnect = (key: string) => {
    setConnected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const integrations = [
    {
      id: 'github',
      name: 'GitHub Sync & PR Workflows',
      desc: 'Commit Markdown documentation directly into git repositories with auto-versioning.',
    },
    {
      id: 'slack',
      name: 'Slack Notification Broadcasts',
      desc: 'Receive AI document summaries and collaborative mention alerts in team channels.',
    },
    {
      id: 'gdrive',
      name: 'Google Drive Two-Way Sync',
      desc: 'Bidirectional sync for Docs, Sheets, and Slides backup in cloud storage.',
    },
    {
      id: 'notion',
      name: 'Notion Workspace Importer',
      desc: 'Lossless migration of Notion databases, nested pages, and callout blocks.',
    },
    {
      id: 'figma',
      name: 'Figma Live Embeds',
      desc: 'Embed responsive live interactive Figma frames directly inside A4 documents.',
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text)]">Ecosystem Integrations</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Connect your engineering, messaging, and cloud design tools directly into Docium.
        </p>
      </div>

      {/* AI & Search Providers Banner */}
      <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-light)]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-white shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text)]">
              AI Models, Internet Search &amp; Image Generation
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Looking to configure your OpenAI, Claude, Gemini, Brave Search, or Imagen credentials?
            </p>
          </div>
        </div>

        <Link
          href="/settings/ai"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-hover)] transition-all shrink-0 self-start sm:self-auto shadow-2xs"
        >
          <span>Configure AI</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-3">
        {integrations.map((item) => {
          const isConn = connected[item.id];
          return (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--border)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)] hover:border-[var(--border-subtle)] transition-all"
            >
              <div>
                <h3 className="text-xs font-semibold text-[var(--text)]">{item.name}</h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.desc}</p>
              </div>

              <button
                onClick={() => toggleConnect(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                  isConn
                    ? 'border border-[var(--border)] bg-[var(--accent)] text-[var(--text)] hover:bg-[var(--border)]'
                    : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shadow-2xs'
                }`}
              >
                {isConn ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
