/**
 * OpenAI-Compatible Provider Adapter
 * Powers OpenAI, Groq, OpenRouter, Ollama, and Custom endpoints.
 */

import {
  BaseProviderAdapter,
  NormalizedMessage,
  NormalizedToolDefinition,
  AdapterOptions,
  NormalizedStreamChunk,
} from './base';
import { ProviderId } from '@/lib/types';

export class OpenAICompatibleAdapter implements BaseProviderAdapter {
  constructor(public readonly providerId: ProviderId, private readonly defaultEndpoint: string) {}

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
    const rawEndpoint = options.baseUrl || this.defaultEndpoint;
    const cleanEndpoint = rawEndpoint.replace(/\/+$/, '');
    const url = cleanEndpoint.endsWith('/chat/completions')
      ? cleanEndpoint
      : `${cleanEndpoint}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.apiKey) {
      headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    if (this.providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://docium.dev';
      headers['X-Title'] = 'Docium AI Workspace';
    }

    // Transform messages
    const formattedMessages = messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId || 'call_0',
        };
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {}),
            },
          })),
        };
      }
      if (m.images && m.images.length > 0) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            ...m.images.map((img) => ({
              type: 'image_url',
              image_url: { url: img },
            })),
          ],
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const bodyPayload: Record<string, unknown> = {
      model: options.model,
      messages: formattedMessages,
      stream: true,
      temperature: options.temperature ?? 0.4,
    };

    if (tools.length > 0) {
      bodyPayload.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      bodyPayload.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: options.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      yield { type: 'error', error: `Failed to connect to ${this.providerId}: ${msg}` };
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
        error: `${this.providerId} API error (${response.status}): ${errDetail}`,
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

    // Track active streaming tool calls across chunks
    const pendingToolCalls: Record<number, { id: string; name: string; argsBuffer: string }> = {};
    let toolCallsFlushed = false;

    const flushToolCalls = function* () {
      if (toolCallsFlushed) return;
      toolCallsFlushed = true;
      for (const idx of Object.keys(pendingToolCalls)) {
        const tc = pendingToolCalls[Number(idx)];
        if (!tc || !tc.name) continue;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.argsBuffer || '{}');
        } catch {
          parsedArgs = { raw: tc.argsBuffer };
        }
        yield {
          type: 'tool_call' as const,
          toolCall: {
            id: tc.id || `call_${Date.now()}_${idx}`,
            name: tc.name,
            arguments: parsedArgs,
          },
        };
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip keepalive comments
          if (trimmed === 'data: [DONE]') {
            yield* flushToolCalls();
            yield { type: 'done' };
            return;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) {
                const errMsg = parsed.error.message || JSON.stringify(parsed.error);
                yield { type: 'error', error: `${this.providerId} error: ${errMsg}` };
                return;
              }
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;
              // Ignore DeepSeek R1 / Groq / Ollama reasoning_content in normal text delta
              const textDelta = delta?.content ?? choice.text ?? choice.message?.content;
              if (typeof textDelta === 'string' && textDelta.length > 0) {
                yield { type: 'delta', delta: textDelta };
              }

              if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
                for (const tcDelta of delta.tool_calls) {
                  const index = tcDelta.index ?? 0;
                  if (!pendingToolCalls[index]) {
                    pendingToolCalls[index] = {
                      id: tcDelta.id || `call_${Date.now()}_${index}`,
                      name: tcDelta.function?.name || '',
                      argsBuffer: tcDelta.function?.arguments || '',
                    };
                  } else {
                    if (tcDelta.id && !pendingToolCalls[index].id) {
                      pendingToolCalls[index].id = tcDelta.id;
                    }
                    if (tcDelta.function?.name) {
                      pendingToolCalls[index].name += tcDelta.function.name;
                    }
                    if (tcDelta.function?.arguments) {
                      pendingToolCalls[index].argsBuffer += tcDelta.function.arguments;
                    }
                  }
                }
              }

              if (choice.finish_reason === 'tool_calls') {
                yield* flushToolCalls();
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

    yield* flushToolCalls();
    yield { type: 'done' };
  }
}

