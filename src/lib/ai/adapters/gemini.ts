/**
 * Google Gemini Provider Adapter
 * streamGenerateContent API with native function declarations, streaming, and vision.
 */

import {
  BaseProviderAdapter,
  NormalizedMessage,
  NormalizedToolDefinition,
  AdapterOptions,
  NormalizedStreamChunk,
} from './base';

export class GeminiAdapter implements BaseProviderAdapter {
  readonly providerId = 'gemini';

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
    const model = options.model || 'gemini-1.5-pro';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${options.apiKey}&alt=sse`;

    let systemInstruction = '';
    const contents: { role: 'user' | 'model'; parts: unknown[] }[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + m.content;
      } else if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: m.name || 'tool_response',
                response: { content: m.content },
              },
            },
          ],
        });
      } else if (m.role === 'assistant') {
        const parts: unknown[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        contents.push({ role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      }
    }

    const bodyPayload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.4,
      },
    };

    if (systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (tools.length > 0) {
      bodyPayload.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: options.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      yield { type: 'error', error: `Failed to connect to Gemini: ${msg}` };
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
        error: `Gemini API error (${response.status}): ${errDetail}`,
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
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) {
                const errMsg = parsed.error.message || JSON.stringify(parsed.error);
                yield { type: 'error', error: `Gemini error: ${errMsg}` };
                return;
              }
              if (parsed.promptFeedback?.blockReason) {
                yield { type: 'error', error: `Gemini blocked prompt: ${parsed.promptFeedback.blockReason}` };
                return;
              }
              const candidate = parsed.candidates?.[0];
              if (!candidate) continue;

              if (candidate.finishReason && candidate.finishReason === 'SAFETY') {
                yield { type: 'error', error: 'Gemini safety block: generation could not complete.' };
                return;
              }

              const parts = candidate.content?.parts;
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  // Skip internal thoughts from Gemini 2.0 Thinking models
                  if (part.text && !part.thought) {
                    yield { type: 'delta', delta: part.text };
                  }
                  if (part.functionCall) {
                    yield {
                      type: 'tool_call',
                      toolCall: {
                        id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        name: part.functionCall.name,
                        arguments: part.functionCall.args || {},
                      },
                    };
                  }
                }
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

