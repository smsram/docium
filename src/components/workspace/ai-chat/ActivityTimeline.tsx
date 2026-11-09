/**
 * DOCIUM AI Chat Working Interface
 *
 * Modeled after the Antigravity chat interface:
 * 1. ONE parent expandable section: "Working >" / "Working v"
 *    - Animated with a subtle CSS shimmer across "Working" during active generation
 *      (thinking-label-shimmer animate-text-shimmer).
 *    - Automatically expands when generation begins, stays expanded throughout planning and execution.
 *    - Automatically collapses when the final response begins.
 *    - Reopenable by user click after completion.
 * 2. STRICTLY NO STEP ICONS:
 *    - Absolutely no checkmark icons, status dots, ping dots, file icons, search icons, tool icons,
 *      robot icons, or decorative icons on individual steps.
 *    - Plain text step titles with subtle disclosure arrows only (v when open, > when collapsed).
 * 3. AI-GENERATED STEP NAMES AND CONTENT:
 *    - Concise action titles: "Understanding the request", "Inspecting the document",
 *      "Updating the document", "Verifying the changes".
 *    - Conversational assistant progress prose indented under each step.
 *    - Strictly no raw system logs, API calls, or tool query dumps.
 * 4. STEP TRANSITION AND PERSISTENCE:
 *    - Active step is expanded by default during execution.
 *    - Completed steps can be collapsed by default, but full content remains accessible when opened.
 *    - Older step content is never erased or overwritten when a new step arrives.
 * 5. UNBOXED / CARDLESS:
 *    - Renders inline directly within the assistant message bubble.
 *    - No outer card container, no background box, no borders around the parent.
 *    - Clean indented left guide line: border-l-2 border-[var(--border-subtle)].
 */

'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  memo,
  useCallback,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { AgentActivityEvent } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityTimelineProps {
  events?: AgentActivityEvent[];
  isGenerating?: boolean;
  isFinalResponseStarted?: boolean;
  error?: string;
  /** Unix ms timestamp when the session started */
  startTime?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Step Row (Memoized — Strictly NO Step Icons)
// ─────────────────────────────────────────────────────────────────────────────

interface StepRowProps {
  evt: AgentActivityEvent;
  stepKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
}

const StepRow = memo(function StepRow({
  evt,
  stepKey,
  isExpanded,
  onToggle,
}: StepRowProps) {
  const isRunning = evt.status === 'running';
  const isFailed = evt.status === 'failed';
  const stepContent = evt.safeSummary || evt.description;
  const hasContent = Boolean(stepContent && stepContent.trim() !== '');

  const handleToggle = useCallback(() => {
    if (hasContent) {
      onToggle(stepKey);
    }
  }, [hasContent, onToggle, stepKey]);

  return (
    <div className="relative text-[11px] leading-relaxed" role="listitem">
      {/* Step header row: Plain Title + Subtle Disclosure Arrow */}
      <button
        type="button"
        onClick={handleToggle}
        className={`group/step inline-flex items-center gap-1.5 py-0.5 px-1 -ml-1 rounded transition-colors duration-100 text-left ${
          hasContent ? 'cursor-pointer hover:bg-[var(--accent)]/30' : 'cursor-default'
        }`}
        aria-expanded={hasContent ? isExpanded : undefined}
      >
        <span
          className={`transition-colors ${
            isRunning
              ? 'font-medium text-[var(--text)]'
              : isFailed
              ? 'font-medium text-rose-600 dark:text-rose-400'
              : 'text-[var(--text-muted)]'
          }`}
        >
          {evt.label || evt.title || 'Step'}
        </span>

        {hasContent && (
          <ChevronDown
            className={`h-3 w-3 text-[var(--text-muted)] opacity-60 group-hover/step:opacity-100 transition-transform duration-150 ${
              isExpanded ? 'rotate-0' : '-rotate-90'
            }`}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Indented Step Content — Conversational Assistant Progress */}
      {isExpanded && hasContent && (
        <div className="ml-3 pl-1 mt-0.5 mb-1 text-[11px] text-[var(--text-muted)] leading-relaxed animate-in fade-in duration-150">
          <p className="whitespace-pre-wrap break-words">{stepContent}</p>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.stepKey === next.stepKey &&
    prev.evt.status === next.evt.status &&
    prev.evt.label === next.evt.label &&
    prev.evt.safeSummary === next.evt.safeSummary &&
    prev.evt.description === next.evt.description &&
    prev.isExpanded === next.isExpanded &&
    prev.onToggle === next.onToggle
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main ActivityTimeline Component
// ─────────────────────────────────────────────────────────────────────────────

export const ActivityTimeline = memo(
  function ActivityTimeline({
    events = [],
    isGenerating = false,
    isFinalResponseStarted = false,
    error,
  }: ActivityTimelineProps) {

    // ── Deduplicate events (stable in-place update) ──────────────────────────
    const uniqueEvents = useMemo(() => {
      const list: AgentActivityEvent[] = [];
      const idMap = new Map<string, number>();
      for (const evt of events) {
        const key = evt.id || evt.stepId || `${evt.eventType}-${evt.order ?? evt.timestamp}`;
        const idx = idMap.get(key);
        if (idx !== undefined) {
          list[idx] = {
            ...list[idx],
            ...evt,
            safeSummary: evt.safeSummary !== undefined ? evt.safeSummary : list[idx].safeSummary,
            description: evt.description !== undefined ? evt.description : list[idx].description,
          };
        } else {
          idMap.set(key, list.length);
          list.push(evt);
        }
      }
      return list;
    }, [events]);

    const hasEvents = uniqueEvents.length > 0;
    const isActivelyWorking = isGenerating && !isFinalResponseStarted;

    // ── Auto-expand / auto-collapse parent "Working" ─────────────────────────
    const [isExpanded, setIsExpanded] = useState<boolean>(isGenerating && !isFinalResponseStarted);
    const userToggledContainerRef = useRef<boolean>(false);
    const prevGeneratingRef = useRef<boolean>(isGenerating);
    const prevFinalRef = useRef<boolean>(isFinalResponseStarted);

    // Expand when generation begins
    useEffect(() => {
      if (!prevGeneratingRef.current && isGenerating) {
        userToggledContainerRef.current = false;
        setIsExpanded(true);
      }
      prevGeneratingRef.current = isGenerating;
    }, [isGenerating]);

    // Auto-collapse when final response begins (unless user manually reopened)
    useEffect(() => {
      if (!prevFinalRef.current && isFinalResponseStarted && !userToggledContainerRef.current) {
        setIsExpanded(false);
      }
      prevFinalRef.current = isFinalResponseStarted;
    }, [isFinalResponseStarted]);

    const handleToggleContainer = useCallback(() => {
      userToggledContainerRef.current = true;
      setIsExpanded((prev) => !prev);
    }, []);

    // ── Active step tracking for default open state ───────────────────────────
    const activeStepKey = useMemo(() => {
      if (!isActivelyWorking || uniqueEvents.length === 0) return null;
      const running = [...uniqueEvents].reverse().find((e) => e.status === 'running');
      const target = running || uniqueEvents[uniqueEvents.length - 1];
      return target.id || target.stepId || null;
    }, [isActivelyWorking, uniqueEvents]);

    // ── User step overrides for manual disclosure toggling ────────────────────
    const [userStepOverrides, setUserStepOverrides] = useState<Map<string, boolean>>(new Map());

    const handleToggleStep = useCallback((key: string) => {
      setUserStepOverrides((prev) => {
        const next = new Map(prev);
        const currentVal = next.has(key)
          ? next.get(key)!
          : isActivelyWorking && key === activeStepKey;
        next.set(key, !currentVal);
        return next;
      });
    }, [isActivelyWorking, activeStepKey]);

    // ── Render guards ────────────────────────────────────────────────────────
    if (!isGenerating && !hasEvents && !error) return null;

    return (
      <div className="w-full mb-3 select-none" role="region" aria-label="Agent working">
        {/* ── Parent header toggle: Working v / Working > ───────────────────── */}
        <button
          type="button"
          onClick={handleToggleContainer}
          className="group inline-flex items-center gap-1.5 py-0.5 px-1 -ml-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]/40 transition-colors duration-150 cursor-pointer"
          aria-expanded={isExpanded}
          aria-controls="activity-steps-panel"
          title={isExpanded ? 'Collapse working steps' : 'Expand working steps'}
        >
          {/* Label with left-to-right CSS shimmer during active generation */}
          <span
            className={`font-medium leading-none ${
              isActivelyWorking
                ? 'thinking-label-shimmer animate-text-shimmer'
                : error
                ? 'text-rose-500'
                : 'text-[var(--text-muted)]'
            }`}
            aria-live={isActivelyWorking ? 'polite' : undefined}
            aria-atomic="true"
          >
            Working
          </span>

          {/* ChevronDown: points DOWN (rotate-0) when expanded, points RIGHT (-rotate-90) when collapsed */}
          <ChevronDown
            className={`h-3 w-3 text-[var(--text-muted)] opacity-60 group-hover:opacity-100 transition-transform duration-200 ${
              isExpanded ? 'rotate-0' : '-rotate-90'
            }`}
            aria-hidden="true"
          />
        </button>

        {/* ── Animated steps panel ────────────────────────────────────────── */}
        <div
          id="activity-steps-panel"
          className={`activity-steps-panel ${isExpanded ? 'activity-steps-panel--open' : ''}`}
          aria-hidden={!isExpanded}
        >
          {hasEvents && (
            <div
              className="ml-1 pl-3 border-l-2 border-[var(--border-subtle)] mt-1.5 space-y-1 pb-0.5"
              role="list"
              aria-label="Working steps"
            >
              {uniqueEvents.map((evt, idx) => {
                const stepKey = evt.id || evt.stepId || `step-${idx}`;
                const isStepExpanded = userStepOverrides.has(stepKey)
                  ? userStepOverrides.get(stepKey)!
                  : isActivelyWorking && stepKey === activeStepKey;

                return (
                  <StepRow
                    key={stepKey}
                    evt={evt}
                    stepKey={stepKey}
                    isExpanded={Boolean(isStepExpanded)}
                    onToggle={handleToggleStep}
                  />
                );
              })}
            </div>
          )}

          {/* Error detail */}
          {error && (
            <div className="ml-1 mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <span className="break-words">{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.isGenerating === next.isGenerating &&
    prev.isFinalResponseStarted === next.isFinalResponseStarted &&
    prev.events === next.events &&
    prev.error === next.error &&
    prev.startTime === next.startTime
);
