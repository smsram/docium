'use client';

import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  Trash2,
  Captions,
  Crop,
  Check,
  X,
} from 'lucide-react';
import { InputDialog } from '@/components/ui/InputDialog';

export type ImageAlignMode = 'left' | 'center' | 'right' | 'float-left' | 'float-right';

function ResizableImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const cropWrapRef = useRef<HTMLDivElement>(null);
  const [cropping, setCropping] = useState(false);
  const [captionDialogOpen, setCaptionDialogOpen] = useState(false);
  const [cropBox, setCropBox] = useState({ top: 5, right: 5, bottom: 5, left: 5 });
  const [cropError, setCropError] = useState<string | null>(null);

  const src = String(node.attrs.src || '');
  const alt = String(node.attrs.alt || '');
  const title = String(node.attrs.title || '');
  const width = node.attrs.width ? Number(node.attrs.width) : undefined;
  const height = node.attrs.height ? Number(node.attrs.height) : undefined;
  const alignment = (node.attrs.alignment || 'center') as ImageAlignMode;
  const caption = String(node.attrs.caption || '');

  const startResize = (dir: 'se' | 'sw' | 'ne' | 'nw') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const imgEl = imgRef.current;
    if (!imgEl) return;

    const startX = e.clientX;
    const origW = imgEl.offsetWidth || width || 320;
    const origH = imgEl.offsetHeight || height || 220;
    const aspect = origH > 0 ? origW / origH : 1.5;

    const onMove = (ev: MouseEvent) => {
      const dx = dir.includes('e') ? ev.clientX - startX : startX - ev.clientX;
      const nextW = Math.max(60, Math.min(640, Math.round(origW + dx)));
      const nextH = Math.max(40, Math.round(nextW / aspect));
      updateAttributes({ width: nextW, height: nextH });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const applyPercentSize = (pct: number) => {
    const parentW = imgRef.current?.closest('.ProseMirror')?.clientWidth || 600;
    const imgEl = imgRef.current;
    const natW = imgEl?.naturalWidth || 400;
    const natH = imgEl?.naturalHeight || 280;
    const aspect = natH > 0 ? natW / natH : 1.5;
    const nextW = Math.round((parentW * pct) / 100);
    updateAttributes({ width: nextW, height: Math.round(nextW / aspect) });
  };

  // Interactive free-crop dragging from all 4 corners, 4 sides, or dragging the box itself
  const startCropDrag =
    (handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move') =>
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = cropWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { ...cropBox };
      const minBoxPct = 10;

      const onMove = (ev: MouseEvent) => {
        const dxPct = ((ev.clientX - startX) / rect.width) * 100;
        const dyPct = ((ev.clientY - startY) / rect.height) * 100;

        if (handle === 'move') {
          const boxW = 100 - orig.left - orig.right;
          const boxH = 100 - orig.top - orig.bottom;
          const nextLeft = Math.max(0, Math.min(100 - boxW, orig.left + dxPct));
          const nextTop = Math.max(0, Math.min(100 - boxH, orig.top + dyPct));
          setCropBox({
            left: Math.round(nextLeft * 10) / 10,
            right: Math.round((100 - nextLeft - boxW) * 10) / 10,
            top: Math.round(nextTop * 10) / 10,
            bottom: Math.round((100 - nextTop - boxH) * 10) / 10,
          });
          return;
        }

        const next = { ...orig };
        if (handle.includes('w')) {
          next.left = Math.max(0, Math.min(100 - orig.right - minBoxPct, orig.left + dxPct));
        }
        if (handle.includes('e')) {
          next.right = Math.max(0, Math.min(100 - orig.left - minBoxPct, orig.right - dxPct));
        }
        if (handle.includes('n')) {
          next.top = Math.max(0, Math.min(100 - orig.bottom - minBoxPct, orig.top + dyPct));
        }
        if (handle.includes('s')) {
          next.bottom = Math.max(0, Math.min(100 - orig.top - minBoxPct, orig.bottom - dyPct));
        }
        setCropBox({
          top: Math.round(next.top * 10) / 10,
          right: Math.round(next.right * 10) / 10,
          bottom: Math.round(next.bottom * 10) / 10,
          left: Math.round(next.left * 10) / 10,
        });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

  const applyAspectPreset = (ratio: number | null) => {
    if (ratio === null) {
      setCropBox({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }
    const wrap = cropWrapRef.current;
    const natW = imgRef.current?.naturalWidth || wrap?.offsetWidth || 400;
    const natH = imgRef.current?.naturalHeight || wrap?.offsetHeight || 300;
    const imgRatio = natW / Math.max(1, natH);
    if (imgRatio > ratio) {
      // Crop sides symmetrically
      const targetWidthPct = (ratio / imgRatio) * 100;
      const sidePct = Math.max(0, (100 - targetWidthPct) / 2);
      setCropBox({ top: 0, bottom: 0, left: Math.round(sidePct * 10) / 10, right: Math.round(sidePct * 10) / 10 });
    } else {
      // Crop top/bottom symmetrically
      const targetHeightPct = (imgRatio / ratio) * 100;
      const tbPct = Math.max(0, (100 - targetHeightPct) / 2);
      setCropBox({ left: 0, right: 0, top: Math.round(tbPct * 10) / 10, bottom: Math.round(tbPct * 10) / 10 });
    }
  };

  const handleApplyCrop = async () => {
    const imgEl = imgRef.current;
    if (!imgEl) {
      setCropping(false);
      return;
    }

    const doCanvasCrop = (loadedImg: HTMLImageElement) => {
      const natW = loadedImg.naturalWidth || loadedImg.width || 400;
      const natH = loadedImg.naturalHeight || loadedImg.height || 300;
      const wPct = Math.max(5, 100 - cropBox.left - cropBox.right);
      const hPct = Math.max(5, 100 - cropBox.top - cropBox.bottom);
      const sx = Math.round((cropBox.left / 100) * natW);
      const sy = Math.round((cropBox.top / 100) * natH);
      const sw = Math.max(10, Math.round((wPct / 100) * natW));
      const sh = Math.max(10, Math.round((hPct / 100) * natH));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(loadedImg, sx, sy, sw, sh, 0, 0, sw, sh);
      const croppedUrl = canvas.toDataURL('image/png');
      const curW = width || imgEl.offsetWidth || sw;
      const nextW = Math.max(60, Math.round(curW * (wPct / 100)));
      const nextH = Math.max(40, Math.round((nextW * sh) / sw));
      updateAttributes({ src: croppedUrl, width: nextW, height: nextH });
      setCropping(false);
    };

    try {
      setCropError(null);
      if (src.startsWith('data:') || src.startsWith('blob:')) {
        doCanvasCrop(imgEl);
        return;
      }
      const corsImg = new window.Image();
      corsImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        corsImg.onload = () => resolve();
        corsImg.onerror = () => reject(new Error('CORS blocked image export'));
        corsImg.src = src;
      });
      doCanvasCrop(corsImg);
    } catch {
      setCropError('External image server blocks pixel cropping (CORS). Try uploading the image file directly.');
    }
  };

  const outerStyle: React.CSSProperties =
    alignment === 'float-left'
      ? { float: 'left', marginRight: '16px', marginBottom: '8px', marginTop: '4px' }
      : alignment === 'float-right'
      ? { float: 'right', marginLeft: '16px', marginBottom: '8px', marginTop: '4px' }
      : {
          display: 'flex',
          flexDirection: 'column',
          alignItems:
            alignment === 'left'
              ? 'flex-start'
              : alignment === 'right'
              ? 'flex-end'
              : 'center',
          margin: '8pt 0',
        };

  return (
    <NodeViewWrapper
      style={{
        ...outerStyle,
        zIndex: selected ? 40 : undefined,
      }}
      className="docium-image-node select-none relative"
    >
      <div
        className={`relative inline-block ${
          selected ? 'ring-2 ring-[#245c45] ring-offset-2 rounded-xs z-30' : 'hover:ring-1 hover:ring-[#245c45]/40'
        }`}
      >
        {selected && (
          <div
            data-docium-ui-only="true"
            contentEditable={false}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-xl text-[10px] text-gray-700 whitespace-nowrap print:hidden"
          >
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyPercentSize(pct)}
                className="px-1.5 py-0.5 rounded hover:bg-gray-100 font-mono cursor-pointer"
                title={`Resize to ${pct}% of page width`}
              >
                {pct}%
              </button>
            ))}
            <div className="h-3.5 w-px bg-gray-200 mx-0.5" />
            <button
              type="button"
              onClick={() => updateAttributes({ alignment: 'left' })}
              className={`p-1 rounded cursor-pointer ${alignment === 'left' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Align Left"
            >
              <AlignLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ alignment: 'center' })}
              className={`p-1 rounded cursor-pointer ${alignment === 'center' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Align Center"
            >
              <AlignCenter className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ alignment: 'right' })}
              className={`p-1 rounded cursor-pointer ${alignment === 'right' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Align Right"
            >
              <AlignRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() =>
                updateAttributes({
                  alignment: alignment === 'float-left' ? 'float-right' : 'float-left',
                })
              }
              className={`p-1 rounded cursor-pointer ${alignment.startsWith('float-') ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Wrap Text (Float Left / Right)"
            >
              <WrapText className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setCaptionDialogOpen(true)}
              className={`p-1 rounded cursor-pointer ${caption ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Add / Edit Caption"
            >
              <Captions className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCropError(null);
                setCropBox({ top: 5, right: 5, bottom: 5, left: 5 });
                setCropping(true);
              }}
              className="p-1 rounded hover:bg-gray-100 cursor-pointer"
              title="Free Crop Image"
            >
              <Crop className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
              title="Delete Image"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          title={title}
          style={{
            width: width ? `${width}px` : undefined,
            height: height ? `${height}px` : 'auto',
            maxWidth: '100%',
            display: 'block',
            margin: 0,
          }}
        />

        {selected && (
          <>
            <div data-docium-ui-only="true" onMouseDown={startResize('nw')} className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nwse-resize z-30 print:hidden" />
            <div data-docium-ui-only="true" onMouseDown={startResize('ne')} className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nesw-resize z-30 print:hidden" />
            <div data-docium-ui-only="true" onMouseDown={startResize('sw')} className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nesw-resize z-30 print:hidden" />
            <div data-docium-ui-only="true" onMouseDown={startResize('se')} className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nwse-resize z-30 print:hidden" />
          </>
        )}
      </div>

      {caption && (
        <div className="text-[9.5pt] italic text-[#4b5563] mt-1 text-center max-w-full">
          {caption}
        </div>
      )}

      <InputDialog
        isOpen={captionDialogOpen}
        title="Figure Caption"
        fields={[
          {
            id: 'caption',
            label: 'Caption Text (leave empty to remove)',
            defaultValue: caption,
            placeholder: 'e.g. Figure 1: Model comparison',
          },
        ]}
        confirmLabel="Save Caption"
        onConfirm={(vals) => {
          updateAttributes({ caption: (vals.caption || '').trim() });
          setCaptionDialogOpen(false);
        }}
        onCancel={() => setCaptionDialogOpen(false)}
      />

      {cropping &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-docium-ui-only="true"
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 backdrop-blur-[1px] p-4 print:hidden"
          >
            <div className="bg-[var(--surface)] text-[var(--text)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crop className="h-4 w-4 text-[var(--primary)]" />
                  <h3 className="text-sm font-semibold">Crop Image</h3>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Drag corners, edges, or selection
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCropping(false)}
                  className="p-1 rounded hover:bg-[var(--accent)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Aspect Ratio Presets */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[var(--text-muted)] mr-1">Aspect:</span>
                {[
                  { label: 'Free', ratio: null },
                  { label: '1:1 Square', ratio: 1 },
                  { label: '4:3', ratio: 4 / 3 },
                  { label: '16:9', ratio: 16 / 9 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyAspectPreset(preset.ratio)}
                    className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Interactive Drag-Crop Stage */}
              <div className="bg-black/10 dark:bg-black/35 rounded-lg p-4 flex items-center justify-center min-h-[220px] max-h-80 overflow-hidden select-none">
                <div ref={cropWrapRef} className="relative inline-block overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="Crop preview"
                    draggable={false}
                    className="max-h-72 max-w-full block select-none"
                  />

                  {/* Crop Selection Rectangle with 8 Direct Drag Handles */}
                  <div
                    onMouseDown={startCropDrag('move')}
                    style={{
                      top: `${cropBox.top}%`,
                      right: `${cropBox.right}%`,
                      bottom: `${cropBox.bottom}%`,
                      left: `${cropBox.left}%`,
                    }}
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.52)] cursor-move"
                  >
                    {/* Rule of thirds grid */}
                    <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-35">
                      <div className="border-r border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-b border-white" />
                      <div className="border-r border-white" />
                      <div className="border-r border-white" />
                      <div />
                    </div>

                    {/* 4 Corner Handles */}
                    <div onMouseDown={startCropDrag('nw')} className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-[#245c45] rounded-2xs cursor-nwse-resize" />
                    <div onMouseDown={startCropDrag('ne')} className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-[#245c45] rounded-2xs cursor-nesw-resize" />
                    <div onMouseDown={startCropDrag('sw')} className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-[#245c45] rounded-2xs cursor-nesw-resize" />
                    <div onMouseDown={startCropDrag('se')} className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-[#245c45] rounded-2xs cursor-nwse-resize" />

                    {/* 4 Side Edge Handles */}
                    <div onMouseDown={startCropDrag('n')} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-2.5 bg-white border border-[#245c45] rounded-xs cursor-ns-resize" />
                    <div onMouseDown={startCropDrag('s')} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-2.5 bg-white border border-[#245c45] rounded-xs cursor-ns-resize" />
                    <div onMouseDown={startCropDrag('w')} className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2.5 h-6 bg-white border border-[#245c45] rounded-xs cursor-ew-resize" />
                    <div onMouseDown={startCropDrag('e')} className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-6 bg-white border border-[#245c45] rounded-xs cursor-ew-resize" />
                  </div>
                </div>
              </div>

              {cropError && (
                <p className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded px-2.5 py-1.5">
                  {cropError}
                </p>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Selection: {Math.round(100 - cropBox.left - cropBox.right)}% ×{' '}
                  {Math.round(100 - cropBox.top - cropBox.bottom)}%
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCropBox({ top: 0, right: 0, bottom: 0, left: 0 })}
                    className="px-2.5 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--accent)] cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropping(false)}
                    className="px-2.5 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--accent)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyCrop}
                    className="px-3 py-1 text-xs rounded bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Apply Crop
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  inline: false,
  group: 'block',
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || (el as HTMLElement).style.width;
          return w ? parseInt(w, 10) || null : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute('height') || (el as HTMLElement).style.height;
          return h ? parseInt(h, 10) || null : null;
        },
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
      alignment: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-alignment') || 'center',
        renderHTML: (attrs) => ({ 'data-alignment': attrs.alignment || 'center' }),
      },
      caption: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-caption') || '',
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
