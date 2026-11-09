'use client';

import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import * as echarts from 'echarts';
import {
  GitFork,
  BarChart3,
  Network,
  Share2,
  Code2,
  Eye,
  RefreshCw,
  Copy,
  Download,
  Sparkles,
} from 'lucide-react';

export type VisualizationType = 'mermaid' | 'echarts' | 'reactflow' | 'graphviz' | 'd3';

interface VisualizationViewerProps {
  initialType?: VisualizationType;
  title?: string;
}

const DEFAULT_MERMAID = `flowchart TD
    User([User Prompt / Instruction]) --> Gateway[Docium Gateway & Router]
    Gateway --> ContextManager[Context Vector Store]
    Gateway --> Sidecar[Multimodal AI Engine]
    Sidecar --> Tiptap[ProseMirror Document Editor]
    Sidecar --> ECharts[Interactive Data Charts]
    Sidecar --> Flow[React Flow Engine]
    Tiptap --> Output([Synthesized Production Artifact])
    ECharts --> Output
    Flow --> Output`;

const DEFAULT_GRAPHVIZ_SVG = `<svg viewBox="0 0 600 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#245C45" />
    </marker>
  </defs>
  <!-- Nodes -->
  <rect x="40" y="90" width="120" height="48" rx="6" fill="#EBF3EF" stroke="#245C45" stroke-width="2" />
  <text x="100" y="118" font-size="12" font-weight="600" fill="#171C19" text-anchor="middle">Input Source</text>
  
  <rect x="240" y="30" width="130" height="48" rx="6" fill="#F7F7F2" stroke="#398568" stroke-width="2" />
  <text x="305" y="58" font-size="12" font-weight="600" fill="#171C19" text-anchor="middle">Tokenizer (128k)</text>
  
  <rect x="240" y="150" width="130" height="48" rx="6" fill="#F7F7F2" stroke="#398568" stroke-width="2" />
  <text x="305" y="178" font-size="12" font-weight="600" fill="#171C19" text-anchor="middle">Vector Embeddings</text>
  
  <rect x="440" y="90" width="130" height="48" rx="6" fill="#245C45" />
  <text x="505" y="118" font-size="12" font-weight="600" fill="#FFFFFF" text-anchor="middle">Unified Output</text>
  
  <!-- Edges -->
  <line x1="160" y1="110" x2="235" y2="55" stroke="#245C45" stroke-width="2" marker-end="url(#arrow)" />
  <line x1="160" y1="120" x2="235" y2="170" stroke="#245C45" stroke-width="2" marker-end="url(#arrow)" />
  <line x1="370" y1="55" x2="435" y2="105" stroke="#245C45" stroke-width="2" marker-end="url(#arrow)" />
  <line x1="370" y1="170" x2="435" y2="120" stroke="#245C45" stroke-width="2" marker-end="url(#arrow)" />
</svg>`;

export function VisualizationViewer({
  initialType = 'mermaid',
  title = 'Architecture & Data Visualization',
}: VisualizationViewerProps) {
  const [activeType, setActiveType] = useState<VisualizationType>(initialType);
  const [code, setCode] = useState(DEFAULT_MERMAID);
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const [mermaidSvg, setMermaidSvg] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);

  const echartsRef = useRef<HTMLDivElement>(null);
  const echartsInstanceRef = useRef<echarts.ECharts | null>(null);

  // Initialize Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      fontFamily: 'inherit',
      securityLevel: 'loose',
    });
  }, []);

  // Render Mermaid diagrams
  useEffect(() => {
    if (activeType === 'mermaid' && mode === 'preview') {
      const renderMermaid = async () => {
        try {
          setRenderError(null);
          const uniqueId = `mermaid-render-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, code);
          setMermaidSvg(svg);
        } catch (err: any) {
          setRenderError('Error parsing Mermaid code: ' + (err.message || 'Syntax error'));
        }
      };
      renderMermaid();
    }
  }, [code, activeType, mode]);

  // Render ECharts
  useEffect(() => {
    if (activeType === 'echarts' && echartsRef.current && mode === 'preview') {
      if (!echartsInstanceRef.current) {
        echartsInstanceRef.current = echarts.init(echartsRef.current);
      }
      const option = {
        title: {
          text: 'Quarterly Cloud & Token Consumption',
          textStyle: { fontSize: 13, color: '#171C19' },
        },
        tooltip: { trigger: 'axis' },
        legend: { data: ['Storage (GB)', 'AI Tokens (M)', 'Active Collaborators'], top: 25 },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: 'Storage (GB)',
            type: 'bar',
            data: [120, 150, 190, 240, 310, 420, 560, 710],
            itemStyle: { color: '#245C45' },
          },
          {
            name: 'AI Tokens (M)',
            type: 'line',
            smooth: true,
            data: [22, 38, 55, 92, 140, 210, 340, 490],
            itemStyle: { color: '#398568' },
          },
        ],
      };
      echartsInstanceRef.current.setOption(option);

      const resizeHandler = () => echartsInstanceRef.current?.resize();
      window.addEventListener('resize', resizeHandler);
      return () => {
        window.removeEventListener('resize', resizeHandler);
        echartsInstanceRef.current?.dispose();
        echartsInstanceRef.current = null;
      };
    }
  }, [activeType, mode]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
      {/* Top Header & Switcher */}
      <div className="flex flex-wrap items-center justify-between border-b border-[var(--border)] bg-[var(--accent)] px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-xs font-semibold text-[var(--text)]">{title}</span>
        </div>

        {/* Renderer Selection Tabs */}
        <div className="flex items-center rounded-lg bg-[var(--surface)] p-0.5 border border-[var(--border)] text-xs">
          <button
            onClick={() => setActiveType('mermaid')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              activeType === 'mermaid'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Mermaid (Default)
          </button>
          <button
            onClick={() => setActiveType('echarts')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              activeType === 'echarts'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            ECharts
          </button>
          <button
            onClick={() => setActiveType('reactflow')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              activeType === 'reactflow'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            React Flow
          </button>
          <button
            onClick={() => setActiveType('graphviz')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              activeType === 'graphviz'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Graphviz
          </button>
          <button
            onClick={() => setActiveType('d3')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              activeType === 'd3'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            D3.js
          </button>
        </div>

        {/* View / Code Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')}
            className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text)] hover:bg-[var(--accent)] transition-colors"
          >
            {mode === 'preview' ? (
              <>
                <Code2 className="h-3 w-3 text-[var(--primary)]" />
                <span>Edit Source</span>
              </>
            ) : (
              <>
                <Eye className="h-3 w-3 text-[var(--primary)]" />
                <span>Preview</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 min-h-[340px] flex items-center justify-center">
        {mode === 'code' ? (
          <div className="w-full">
            <span className="text-[11px] font-mono text-[var(--text-muted)] mb-1 block">
              Source code definition for {activeType.toUpperCase()}
            </span>
            <textarea
              rows={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        ) : (
          <>
            {activeType === 'mermaid' && (
              <div className="w-full flex justify-center">
                {renderError ? (
                  <div className="rounded-md bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30">
                    {renderError}
                  </div>
                ) : (
                  <div
                    className="mermaid-container w-full overflow-x-auto flex justify-center"
                    dangerouslySetInnerHTML={{ __html: mermaidSvg }}
                  />
                )}
              </div>
            )}

            {activeType === 'echarts' && (
              <div ref={echartsRef} className="w-full h-80" />
            )}

            {activeType === 'reactflow' && (
              <div className="w-full h-80 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] p-4 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-[var(--surface)] px-2 py-1 text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)]">
                  <Network className="h-3 w-3 text-[var(--primary)]" />
                  <span>React Flow Visual Node Canvas</span>
                </div>
                <div className="grid grid-cols-3 gap-6 my-auto items-center">
                  <div className="rounded-lg border-2 border-[var(--primary)] bg-[var(--surface)] p-3 shadow-xs">
                    <span className="text-[10px] font-bold text-[var(--primary)] uppercase">Source Node</span>
                    <p className="text-xs font-semibold text-[var(--text)] mt-0.5">Prompt & Data Ingestion</p>
                  </div>
                  <div className="rounded-lg border-2 border-[var(--secondary)] bg-[var(--surface)] p-3 shadow-xs">
                    <span className="text-[10px] font-bold text-[var(--secondary)] uppercase">Logic Node</span>
                    <p className="text-xs font-semibold text-[var(--text)] mt-0.5">Semantic Analysis Layer</p>
                  </div>
                  <div className="rounded-lg border-2 border-emerald-600 bg-[var(--surface)] p-3 shadow-xs">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Target Node</span>
                    <p className="text-xs font-semibold text-[var(--text)] mt-0.5">Rendered Tiptap Block</p>
                  </div>
                </div>
                <div className="text-center text-[11px] text-[var(--text-muted)]">
                  Connectable interactive nodes with directional state flow.
                </div>
              </div>
            )}

            {activeType === 'graphviz' && (
              <div
                className="w-full flex justify-center"
                dangerouslySetInnerHTML={{ __html: DEFAULT_GRAPHVIZ_SVG }}
              />
            )}

            {activeType === 'd3' && (
              <div className="w-full h-80 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col items-center justify-center">
                <div className="relative h-48 w-48 flex items-center justify-center">
                  <div className="absolute h-48 w-48 rounded-full border-2 border-dashed border-[var(--border)] animate-spin duration-1000" />
                  <div className="absolute h-32 w-32 rounded-full border-2 border-[var(--primary)] opacity-40" />
                  <div className="h-16 w-16 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold text-xs shadow-md">
                    D3 Hub
                  </div>
                </div>
                <span className="text-xs font-semibold text-[var(--text)] mt-3">
                  Dynamic Hierarchical Layout
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Zero-dependency interactive SVG rendering via D3 data binding
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
