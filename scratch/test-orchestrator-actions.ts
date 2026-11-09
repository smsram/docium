import { runAgentOrchestrator, AgentSSEEvent } from '../src/lib/ai/agent/orchestrator';
import { registerProviderAdapter } from '../src/lib/ai/adapters/registry';
import { BaseProviderAdapter, NormalizedStreamChunk, NormalizedToolDefinition } from '../src/lib/ai/adapters/base';
import { ProviderId } from '../src/lib/types';

// Mock adapter to test orchestrator behavior
class MockOrchestratorAdapter implements BaseProviderAdapter {
  readonly providerId = 'openai' as ProviderId;
  name = 'Mock Test Adapter';

  constructor(private behavior: 'narrative_then_tool' | 'direct_narrative' | 'greeting') {}

  supportsVision(): boolean {
    return false;
  }

  supportsNativeTools(): boolean {
    return true;
  }

  async *generateStream(
    messages: Array<{ role: string; content?: string }>,
    _tools?: NormalizedToolDefinition[]
  ): AsyncIterable<NormalizedStreamChunk> {
    const lastMsg = messages[messages.length - 1];

    if (this.behavior === 'greeting') {
      yield { type: 'delta', delta: 'Hello! How can I assist you with your document today?' };
      return;
    }

    if (this.behavior === 'direct_narrative') {
      // Direct text output without tools (e.g., non-tool model or natural text)
      yield { type: 'delta', delta: "Sure! I'll add an about section:\n\n## About the AI Assistant\n\nI am DOCIUM AI, designed to assist with editing and researching." };
      return;
    }

    if (this.behavior === 'narrative_then_tool') {
      if (lastMsg.content?.includes('[SYSTEM ACTION ENFORCEMENT]')) {
        // Round 2: model invokes tool upon enforcement
        yield {
          type: 'tool_call',
          toolCall: {
            id: 'call_1',
            name: 'insert_structured_document',
            arguments: {
              title: 'About the Author',
              content: 'This document was authored by the DOCIUM intelligence team.',
              position: 'cursor',
            },
          },
        };
      } else {
        // Round 1: model just promised in narrative
        yield { type: 'delta', delta: "I'll add an about section to the document right away!" };
      }
    }
  }
}

async function runOrchestratorTests() {
  console.log('--- Testing Orchestrator E2E Behaviors ---\n');

  // Test 1: Simple Greeting "Hi"
  console.log('1. Testing greeting "Hi"...');
  registerProviderAdapter('mock-greeting', new MockOrchestratorAdapter('greeting') as unknown as BaseProviderAdapter);
  const greetingGen = runAgentOrchestrator({
    workspaceId: 'ws-1',
    workspaceType: 'doc',
    conversationId: 'conv-1',
    userPrompt: 'Hi',
    attachedSources: [],
    conversationHistory: [],
    providerId: 'mock-greeting' as ProviderId,
    modelId: 'test-model',
    apiKey: 'mock-key',
    scratchpad: '',
  });

  const greetingEvents: AgentSSEEvent[] = [];
  for await (const evt of greetingGen) {
    greetingEvents.push(evt);
  }

  const greetingDeltas = greetingEvents.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
  const hasToolExecution = greetingEvents.some((e) => e.type === 'status' && (e as { status: string }).status === 'executing_tool');
  console.log(`Greeting output: "${greetingDeltas}"`);
  console.log(`Tool execution invoked for greeting? ${hasToolExecution ? 'YES (FAIL)' : 'NO (PASS)'}`);
  if (hasToolExecution || !greetingDeltas.includes('Hello!')) {
    throw new Error('Greeting test failed');
  }

  // Test 2: Narrative Promise -> Enforcement Round 2
  console.log('\n2. Testing Narrative Promise Action Enforcement (Two-round enforcement)...');
  registerProviderAdapter('mock-enforce', new MockOrchestratorAdapter('narrative_then_tool') as unknown as BaseProviderAdapter);
  const enforceGen = runAgentOrchestrator({
    workspaceId: 'ws-1',
    workspaceType: 'doc',
    conversationId: 'conv-2',
    userPrompt: 'Place some content in the page as about yourself',
    attachedSources: [],
    conversationHistory: [],
    providerId: 'mock-enforce' as ProviderId,
    modelId: 'test-model',
    apiKey: 'mock-key',
    scratchpad: '',
  });

  const enforceEvents: AgentSSEEvent[] = [];
  for await (const evt of enforceGen) {
    enforceEvents.push(evt);
  }

  const editorActions = enforceEvents.filter((e) => e.type === 'editor_action');
  console.log(`Editor actions yielded: ${editorActions.length}`);
  if (editorActions.length === 0) {
    throw new Error('Action enforcement failed to execute editor action');
  }
  console.log('Editor action:', JSON.stringify(editorActions[0]));

  // Test 3: Direct Narrative Content -> Fallback Document Insertion
  console.log('\n3. Testing Direct Narrative Fallback Execution...');
  registerProviderAdapter('mock-fallback', new MockOrchestratorAdapter('direct_narrative') as unknown as BaseProviderAdapter);
  const fallbackGen = runAgentOrchestrator({
    workspaceId: 'ws-1',
    workspaceType: 'doc',
    conversationId: 'conv-3',
    userPrompt: 'Write an about section in the document',
    attachedSources: [],
    conversationHistory: [],
    providerId: 'mock-fallback' as ProviderId,
    modelId: 'test-model',
    apiKey: 'mock-key',
    scratchpad: '',
  });

  const fallbackEvents: AgentSSEEvent[] = [];
  for await (const evt of fallbackGen) {
    fallbackEvents.push(evt);
  }

  const fallbackEditorActions = fallbackEvents.filter((e) => e.type === 'editor_action');
  console.log(`Fallback editor actions yielded: ${fallbackEditorActions.length}`);
  if (fallbackEditorActions.length === 0) {
    throw new Error('Fallback action execution failed to yield editor action');
  }
  console.log('Fallback Editor action:', JSON.stringify(fallbackEditorActions[0]));

  console.log('\nAll Orchestrator E2E Tests PASSED Successfully!');
}

runOrchestratorTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
