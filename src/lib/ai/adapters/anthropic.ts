/**
 * Anthropic Claude Provider Adapter
 * Native Messages API with tools, streaming, and vision.
 */

import {
  BaseProviderAdapter,
  NormalizedMessage,
  NormalizedToolDefinition,
  AdapterOptions,
  NormalizedStreamChunk,
} from './base';

export class AnthropicAdapter implements BaseProviderAdapter {
  readonly providerId = 'anthropic';

  supportsNativeTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true;
  }

  async *generateStream(
    messages: NormalizedMessage[],
    tools: NormalizedToolDefinition[],
    options: AdapterOptions
  ): AsyncIterable<NormalizedStreamChunk> {
    const url = 'https://api.anthropic.com/v1/messages';

    let systemPrompt = '';
    const formattedMessages: { role: 'user' | 'assistant'; content: unknown }[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + m.content;
      } else if (m.role === 'tool') {
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId || 'call_0',
              content: m.content,
            },
          ],
        });
      } else if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length > 0) {
          const contentBlocks: unknown[] = [];
          if (m.content) {
            contentBlocks.push({ type: 'text', text: m.content });
          }
          for (const tc of m.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
          formattedMessages.push({ role: 'assistant', content: contentBlocks });
        } else {
          formattedMessages.push({ role: 'assistant', content: m.content });
        }
      } else {
        formattedMessages.push({ role: 'user', content: m.content });
      }
    }

    let targetModel = options.model || 'claude-3-5-sonnet-20241022';
    if (targetModel === 'claude-3-5-sonnet') {
      targetModel = 'claude-3-5-sonnet-20241022';
    } else if (targetModel === 'claude-3-opus') {
      targetModel = 'claude-3-opus-20240229';
    } else if (targetModel === 'claude-3-haiku') {
      targetModel = 'claude-3-haiku-20240307';
    } else if (targetModel === 'claude-3-7-sonnet') {
      targetModel = 'claude-3-7-sonnet-20250219';
    }

    const bodyPayload: Record<string, unknown> = {
      model: targetModel,
      messages: formattedMessages,
      max_tokens: options.maxTokens || 4096,
      stream: true,
      temperature: options.temperature ?? 0.4,
    };

    if (systemPrompt) {
      bodyPayload.system = systemPrompt;
    }

    if (tools.length > 0) {
      bodyPayload.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(bodyPayload),
        signal: options.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      yield { type: 'error', error: `Failed to connect to Anthropic: ${msg}` };
      return;
    }

    if (!response.ok) {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await response.text();
      }
      yield {
        type: 'error',
        error: `Anthropic API error (${response.status}): ${errDetail}`,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body stream received' };
      return;
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // Track active tool_use block
    let currentToolCall: { id: string; name: string; inputBuffer: string } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'error') {
                const errMsg = event.error?.message || JSON.stringify(event.error);
                yield { type: 'error', error: `Anthropic error: ${errMsg}` };
                return;
              }

              if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'tool_use') {
                  currentToolCall = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    inputBuffer: '',
                  };
                }
              } else if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                  yield { type: 'delta', delta: delta.text };
                } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                  if (currentToolCall) {
                    currentToolCall.inputBuffer += delta.partial_json;
                  }
                }
              } else if (event.type === 'content_block_stop') {
                if (currentToolCall) {
                  let args = {};
                  try {
                    args = JSON.parse(currentToolCall.inputBuffer || '{}');
                  } catch {
                    args = { raw: currentToolCall.inputBuffer };
                  }
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: currentToolCall.id,
                      name: currentToolCall.name,
                      arguments: args as Record<string, unknown>,
                    },
                  };
                  currentToolCall = null;
                }
              } else if (event.type === 'message_stop') {
                yield { type: 'done' };
                return;
              }
            } catch {
              // Ignore single malformed SSE chunk
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Safe: Reader may have already been released or closed by abort
      }
    }

    yield { type: 'done' };
  }
}

