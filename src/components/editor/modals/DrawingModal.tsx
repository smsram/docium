'use client';

import React, { useRef, useState, useEffect } from 'react';
import { X, PenTool, Eraser, Trash2, Check, Undo2 } from 'lucide-react';

interface DrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertDrawing: (dataUrl: string, width: number, height: number) => void;
}

export function DrawingModal({ isOpen, onClose, onInsertDrawing }: DrawingModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#171C19');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 560;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setHistory([canvas.toDataURL()]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 18;
    } else if (tool === 'highlighter') {
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = color;
      ctx.lineWidth = 14;
    } else {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
    }
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleMouseUp = () => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) ctx.globalAlpha = 1;
    setIsDrawing(false);
    setHistory((prev) => [...prev.slice(-15), canvasRef.current!.toDataURL()]);
  };

  const handleUndo = () => {
    if (history.length <= 1 || !canvasRef.current) return;
    const nextHist = history.slice(0, -1);
    setHistory(nextHist);
    const img = new window.Image();
    img.onload = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = nextHist[nextHist.length - 1];
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHistory([canvas.toDataURL()]);
  };

  const handleInsert = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onInsertDrawing(dataUrl, 380, 190);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs text-[var(--text)]">
        <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <PenTool className="h-4 w-4 text-[var(--primary)]" />
            <span>Drawing & Signature Canvas</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--accent)] cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
                  tool === 'pen' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] hover:bg-[var(--accent)]'
                }`}
              >
                Ink Pen
              </button>
              <button
                type="button"
                onClick={() => {
                  setTool('highlighter');
                  if (color === '#171C19') setColor('#FACC15');
                }}
                className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
                  tool === 'highlighter' ? 'bg-amber-500 text-white border-amber-500' : 'border-[var(--border)] hover:bg-[var(--accent)]'
                }`}
              >
                Highlighter
              </button>
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
                  tool === 'eraser' ? 'bg-gray-700 text-white border-gray-700' : 'border-[var(--border)] hover:bg-[var(--accent)]'
                }`}
              >
                <Eraser className="h-3 w-3" />
                Eraser
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {['#171C19', '#1D4ED8', '#245C45', '#DC2626', '#FACC15'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border cursor-pointer ${
                    color === c ? 'ring-2 ring-[var(--primary)] ring-offset-1' : 'border-gray-300'
                  }`}
                />
              ))}
              <select
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-1.5 py-1 text-[11px]"
              >
                <option value={1.5}>Fine</option>
                <option value={2.5}>Medium</option>
                <option value={4.5}>Bold</option>
              </select>
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length <= 1}
                className="p-1.5 rounded border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-40 cursor-pointer"
                title="Undo stroke"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded border border-[var(--border)] hover:bg-rose-50 text-rose-600 cursor-pointer"
                title="Clear canvas"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-[260px] cursor-crosshair block"
            />
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
            Save & Insert
          </button>
        </div>
      </div>
    </div>
  );
}

