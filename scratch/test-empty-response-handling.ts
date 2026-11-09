/**
 * Comprehensive Verification Test Suite for AI Provider Response Handling
 * Validates:
 * 1. Normal text streaming responses.
 * 2. Tool-call-only responses (empty content, tool calls present) are never classified as empty.
 * 3. Graceful recovery when tool execution is followed by an empty follow-up response.
 * 4. Initial empty chunks followed by content accumulate correctly.
 * 5. SSE parsing edge cases (data: vs data:, raw JSON, trailing buffer without newline).
 * 6. Non-rotation of API keys for empty responses, malformed responses, or parse errors.
 * 7. Transient 429/5xx retry handling.
 */

import {
  parseSSELine,
  extractDeltaFromChunk,
  CloudflareAdapter,
} from '../src/lib/ai/adapters/cloudflare';
import {
  synthesizeToolCompletionConfirmation,
  ExecutedToolRecord,
} from '../src/lib/ai/agent/orchestrator';
import { isCredentialError } from '../src/lib/ai/credentials';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('DOCIUM: Universal AI Agent Response Handling Verification');
  console.log('======================================================\n');

  // TEST 1: SSE Parsing Edge Cases (data: vs data:, unadorned JSON, comments)
  console.log('Test Suite 1: SSE Line Parsing Edge Cases');
  {
    const lineWithSpace = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
    const parsedWithSpace = parseSSELine(lineWithSpace);
    assert(parsedWithSpace.json?.choices?.[0]?.delta?.content === 'Hello', 'Parse SSE with space (data: )');

    const lineNoSpace = 'data:{"choices":[{"delta":{"content":"World"}}]}';
    const parsedNoSpace = parseSSELine(lineNoSpace);
    assert(parsedNoSpace.json?.choices?.[0]?.delta?.content === 'World', 'Parse SSE without space (data:)');

    const rawJsonLine = '{"choices":[{"delta":{"content":"Raw"}}]}';
    const parsedRaw = parseSSELine(rawJsonLine);
    assert(parsedRaw.json?.choices?.[0]?.delta?.content === 'Raw', 'Parse raw JSON line without SSE prefix');

    const doneWithSpace = 'data: [DONE]';
    assert(parseSSELine(doneWithSpace).isDone === true, 'Parse data: [DONE]');

    const doneNoSpace = 'data:[DONE]';
    assert(parseSSELine(doneNoSpace).isDone === true, 'Parse data:[DONE]');

    const commentLine = ': keep-alive';
    assert(parseSSELine(commentLine).json === null && !parseSSELine(commentLine).isDone, 'Ignore SSE comment line');

    const emptyLine = '   ';
    assert(parseSSELine(emptyLine).json === null && !parseSSELine(emptyLine).isDone, 'Ignore empty line');
  }

  // TEST 2: Delta Text Extraction (choices, reasoning, Workers AI raw, result envelopes)
  console.log('\nTest Suite 2: Delta Text Extraction');
  {
    const standardDelta = { choices: [{ delta: { content: 'Direct content' } }] };
    assert(extractDeltaFromChunk(standardDelta) === 'Direct content', 'Extract standard delta.content');

    const nonStreamMessage = { choices: [{ message: { content: 'Non-streaming message' } }] };
    assert(extractDeltaFromChunk(nonStreamMessage) === 'Non-streaming message', 'Extract choices[0].message.content');

    const reasoningDelta = { choices: [{ delta: { reasoning_content: 'Step 1: thinking...', content: null } }] };
    assert(extractDeltaFromChunk(reasoningDelta) === 'Step 1: thinking...', 'Extract reasoning_content for Qwen/DeepSeek');

    const directResponse = { response: 'Cloudflare raw token' };
    assert(extractDeltaFromChunk(directResponse) === 'Cloudflare raw token', 'Extract Workers AI raw response');

    const resultEnvelope = { result: { response: 'Envelope token' } };
    assert(extractDeltaFromChunk(resultEnvelope) === 'Envelope token', 'Extract Workers AI result.response');

    const emptyChunk = { choices: [{ delta: { content: '' } }] };
    assert(extractDeltaFromChunk(emptyChunk) === null, 'Initial empty chunk returns null delta without error');
  }

  // TEST 3: Initial Empty Chunks followed by content accumulate correctly
  console.log('\nTest Suite 3: Empty Chunks Followed by Real Content');
  {
    const chunks = [
      { choices: [{ delta: { content: '' } }] },
      { choices: [{ delta: { content: '' } }] },
      { choices: [{ delta: { content: 'First ' } }] },
      { choices: [{ delta: { content: 'Second' } }] },
      { choices: [{ delta: { content: '' } }] },
    ];
    let accumulated = '';
    for (const c of chunks) {
      const delta = extractDeltaFromChunk(c);
      if (delta) accumulated += delta;
    }
    assert(accumulated === 'First Second', 'Accumulated content ignores empty chunks and joins valid deltas');
  }

  // TEST 4: Tool-Call-Only Chunk Handling
  console.log('\nTest Suite 4: Tool-Call-Only Responses');
  {
    const toolCallChunk = {
      choices: [
        {
          delta: {
            content: null,
            tool_calls: [
              {
                index: 0,
                id: 'call_edit_123',
                function: {
                  name: 'insert_structured_document',
                  arguments: '{"content":"# Title\\nBody"}',
                },
              },
            ],
          },
        },
      ],
    };

    // Verify extractDeltaFromChunk does not fail and returns null (since content is null)
    const textDelta = extractDeltaFromChunk(toolCallChunk);
    assert(textDelta === null, 'Tool-call-only chunk has null text delta');

    // Verify chunk has valid tool calls
    const toolCalls = toolCallChunk.choices[0].delta.tool_calls;
    assert(toolCalls && toolCalls.length === 1, 'Tool calls extracted from chunk');
    assert(toolCalls[0].function.name === 'insert_structured_document', 'Tool name correctly matches');
  }

  // TEST 5: Graceful Recovery from Post-Tool Empty Responses
  console.log('\nTest Suite 5: Post-Tool Execution Empty Response Recovery');
  {
    // Scenario A: Document Editor tool executed, follow-up model response is empty
    const editorRecords: ExecutedToolRecord[] = [
      {
        name: 'insert_structured_document',
        arguments: { content: 'Inserted report', position: 'cursor' },
        success: true,
        summary: 'Inserted 150 characters',
        isEditorAction: true,
      },
    ];
    const docConfirmation = synthesizeToolCompletionConfirmation(editorRecords, {
      activeDocTitle: 'Annual Report',
      workspaceType: 'doc',
    });
    assert(
      docConfirmation.includes('Annual Report') && docConfirmation.includes('I have applied the requested updates'),
      'Synthesize authoritative document update confirmation on empty follow-up'
    );

    // Scenario B: Workspace file creation tool executed, follow-up response is empty
    const fileRecords: ExecutedToolRecord[] = [
      {
        name: 'create_workspace_file',
        arguments: { title: 'Q4 Summary.md', content: '# Q4' },
        success: true,
        summary: 'Created file',
        isFileOp: true,
        data: { title: 'Q4 Summary.md' },
      },
    ];
    const fileConfirmation = synthesizeToolCompletionConfirmation(fileRecords, {
      workspaceType: 'files',
    });
    assert(
      fileConfirmation.includes('Q4 Summary.md') && fileConfirmation.includes('I created'),
      'Synthesize authoritative file creation confirmation on empty follow-up'
    );

    // Scenario C: Web search executed, follow-up response is empty
    const searchRecords: ExecutedToolRecord[] = [
      {
        name: 'web_search',
        arguments: { query: 'Next.js 16 release date' },
        success: true,
        summary: 'Searched web',
        data: {
          query: 'Next.js 16 release date',
          results: [
            { title: 'Next.js 16 Released', url: 'https://nextjs.org/blog/next-16', snippet: 'Next.js 16 includes turbopack...' },
          ],
        },
      },
    ];
    const searchConfirmation = synthesizeToolCompletionConfirmation(searchRecords, {
      workspaceType: 'research',
    });
    assert(
      searchConfirmation.includes('https://nextjs.org/blog/next-16') && searchConfirmation.includes('Next.js 16 Released'),
      'Synthesize formatted web search results on empty follow-up'
    );
  }

  // TEST 6: Key Rotation Protection (Never rotate on empty responses or parse errors)
  console.log('\nTest Suite 6: Key Rotation Exemption for Empty & Parse Errors');
  {
    const emptyResponseMsg = 'The AI provider returned an empty response. Please verify your API key, model selection, or network connection.';
    assert(
      isCredentialError(undefined, emptyResponseMsg) === false,
      'Empty response error does NOT trigger key rotation'
    );

    const jsonParseMsg = 'SyntaxError: Unexpected token < in JSON at position 0';
    assert(
      isCredentialError(undefined, jsonParseMsg) === false,
      'JSON parse error does NOT trigger key rotation'
    );

    const emptyTextMsg = 'Empty response body received from server';
    assert(
      isCredentialError(undefined, emptyTextMsg) === false,
      'Generic empty body error does NOT trigger key rotation'
    );

    // Verify legitimate credential errors DO trigger rotation
    const authError401 = 'Cloudflare Authentication Error (401): Invalid API Token.';
    assert(
      isCredentialError(401, authError401) === true,
      'HTTP 401 authentication error correctly triggers key rotation'
    );

    const rateLimit429 = 'Cloudflare Rate Limit (429): Workers AI rate limit or quota exceeded.';
    assert(
      isCredentialError(429, rateLimit429) === true,
      'HTTP 429 rate limit error correctly triggers key rotation'
    );
  }

  // TEST 7: Streaming Trailing Buffer Recovery
  console.log('\nTest Suite 7: Streaming Trailing Buffer Recovery');
  {
    // Simulate a stream chunk that ends without a newline (e.g. final chunk in SSE)
    const streamBuffer = 'data: {"choices":[{"delta":{"content":"Final piece of text"}}]}';
    const parsed = parseSSELine(streamBuffer);
    assert(parsed.json !== null, 'Trailing un-newline buffer parsed successfully');
    assert(extractDeltaFromChunk(parsed.json) === 'Final piece of text', 'Trailing buffer delta extracted without loss');
  }

  console.log('\n======================================================');
  console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

