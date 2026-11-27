'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, BarChart3, Check } from 'lucide-react';

interface ChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertChartImage: (dataUrl: string, title: string, width: number, height: number) => void;
}

type ChartKind = 'column' | 'bar' | 'line' | 'pie' | 'doughnut';

const PALETTES: Record<string, string[]> = {
  forest: ['#245C45', '#398568', '#54B68E', '#84CC16', '#0D9488', '#1E40AF'],
  corporate: ['#1E3A8A', '#2563EB', '#3B82F6', '#60A5FA', '#0284C7', '#6366F1'],
  vibrant: ['#D97706', '#E11D48', '#7C3AED', '#059669', '#2563EB', '#DC2626'],
};

export function ChartModal({ isOpen, onClose, onInsertChartImage }: ChartModalProps) {
  const [chartType, setChartType] = useState<ChartKind>('column');
  const [title, setTitle] = useState('Quarterly Revenue Growth ($M)');
  const [labelsInput, setLabelsInput] = useState('Q1, Q2, Q3, Q4');
  const [valuesInput, setValuesInput] = useState('42, 58, 74, 96');
  const [seriesName, setSeriesName] = useState('2026 Performance');
  const [palette, setPalette] = useState<keyof typeof PALETTES>('forest');
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const renderChartToCanvas = (canvas: HTMLCanvasElement, scaleFactor = 2) => {
    const logicalW = 540;
    const logicalH = 320;
    canvas.width = logicalW * scaleFactor;
    canvas.height = logicalH * scaleFactor;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scaleFactor, scaleFactor);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, logicalW, logicalH);

    // Subtle border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, logicalW - 1, logicalH - 1);

    const labels = labelsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const values = valuesInput
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n));
    const count = Math.max(1, Math.min(labels.length, values.length));
    const safeLabels = labels.slice(0, count);
    const safeVals = values.slice(0, count);
    const colors = PALETTES[palette] || PALETTES.forest;

    // Title
    ctx.fillStyle = '#171C19';
    ctx.font = 'bold 15px Calibri, "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title || 'Chart', logicalW / 2, 28);

    if (seriesName) {
      ctx.fillStyle = '#64748B';
      ctx.font = '11px Calibri, "Segoe UI", Arial, sans-serif';
      ctx.fillText(seriesName, logicalW / 2, 46);
    }

    if (safeVals.length === 0) return;

    if (chartType === 'pie' || chartType === 'doughnut') {
      const total = safeVals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
      const cx = logicalW * 0.38;
      const cy = 185;
      const r = 92;
      let startAngle = -Math.PI / 2;

      safeVals.forEach((v, idx) => {
        const sliceAngle = (Math.max(0, v) / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        startAngle += sliceAngle;
      });

      if (chartType === 'doughnut') {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }

      // Legend on right
      ctx.textAlign = 'left';
      safeLabels.forEach((lbl, idx) => {
        const ly = 96 + idx * 26;
        const pct = Math.round((Math.max(0, safeVals[idx]) / total) * 100);
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(logicalW * 0.66, ly - 9, 12, 12);
        ctx.fillStyle = '#1E293B';
        ctx.font = '12px Calibri, Arial, sans-serif';
        ctx.fillText(`${lbl}: ${safeVals[idx]} (${pct}%)`, logicalW * 0.66 + 18, ly + 1);
      });
      return;
    }

    const padLeft = 58;
    const padRight = 32;
    const padTop = 66;
    const padBottom = 46;
    const plotW = logicalW - padLeft - padRight;
    const plotH = logicalH - padTop - padBottom;
    const maxVal = Math.max(...safeVals, 1) * 1.15;

    // Grid lines
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Calibri, Arial, sans-serif';
    ctx.textAlign = 'right';
    for (let g = 0; g <= 4; g++) {
      const y = padTop + plotH - (g / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
      const valLbl = Math.round((maxVal * g) / 4);
      ctx.fillText(String(valLbl), padLeft - 8, y + 3);
    }

    // Axes
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.stroke();

    if (chartType === 'column') {
      const slotW = plotW / count;
      const barW = Math.min(48, slotW * 0.56);
      safeVals.forEach((v, idx) => {
        const bh = (Math.max(0, v) / maxVal) * plotH;
        const bx = padLeft + idx * slotW + (slotW - barW) / 2;
        const by = padTop + plotH - bh;
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(bx, by, barW, bh);

        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 11px Calibri, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(v), bx + barW / 2, by - 6);

        ctx.fillStyle = '#475569';
        ctx.font = '11px Calibri, Arial, sans-serif';
        ctx.fillText(safeLabels[idx], bx + barW / 2, padTop + plotH + 18);
      });
    } else if (chartType === 'bar') {
      const slotH = plotH / count;
      const barH = Math.min(32, slotH * 0.58);
      safeVals.forEach((v, idx) => {
        const bw = (Math.max(0, v) / maxVal) * plotW;
        const bx = padLeft;
        const by = padTop + idx * slotH + (slotH - barH) / 2;
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(bx, by, bw, barH);

        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 11px Calibri, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(v), bx + bw + 6, by + barH / 2 + 4);

        ctx.fillStyle = '#475569';
        ctx.font = '11px Calibri, Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(safeLabels[idx], padLeft - 8, by + barH / 2 + 4);
      });
    } else if (chartType === 'line') {
      const stepX = count > 1 ? plotW / (count - 1) : plotW / 2;
      const pts = safeVals.map((v, idx) => ({
        x: count > 1 ? padLeft + idx * stepX : padLeft + plotW / 2,
        y: padTop + plotH - (Math.max(0, v) / maxVal) * plotH,
      }));

      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      pts.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = colors[0];
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 11px Calibri, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(safeVals[idx]), pt.x, pt.y - 10);

        ctx.fillStyle = '#475569';
        ctx.font = '11px Calibri, Arial, sans-serif';
        ctx.fillText(safeLabels[idx], pt.x, padTop + plotH + 18);
      });
    }
  };

  useEffect(() => {
    if (!isOpen || !previewCanvasRef.current) return;
    renderChartToCanvas(previewCanvasRef.current, 2);
  });

  if (!isOpen) return null;

  const handleInsert = () => {
    const offscreen = document.createElement('canvas');
    renderChartToCanvas(offscreen, 2);
    const dataUrl = offscreen.toDataURL('image/png');
    onInsertChartImage(dataUrl, title || 'Chart', 480, 285);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs text-[var(--text)]">
        <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
            <span>Insert Chart</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--accent)] cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                { id: 'column', label: 'Column' },
                { id: 'bar', label: 'Bar' },
                { id: 'line', label: 'Line' },
                { id: 'pie', label: 'Pie' },
                { id: 'doughnut', label: 'Doughnut' },
              ] as { id: ChartKind; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setChartType(t.id)}
                className={`py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                  chartType === t.id
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                    : 'border-[var(--border)] hover:bg-[var(--accent)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Chart Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Subtitle / Series Label</label>
              <input
                type="text"
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Categories (comma-separated)</label>
              <input
                type="text"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="Q1, Q2, Q3, Q4"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 font-mono outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Values (comma-separated)</label>
              <input
                type="text"
                value={valuesInput}
                onChange={(e) => setValuesInput(e.target.value)}
                placeholder="42, 58, 74, 96"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 font-mono outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium">Color Theme:</span>
            {(['forest', 'corporate', 'vibrant'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPalette(p)}
                className={`px-2.5 py-1 rounded-md border capitalize cursor-pointer ${
                  palette === p
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                    : 'border-[var(--border)] hover:bg-[var(--accent)]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-2 flex justify-center">
            <canvas ref={previewCanvasRef} className="w-full max-w-[460px] h-auto rounded" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3 bg-[var(--surface-elevated)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--accent)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-4 py-1.5 font-semibold hover:bg-[var(--primary-hover)] cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            Insert Chart
          </button>
        </div>
      </div>
    </div>
  );
}

