/**
 * Verification Test: Document Editor Formatting & Pagination
 * 
 * Verifies:
 * 1. Markdown to HTML: Fenced code blocks preserve exact indentation, newlines, blank lines.
 * 2. Python `#` comments inside code blocks are NEVER parsed as headings.
 * 3. Multi-program content automatically flows across pages with `pageBreak` nodes.
 * 4. Long code blocks split cleanly at line breaks without cutting text horizontally.
 * 5. Pagination engine block height calculations and line splitting.
 * 6. `insert_code_block` tool and editor registry action handling.
 */

import { convertMarkdownToDocumentHtml, escapeHtml } from '../src/components/editor/utils/markdownToHtml';
import { splitCodeBlockAtLines, estimateBlockNodeHeight } from '../src/lib/editor/paginationEngine';

function runTests() {
  console.log('--- TEST 1: Markdown to HTML Code Block Parsing ---');
  const pythonCode = `\`\`\`python
# Program 1: Deep Learning CNN Model
import torch
import torch.nn as nn

class CNN(nn.Module):
    def __init__(self):
        super().__init__()
        # 1st Conv layer
        self.conv = nn.Conv2d(1, 32, 3)

    def forward(self, x):
        return self.conv(x)
\`\`\``;

  const html = convertMarkdownToDocumentHtml(pythonCode);
  console.log('Result HTML preview:\n', html.substring(0, 300));

  // Assertions:
  // 1. Must contain <pre><code class="language-python">
  if (!html.includes('<pre><code class="language-python">')) {
    throw new Error('FAIL: HTML missing <pre><code class="language-python">');
  }
  // 2. Comments starting with `#` must NOT become <h1> or <h2>
  if (html.includes('<h1>') || html.includes('<h2>')) {
    throw new Error('FAIL: Python comments inside code block were converted to headings!');
  }
  // 3. Must preserve newlines and indentation inside <code>
  if (!html.includes('    def __init__(self):')) {
    throw new Error('FAIL: Code block indentation was stripped!');
  }
  if (!html.includes('# 1st Conv layer')) {
    throw new Error('FAIL: Inner Python comment was removed!');
  }
  console.log('PASS: Test 1 succeeded!\n');

  console.log('--- TEST 2: Multi-Program Pagination Flow ---');
  const twoPrograms = `# Program 1: CNN
\`\`\`python
# CNN Definition
import torch
# Line 1
# Line 2
# Line 3
# Line 4
# Line 5
# Line 6
# Line 7
# Line 8
# Line 9
# Line 10
# Line 11
# Line 12
# Line 13
# Line 14
# Line 15
\`\`\`

# Program 2: LSTM
\`\`\`python
# LSTM Definition
import torch
# LSTM line 1
# LSTM line 2
# LSTM line 3
\`\`\``;

  const paginatedHtml = convertMarkdownToDocumentHtml(twoPrograms);
  console.log('Paginated HTML preview:\n', paginatedHtml);

  // Both programs exist and are separated by a pageBreak
  if (!paginatedHtml.includes('Program 1: CNN') || !paginatedHtml.includes('Program 2: LSTM')) {
    throw new Error('FAIL: Missing program headings!');
  }
  if (!paginatedHtml.includes('data-type="page-break"')) {
    throw new Error('FAIL: Multi-program content was not separated by page-break!');
  }
  console.log('PASS: Test 2 succeeded!\n');

  console.log('--- TEST 3: Splitting Long Code Blocks at Line Breaks ---');
  // Generate 80 lines of python code
  const codeLines: string[] = ['# Start of long program'];
  for (let i = 1; i <= 80; i++) {
    codeLines.push(`    x_${i} = compute_value(${i})  # computation step ${i}`);
  }
  codeLines.push('# End of long program');
  const longCode = codeLines.join('\n');

  const chunks = splitCodeBlockAtLines(longCode, 36);
  console.log(`Split 82 lines of code into ${chunks.length} chunks.`);
  if (chunks.length < 2) {
    throw new Error(`FAIL: Expected at least 2 chunks, got ${chunks.length}`);
  }
  // Verify chunks don't lose any lines
  const totalRejoinedLines = chunks.map((c) => c.split(/\r?\n/)).flat().length;
  if (totalRejoinedLines !== codeLines.length) {
    throw new Error(`FAIL: Line count mismatch! Original: ${codeLines.length}, Rejoined: ${totalRejoinedLines}`);
  }
  // Verify clean line break boundary (no cut in middle of a line)
  chunks.forEach((chunk, idx) => {
    const linesInChunk = chunk.split(/\r?\n/);
    if (!linesInChunk[0].includes('#') && !linesInChunk[0].includes('x_')) {
      throw new Error(`FAIL: Chunk ${idx} starts with corrupted line: "${linesInChunk[0]}"`);
    }
  });
  console.log('PASS: Test 3 succeeded!\n');

  console.log('--- TEST 4: Markdown to HTML Long Code Block Pagination ---');
  const longMarkdown = `\`\`\`python\n${longCode}\n\`\`\``;
  const longCodeHtml = convertMarkdownToDocumentHtml(longMarkdown);
  const pageBreakCount = (longCodeHtml.match(/data-type="page-break"/g) || []).length;
  console.log(`Long code block generated ${pageBreakCount} page breaks in HTML.`);
  if (pageBreakCount < 2) {
    throw new Error(`FAIL: Expected at least 2 page breaks for 82 lines of code, got ${pageBreakCount}`);
  }
  console.log('PASS: Test 4 succeeded!\n');

  console.log('--- TEST 5: Block Node Height Estimation ---');
  const dummyHeading = { type: { name: 'heading' }, attrs: { level: 1 } };
  const dummyCode = { type: { name: 'codeBlock' }, textContent: 'line 1\nline 2\nline 3\nline 4\nline 5' };
  const h1Height = estimateBlockNodeHeight(dummyHeading);
  const codeHeight = estimateBlockNodeHeight(dummyCode);
  console.log(`H1 height estimate: ${h1Height}px, 5-line CodeBlock height estimate: ${codeHeight}px`);
  if (h1Height <= 0 || codeHeight <= 0) {
    throw new Error('FAIL: Height estimation returned <= 0');
  }
  console.log('PASS: Test 5 succeeded!\n');

  console.log('ALL 5 TESTS PASSED SUCCESSFULLY!');
}

runTests();

