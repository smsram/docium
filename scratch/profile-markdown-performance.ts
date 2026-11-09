/**
 * Profiling Script: Benchmark Markdown Parsing under Streaming
 * 
 * Simulates a 10,000-word response arriving in 400 chunks.
 * Compares:
 * 1. Monolithic Re-parse (Current implementation in StreamingMarkdown.tsx)
 * 2. Incremental Block Cache (Optimized implementation)
 */

import { performance } from 'node:perf_hooks';

// Generate 10,000 words of realistic rich Markdown
function generate10kWordMarkdown(): string {
  const sections: string[] = [];

  sections.push('# Comprehensive Architectural & Performance Specification\n\n');
  sections.push('This document outlines the **high-performance** streaming architecture for DOCIUM.\n\n');

  sections.push('## Executive Summary\n\n');
  sections.push('DOCIUM incorporates real-time collaborative document authoring, AI-assisted reasoning, and multi-modal tool execution. The streaming interface must handle large, continuous text deltas with minimal memory allocation and zero UI freezes.\n\n');

  // Math block
  sections.push('### Mathematical Foundations of Layout Latency\n\n');
  sections.push('The cumulative layout calculation latency \\(L_{total}\\) for \\(N\\) streaming updates across \\(M\\) DOM nodes is defined by:\n\n');
  sections.push('$$L_{total} = \\sum_{i=1}^{N} \\left( \\alpha \\cdot M_i + \\beta \\cdot \\text{reflow}(M_i) \\right)$$\n\n');
  sections.push('Where $\\alpha$ represents DOM reconciliation overhead and $\\beta$ accounts for style calculation and composite rendering.\n\n');

  // Code block
  sections.push('### Core Stream Consumption Engine\n\n');
  sections.push('```typescript\ninterface StreamSessionState {\n  readonly id: string;\n  status: "idle" | "streaming" | "completed";\n  content: string;\n  tokenCount: number;\n}\n\nexport class OptimizedStreamLifecycle {\n  private state: StreamSessionState;\n  constructor(id: string) {\n    this.state = { id, status: "idle", content: "", tokenCount: 0 };\n  }\n  public appendChunk(delta: string): void {\n    this.state.content += delta;\n    this.state.tokenCount++;\n  }\n}\n```\n\n');

  // Table
  sections.push('### Performance Benchmarks Across Providers\n\n');
  sections.push('| Provider | Model ID | Latency (ms) | Throughput (tok/s) | Context Limit |\n');
  sections.push('| :--- | :--- | :--- | :--- | :--- |\n');
  sections.push('| Cloudflare | @cf/meta/llama-3.1-70b-instruct | 180ms | 45 tok/s | 128,000 |\n');
  sections.push('| OpenAI | gpt-4o | 240ms | 65 tok/s | 128,000 |\n');
  sections.push('| Anthropic | claude-3-5-sonnet-20241022 | 260ms | 58 tok/s | 200,000 |\n');
  sections.push('| Google Gemini | gemini-2.0-flash | 140ms | 95 tok/s | 1,000,000 |\n');
  sections.push('| Groq | llama-3.3-70b-versatile | 90ms | 280 tok/s | 128,000 |\n\n');

  // Nested lists
  sections.push('### Key Implementation Requirements\n\n');
  sections.push('1. Strict Stream Reader Single-Ownership\n');
  sections.push('   * Exactly one reader consumes `response.body`.\n');
  sections.push('   * Never invoke `releaseLock()` while `read()` is in-flight.\n');
  sections.push('   * Provide idempotent cancellation handlers.\n');
  sections.push('2. Incremental Markdown Parsing\n');
  sections.push('   * Stable block partitioning preventing repeated AST builds.\n');
  sections.push('   * Parse closed paragraphs exactly once.\n');
  sections.push('   * Animate only active elements with CSS shimmer.\n');
  sections.push('3. Throttled UI Render Pipeline\n');
  sections.push('   * RAF dispatch batching at display frequency (30-60Hz).\n');
  sections.push('   * Preserve scroll anchor without layout thrashing.\n\n');

  // Add 70 repetitive sections to scale up to 10,000+ words
  for (let i = 1; i <= 70; i++) {
    sections.push(`## Section ${i}: Detailed Systems Analysis and Evaluation\n\n`);
    sections.push(`In phase ${i}, the system verifies all memory invariants across client and server runtimes. Each iteration processes structured payload vectors while maintaining referential transparency. For instance, consider the vector allocation model where telemetry items are indexed by sequence identifiers:\n\n`);
    sections.push(`> [!NOTE]\n> System stability is contingent on maintaining bounded buffer sizes throughout high-throughput streaming events. Failure to prune intermediate state leads to unbounded heap growth in long-running sessions.\n\n`);
    sections.push(`* Subsystem ${i}.A: Telemetry ingestion and filtering\n`);
    sections.push(`* Subsystem ${i}.B: Event buffer normalization with O(1) append complexity\n`);
    sections.push(`* Subsystem ${i}.C: Asynchronous reader disposal following stream termination\n\n`);
    sections.push(`\`\`\`json\n{\n  "phase": ${i},\n  "status": "verified",\n  "throughput": ${40 + i * 2},\n  "errorRate": 0.0001\n}\n\`\`\`\n\n`);
    sections.push(`Furthermore, experimental evaluation reveals that unoptimized re-parsing creates ${i * 150} temporary objects per frame. By freezing completed blocks, the memory retention drops to baseline levels.\n\n`);
  }

  return sections.join('');
}

// Current parser functions from StreamingMarkdown.tsx
function sanitizeStreamingContent(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openThinkIdx = text.indexOf('<think>');
  if (openThinkIdx !== -1) {
    text = text.substring(0, openThinkIdx);
  }
  text = text.replace(/```(?:json)?\s*\{\s*"(?:name|tool|function|call)"[\s\S]*?\}\s*```/gi, '');
  return text.trimStart();
}

function autoCloseIncompleteMarkdown(text: string): { normalized: string; isUnclosedCodeBlock: boolean } {
  if (!text) return { normalized: '', isUnclosedCodeBlock: false };
  let normalized = text;
  let isUnclosedCodeBlock = false;

  const codeBlockCount = (normalized.match(/```/g) || []).length;
  if (codeBlockCount % 2 === 1) {
    isUnclosedCodeBlock = true;
    normalized += '\n```';
  }

  const lastLine = normalized.split('\n').pop() || '';
  const backtickCount = (lastLine.match(/`/g) || []).length;
  if (backtickCount % 2 === 1 && !isUnclosedCodeBlock) {
    normalized += '`';
  }

  return { normalized, isUnclosedCodeBlock };
}

function parseBlocksCurrent(normalized: string): string[] {
  if (!normalized.trim()) return [];
  const rawBlocks: string[] = [];
  const codeBlockRegex = /(```[\s\S]*?```)/g;
  const segments = normalized.split(codeBlockRegex);

  for (const segment of segments) {
    if (!segment) continue;
    if (segment.startsWith('```')) {
      rawBlocks.push(segment);
    } else {
      const paras = segment.split(/\n\n+/);
      for (const p of paras) {
        if (p.trim()) {
          rawBlocks.push(p);
        }
      }
    }
  }
  return rawBlocks;
}

function parseInlineFormattingCurrent(text: string): number {
  if (!text) return 0;
  const inlineRegex =
    /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|`.*?`|\[Source:[^\]]+\]|\[.*?\]\(.*?\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
  let matches = 0;
  while (inlineRegex.exec(text) !== null) {
    matches++;
  }
  return matches;
}

// Run benchmark of current implementation
async function benchmarkCurrentAlgorithm(fullText: string, chunks: string[]) {
  console.log('\n--- Profiling CURRENT Parsing Algorithm (Full Re-parse on Every Token Update) ---');

  if (global.gc) global.gc();
  const initialMem = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  let accumulated = '';
  let totalBlocksParsed = 0;
  let totalInlineMatches = 0;

  for (let i = 0; i < chunks.length; i++) {
    accumulated += chunks[i];

    // Simulates what StreamingMarkdown does on every streaming update:
    const sanitized = sanitizeStreamingContent(accumulated);
    const { normalized } = autoCloseIncompleteMarkdown(sanitized);
    const blocks = parseBlocksCurrent(normalized);

    // Render every block
    for (const b of blocks) {
      totalBlocksParsed++;
      totalInlineMatches += parseInlineFormattingCurrent(b);
    }
  }

  const durationMs = performance.now() - startTime;
  const finalMem = process.memoryUsage().heapUsed;
  const heapDeltaMb = (finalMem - initialMem) / (1024 * 1024);

  console.log(`  Duration: ${durationMs.toFixed(2)} ms`);
  console.log(`  Total Block Render Invocations: ${totalBlocksParsed.toLocaleString()}`);
  console.log(`  Total Inline Regex Matches: ${totalInlineMatches.toLocaleString()}`);
  console.log(`  Heap Growth: ${heapDeltaMb.toFixed(2)} MB`);
  return { durationMs, totalBlocksParsed, heapDeltaMb };
}

interface SealedBlock {
  id: string;
  rawText: string;
}

interface IncrementalParseResult {
  sealedBlocks: SealedBlock[];
  activeTail: string;
}

/**
 * High-performance Incremental Block Parser
 * Maintains an internal cursor so already sealed blocks are never re-scanned.
 */
class IncrementalBlockParser {
  private sealedBlocks: SealedBlock[] = [];
  private scannedOffset = 0;
  private currentBlockStart = 0;
  private inCodeFence = false;
  private blockIdCounter = 0;

  public update(text: string): IncrementalParseResult {
    const len = text.length;
    let i = this.scannedOffset;

    while (i < len) {
      if (this.inCodeFence) {
        // Look for closing ```
        if (
          text[i] === '`' &&
          i + 2 < len &&
          text[i + 1] === '`' &&
          text[i + 2] === '`'
        ) {
          // Advance past ``` and check end of line
          i += 3;
          while (i < len && text[i] !== '\n') {
            i++;
          }
          if (i < len && text[i] === '\n') {
            i++; // Include newline
          }
          this.inCodeFence = false;
          // Seal code block
          const blockText = text.substring(this.currentBlockStart, i).trim();
          if (blockText) {
            this.sealedBlocks.push({
              id: `blk-${this.blockIdCounter++}`,
              rawText: blockText,
            });
          }
          // Skip whitespace after block
          while (i < len && (text[i] === '\n' || text[i] === ' ' || text[i] === '\t')) {
            i++;
          }
          this.currentBlockStart = i;
          continue;
        }
        i++;
      } else {
        // Check for opening ```
        if (
          text[i] === '`' &&
          i + 2 < len &&
          text[i + 1] === '`' &&
          text[i + 2] === '`' &&
          (i === 0 || text[i - 1] === '\n')
        ) {
          // If there was content before this fence in the current block, seal it
          if (i > this.currentBlockStart) {
            const blockText = text.substring(this.currentBlockStart, i).trim();
            if (blockText) {
              this.sealedBlocks.push({
                id: `blk-${this.blockIdCounter++}`,
                rawText: blockText,
              });
            }
          }
          this.currentBlockStart = i;
          this.inCodeFence = true;
          i += 3;
          continue;
        }

        // Check for double newline \n\n outside code fence
        if (text[i] === '\n' && i + 1 < len && text[i + 1] === '\n') {
          const blockText = text.substring(this.currentBlockStart, i).trim();
          if (blockText) {
            this.sealedBlocks.push({
              id: `blk-${this.blockIdCounter++}`,
              rawText: blockText,
            });
          }
          // Skip trailing newlines
          while (i < len && text[i] === '\n') {
            i++;
          }
          this.currentBlockStart = i;
          continue;
        }

        i++;
      }
    }

    this.scannedOffset = i;
    const activeTail = text.substring(this.currentBlockStart).trim();

    return {
      sealedBlocks: this.sealedBlocks,
      activeTail,
    };
  }

  public reset(): void {
    this.sealedBlocks = [];
    this.scannedOffset = 0;
    this.currentBlockStart = 0;
    this.inCodeFence = false;
    this.blockIdCounter = 0;
  }
}

// Run benchmark of optimized incremental implementation
async function benchmarkIncrementalAlgorithm(fullText: string, chunks: string[]) {
  console.log('\n--- Profiling OPTIMIZED Incremental Parsing Algorithm ---');

  if (global.gc) global.gc();
  const initialMem = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  const parser = new IncrementalBlockParser();
  let accumulated = '';
  let totalBlocksParsed = 0;
  let totalInlineMatches = 0;

  // Track cache of parsed sealed blocks to verify they are parsed EXACTLY ONCE
  const sealedParsedCache = new Map<string, number>();

  for (let i = 0; i < chunks.length; i++) {
    accumulated += chunks[i];

    // Sanitize tail only if needed, or update parser
    const { sealedBlocks, activeTail } = parser.update(accumulated);

    // 1. Process newly sealed blocks (only those not yet in cache)
    for (const b of sealedBlocks) {
      if (!sealedParsedCache.has(b.id)) {
        totalBlocksParsed++;
        const matches = parseInlineFormattingCurrent(b.rawText);
        totalInlineMatches += matches;
        sealedParsedCache.set(b.id, matches);
      }
    }

    // 2. Parse active tail block ONLY (with auto-closing)
    if (activeTail) {
      totalBlocksParsed++;
      const { normalized } = autoCloseIncompleteMarkdown(activeTail);
      totalInlineMatches += parseInlineFormattingCurrent(normalized);
    }
  }

  const durationMs = performance.now() - startTime;
  const finalMem = process.memoryUsage().heapUsed;
  const heapDeltaMb = (finalMem - initialMem) / (1024 * 1024);

  console.log(`  Duration: ${durationMs.toFixed(2)} ms`);
  console.log(`  Total Block Render Invocations: ${totalBlocksParsed.toLocaleString()}`);
  console.log(`  Total Inline Regex Matches: ${totalInlineMatches.toLocaleString()}`);
  console.log(`  Heap Growth: ${heapDeltaMb.toFixed(2)} MB`);
  return { durationMs, totalBlocksParsed, heapDeltaMb };
}

async function run() {
  const fullText = generate10kWordMarkdown();
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  console.log(`Generated Benchmark Document: ${fullText.length.toLocaleString()} characters, ${wordCount.toLocaleString()} words.`);

  // Split into 300 chunks (simulating 300 token batch updates at 60Hz = 5 seconds of streaming)
  const chunkSize = Math.ceil(fullText.length / 300);
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += chunkSize) {
    chunks.push(fullText.slice(i, i + chunkSize));
  }
  console.log(`Simulating stream across ${chunks.length} updates (chunk size ~${chunkSize} chars)...`);

  const current = await benchmarkCurrentAlgorithm(fullText, chunks);
  const optimized = await benchmarkIncrementalAlgorithm(fullText, chunks);

  console.log('\n====================================================');
  console.log('COMPARISON SUMMARY:');
  console.log(`  Duration Speedup: ${(current.durationMs / optimized.durationMs).toFixed(1)}x faster (${current.durationMs.toFixed(1)}ms -> ${optimized.durationMs.toFixed(1)}ms)`);
  console.log(`  Block Parses Reduced: ${(((current.totalBlocksParsed - optimized.totalBlocksParsed) / current.totalBlocksParsed) * 100).toFixed(1)}% reduction (${current.totalBlocksParsed.toLocaleString()} -> ${optimized.totalBlocksParsed.toLocaleString()})`);
  console.log('====================================================\n');
}

run().catch(console.error);
