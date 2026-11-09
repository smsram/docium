/**
 * Cloudflare Workers AI Provider Adapter
 * Directly executes models on Cloudflare's edge network via REST / SSE streaming.
 * Supports both:
 * 1. Standard model run endpoint: POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL_ID}
 * 2. OpenAI-compatible chat completions endpoint: POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions
 */

import {
  BaseProviderAdapter,
  NormalizedMessage,
  NormalizedToolDefinition,
  AdapterOptions,
  NormalizedStreamChunk,
} from './base';

export interface CloudflareResolvedEndpoint {
  url: string;
  endpointType: 'model_run' | 'chat_completions';
  modelId: string;
  accountId: string;
}

/**
 * Normalizes Cloudflare Account ID: trims whitespace, strips quotes/slashes,
 * and extracts hex ID if an entire URL path was pasted.
 */
export function normalizeCloudflareAccountId(rawAccountId: string): string {
  if (!rawAccountId) return '';
  let a = rawAccountId.trim();
  a = a.replace(/^["']|["']$/g, '');
  if (a === '{account_id}' || a === '{ACCOUNT_ID}') return '';

  // Match 32-character hex account ID if embedded in a string or dashboard URL
  const hexMatch = a.match(/\b([a-f0-9]{32})\b/i);
  if (hexMatch && hexMatch[1]) {
    return hexMatch[1];
  }

  // Extract from URLs like dash.cloudflare.com/{id}/... or api.cloudflare.com/client/v4/accounts/{id}
  const urlMatch = a.match(/(?:accounts|cloudflare\.com)\/([a-zA-Z0-9_\-]+)/i);
  if (urlMatch && urlMatch[1]) {
    a = urlMatch[1];
  }
  return a.replace(/^\/+|\/+$/g, '');
}

/**
 * Normalizes Cloudflare Model ID: trims whitespace, removes accidental quotes,
 * removes accidental leading/trailing slashes, and removes accidental /chat/completions suffixes.
 * Preserves model path segments (e.g. '@cf/meta/llama-3.1-70b-instruct').
 */
export function normalizeCloudflareModelId(rawModel: string): string {
  if (!rawModel) return '@cf/meta/llama-3.1-70b-instruct';
  let m = rawModel.trim();
  m = m.replace(/^["']|["']$/g, '');
  m = m.replace(/^\/+/, '');
  m = m.replace(/\/chat\/completions\/?$/i, '');
  m = m.replace(/\/+$/, '');
  return m || '@cf/meta/llama-3.1-70b-instruct';
}

/**
 * Determines whether a given model supports Cloudflare's OpenAI-compatible /ai/v1/chat/completions endpoint.
 */
export function isChatCompletionsSupportedModel(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return (
    m.includes('instruct') ||
    m.includes('chat') ||
    m.includes('llama') ||
    m.includes('mistral') ||
    m.includes('qwen') ||
    m.includes('deepseek') ||
    m.includes('gemma') ||
    m.includes('phi') ||
    m.includes('hermes') ||
    m.includes('zephyr')
  );
}

/**
 * Builds the canonical Cloudflare Workers AI URL and determines the endpoint protocol.
 * Standard endpoints:
 * - Model Run: https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL_ID}
 * - Chat Completions: https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions
 */
export function resolveCloudflareEndpoint(params: {
  accountId: string;
  model: string;
  baseUrl?: string;
  preferEndpoint?: 'auto' | 'model_run' | 'chat_completions';
}): CloudflareResolvedEndpoint {
  const cleanAccountId = normalizeCloudflareAccountId(params.accountId);
  const cleanModel = normalizeCloudflareModelId(params.model);
  const rawBaseUrl = (params.baseUrl || '').trim();

  // 1. If a custom Base URL is explicitly supplied (e.g. AI Gateway or specific v1 endpoint)
  if (rawBaseUrl) {
    let base = rawBaseUrl.replace(/\/+$/, '');
    if (cleanAccountId) {
      base = base.replace(/\{account_id\}/gi, cleanAccountId);
    }

    if (base.endsWith('/chat/completions')) {
      return {
        url: base,
        endpointType: 'chat_completions',
        modelId: cleanModel,
        accountId: cleanAccountId,
      };
    }

    if (base.endsWith('/ai/v1')) {
      return {
        url: `${base}/chat/completions`,
        endpointType: 'chat_completions',
        modelId: cleanModel,
        accountId: cleanAccountId,
      };
    }

    if (base.includes('/ai/run')) {
      if (base.endsWith(cleanModel)) {
        return {
          url: base,
          endpointType: 'model_run',
          modelId: cleanModel,
          accountId: cleanAccountId,
        };
      }
      return {
        url: `${base}/${cleanModel}`,
        endpointType: 'model_run',
        modelId: cleanModel,
        accountId: cleanAccountId,
      };
    }

    if (params.preferEndpoint === 'chat_completions' || isChatCompletionsSupportedModel(cleanModel)) {
      const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/ai/v1/chat/completions`;
      return {
        url: endpoint.replace(/([^:]\/)\/+/g, '$1'),
        endpointType: 'chat_completions',
        modelId: cleanModel,
        accountId: cleanAccountId,
      };
    }
  }

  // 2. Standard Automatic Cloudflare Endpoints
  if (params.preferEndpoint === 'chat_completions') {
    return {
      url: `https://api.cloudflare.com/client/v4/accounts/${cleanAccountId}/ai/v1/chat/completions`,
      endpointType: 'chat_completions',
      modelId: cleanModel,
      accountId: cleanAccountId,
    };
  }

  // Default standard endpoint: /ai/run/{MODEL_ID}
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${cleanAccountId}/ai/run/${cleanModel}`,
    endpointType: 'model_run',
    modelId: cleanModel,
    accountId: cleanAccountId,
  };
}

/**
 * Safe, informative error formatting for Cloudflare Workers AI responses.
 * Never exposes API tokens or authorization headers.
 */
export function parseCloudflareError(
  status: number,
  errJson: { errors?: Array<{ code?: number; message?: string }>; error?: { message?: string } | string } | null,
  rawText: string
): string {
  const code = errJson?.errors?.[0]?.code;
  const rawMsg =
    errJson?.errors?.[0]?.message ||
    (typeof errJson?.error === 'object' ? errJson?.error?.message : errJson?.error) ||
    rawText ||
    'Unknown Cloudflare error';

  if (code === 7000 || rawMsg.includes('No route for that URI')) {
    return 'Cloudflare Routing Error (400): No route for that URI. Please verify your Account ID and model selection in Settings > AI Providers.';
  }
  if (code === 7003 || rawMsg.includes('Could not route to')) {
    return 'Cloudflare Account Error (7003): Invalid Account ID or model identifier. Verify your 32-character Account ID from the Cloudflare dashboard.';
  }
  if (code === 10000 || status === 401 || rawMsg.includes('Authentication error')) {
    return "Cloudflare Authentication Error (401): Invalid API Token. Verify that your API token is active and has 'Workers AI' Read/Edit permissions.";
  }
  if (status === 403 || code === 10001) {
    return 'Cloudflare Permission Error (403): Your API Token lacks Workers AI permissions for this account.';
  }
  if (status === 429) {
    return 'Cloudflare Rate Limit (429): Workers AI rate limit or quota exceeded.';
  }
  return `Cloudflare AI error (${status}): ${rawMsg}`;
}

/**
 * Extracts delta text from varied Cloudflare Workers AI streaming or non-streaming responses.
 * Supports OpenAI-compatible content, reasoning content (Qwen/DeepSeek), Workers AI raw response, and result envelopes.
 */
export function extractDeltaFromChunk(
  parsed: {
    response?: string;
    choices?: Array<{
      delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
      message?: { content?: string | null; reasoning_content?: string | null };
      text?: string;
    }>;
    result?: { response?: string; text?: string } | string;
    output_text?: string;
  }
): string | null {
  // 1. Direct Workers AI streaming: {"response":"token"}
  if (typeof parsed.response === 'string' && parsed.response.length > 0) {
    return parsed.response;
  }
  // 2. OpenAI-compatible chat completions chunk: {"choices":[{"delta":{"content":"token"}}]}
  const choiceDelta = parsed.choices?.[0]?.delta?.content;
  if (typeof choiceDelta === 'string' && choiceDelta.length > 0) {
    return choiceDelta;
  }
  // 3. OpenAI-compatible non-streaming choice: {"choices":[{"message":{"content":"token"}}]}
  const choiceMessage = parsed.choices?.[0]?.message?.content;
  if (typeof choiceMessage === 'string' && choiceMessage.length > 0) {
    return choiceMessage;
  }
  // 4. Reasoning content (Qwen 2.5/3.8, DeepSeek models) if normal content is empty
  const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning;
  if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
    // Only return reasoning if explicitly present
    return reasoningDelta;
  }
  // 5. Completions legacy text field: {"choices":[{"text":"token"}]}
  const choiceText = parsed.choices?.[0]?.text;
  if (typeof choiceText === 'string' && choiceText.length > 0) {
    return choiceText;
  }
  // 6. Workers AI non-streaming result envelope: {"result":{"response":"text"}}
  if (typeof parsed.result === 'object' && parsed.result !== null) {
    if (typeof parsed.result.response === 'string' && parsed.result.response.length > 0) {
      return parsed.result.response;
    }
    if (typeof parsed.result.text === 'string' && parsed.result.text.length > 0) {
      return parsed.result.text;
    }
  }
  if (typeof parsed.result === 'string' && parsed.result.length > 0) {
    return parsed.result;
  }
  // 7. Direct output_text field
  if (typeof parsed.output_text === 'string' && parsed.output_text.length > 0) {
    return parsed.output_text;
  }
  return null;
}

/**
 * Robust Server-Sent Events (SSE) line parser.
 * Handles data: [DONE], data:[DONE], data: {...}, data:{...}, and raw JSON lines.
 */
export function parseSSELine(line: string): { isDone: boolean; json: any | null } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return { isDone: false, json: null };
  }

  // Handle [DONE] with or without space
  if (/^data:\s*\[DONE\]$/i.test(trimmed)) {
    return { isDone: true, json: null };
  }

  let jsonStr = '';
  if (/^data:\s*/i.test(trimmed)) {
    jsonStr = trimmed.replace(/^data:\s*/i, '');
  } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    jsonStr = trimmed;
  } else {
    return { isDone: false, json: null };
  }

  if (jsonStr === '[DONE]') {
    return { isDone: true, json: null };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return { isDone: false, json: parsed };
  } catch {
    return { isDone: false, json: null };
  }
}

export class CloudflareAdapter implements BaseProviderAdapter {
  readonly providerId = 'cloudflare';

  supportsNativeTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true;
  }

  formatMessages(messages: NormalizedMessage[]) {
    return messages.map((m) => {
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
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
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
  }

  buildPayload(
    messages: NormalizedMessage[],
    model = '@cf/qwen/qwen3.8-27b',
    endpointType: 'model_run' | 'chat_completions' = 'chat_completions',
    options?: { temperature?: number; maxTokens?: number; tools?: NormalizedToolDefinition[] }
  ) {
    const cleanModel = normalizeCloudflareModelId(model);
    const formatted = this.formatMessages(messages);
    if (endpointType === 'chat_completions') {
      const payload: Record<string, unknown> = {
        model: cleanModel,
        messages: formatted,
        stream: true,
        temperature: options?.temperature ?? 0.4,
        max_tokens: options?.maxTokens || 4096,
      };
      if (options?.tools && options.tools.length > 0) {
        payload.tools = options.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
        payload.tool_choice = 'auto';
      }
      return payload;
    }
    return {
      messages: formatted,
      stream: true,
      max_tokens: options?.maxTokens || 4096,
    };
  }

  async *generateStream(
    messages: NormalizedMessage[],
    tools: NormalizedToolDefinition[],
    options: AdapterOptions
  ): AsyncIterable<NormalizedStreamChunk> {
    const accountId = normalizeCloudflareAccountId(options.accountId || '');
    if (!accountId) {
      yield {
        type: 'error',
        error: 'Cloudflare Account ID is missing. Please add your 32-character Account ID in Settings > AI Providers.',
      };
      return;
    }

    if (!options.apiKey) {
      yield {
        type: 'error',
        error: 'Cloudflare API Token is missing. Please add your API Token in Settings > AI Providers.',
      };
      return;
    }

    const cleanModel = normalizeCloudflareModelId(options.model || '@cf/qwen/qwen3.8-27b');
    const hasImages = messages.some((m) => m.images && m.images.length > 0);
    const hasTools = tools && tools.length > 0;

    // Resolve primary endpoint strategy (prefer chat_completions whenever tools, vision, or instruct models are requested)
    const primary = resolveCloudflareEndpoint({
      accountId,
      model: cleanModel,
      baseUrl: options.baseUrl,
      preferEndpoint: hasTools || hasImages || isChatCompletionsSupportedModel(cleanModel) ? 'chat_completions' : undefined,
    });

    console.log(`[DOCIUM AI Diagnostic] Cloudflare request started | model: ${cleanModel} | endpointType: ${primary.endpointType} | toolsCount: ${hasTools ? tools.length : 0}`);

    const buildPayload = (endpointType: 'model_run' | 'chat_completions', stream = true) => {
      const p = this.buildPayload(messages, cleanModel, endpointType, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools: tools && tools.length > 0 ? tools : undefined,
      });
      p.stream = stream;
      return p;
    };

    let response: Response | null = null;
    let lastNetworkError: string | null = null;
    const maxRetries = 2;
    let attempt = 0;

    // Bounded retries with exponential backoff & jitter for transient network / 429 / 5xx errors
    while (attempt <= maxRetries) {
      attempt++;
      try {
        const res = await fetch(primary.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(buildPayload(primary.endpointType, true)),
          signal: options.signal,
        });

        // If primary returned 400 "No route for that URI" or 404, and user did not specify a custom baseUrl, try alternative endpoint
        if (!res.ok && (res.status === 400 || res.status === 404) && !options.baseUrl) {
          const altType = primary.endpointType === 'model_run' ? 'chat_completions' : 'model_run';
          const altEndpoint = resolveCloudflareEndpoint({
            accountId,
            model: cleanModel,
            preferEndpoint: altType,
          });

          console.log(`[Cloudflare Workers AI] Route check: retrying alternative endpoint (model: ${cleanModel})`);

          const altRes = await fetch(altEndpoint.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify(buildPayload(altEndpoint.endpointType, true)),
            signal: options.signal,
          });

          if (altRes.ok) {
            response = altRes;
            break;
          }
        }

        // Check for transient 429 Rate Limit or 5xx Server Errors
        if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
          if (attempt <= maxRetries && !options.signal?.aborted) {
            const retryAfterHeader = res.headers.get('retry-after');
            let delayMs = 600 * Math.pow(2, attempt - 1) + Math.random() * 200;
            if (retryAfterHeader) {
              const sec = parseInt(retryAfterHeader, 10);
              if (!isNaN(sec) && sec > 0 && sec < 10) {
                delayMs = sec * 1000;
              }
            }
            console.warn(`[Cloudflare Workers AI] Transient HTTP ${res.status} (attempt ${attempt}/${maxRetries + 1}). Retrying in ${Math.round(delayMs)}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }

        response = res;
        break;
      } catch (err: unknown) {
        if (options.signal?.aborted) {
          return;
        }
        if (attempt <= maxRetries) {
          const delayMs = 500 * Math.pow(2, attempt - 1) + Math.random() * 200;
          console.warn(`[Cloudflare Workers AI] Connection glitch (attempt ${attempt}/${maxRetries + 1}). Retrying in ${Math.round(delayMs)}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        const msg = err instanceof Error ? err.message : 'Network error';
        lastNetworkError = `Failed to connect to Cloudflare: ${msg}`;
        break;
      }
    }

    if (!response) {
      yield { type: 'error', error: lastNetworkError || 'Failed to connect to Cloudflare Workers AI' };
      return;
    }

    if (!response.ok) {
      let errJson: { errors?: Array<{ code?: number; message?: string }>; error?: { message?: string } | string } | null = null;
      let rawText = '';
      try {
        errJson = await response.json();
      } catch {
        rawText = await response.text();
      }
      const parsedErr = parseCloudflareError(response.status, errJson, rawText);
      console.warn(`[DOCIUM AI Diagnostic] Cloudflare HTTP error ${response.status} | model: ${cleanModel} | detail: ${parsedErr}`);
      yield {
        type: 'error',
        error: parsedErr,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body stream received from Cloudflare' };
      return;
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // Track active streaming tool calls across chunks
    const pendingToolCalls: Record<number, { id: string; name: string; argsBuffer: string }> = {};
    let accumulatedText = '';
    let toolCallsFlushed = false;
    let chunksCount = 0;
    let lastFinishReason: string | null = null;

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
          try {
            const relaxed = (tc.argsBuffer || '{}').replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            parsedArgs = JSON.parse(relaxed);
          } catch {
            parsedArgs = { raw: tc.argsBuffer };
          }
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

    const processLine = function* (line: string): Generator<NormalizedStreamChunk> {
      const { isDone, json } = parseSSELine(line);
      if (isDone) {
        for (const chunk of flushToolCalls()) yield chunk;
        return;
      }
      if (!json) return;

      chunksCount++;

      if (json.error || json.errors?.length) {
        yield { type: 'error', error: parseCloudflareError(400, json, '') };
        return;
      }

      // Check choices for native tool_calls
      const choice = json.choices?.[0];
      if (choice?.finish_reason) {
        lastFinishReason = choice.finish_reason;
      }

      if (choice?.delta?.tool_calls && Array.isArray(choice.delta.tool_calls)) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!pendingToolCalls[idx]) {
            pendingToolCalls[idx] = { id: tc.id || `call_${Date.now()}_${idx}`, name: '', argsBuffer: '' };
          }
          if (tc.id && !pendingToolCalls[idx].id) {
            pendingToolCalls[idx].id = tc.id;
          }
          if (tc.function?.name) {
            pendingToolCalls[idx].name += tc.function.name;
          }
          if (tc.function?.arguments) {
            pendingToolCalls[idx].argsBuffer += tc.function.arguments;
          }
        }
      } else if (choice?.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
        for (const tc of choice.message.tool_calls) {
          const idx = tc.index ?? 0;
          pendingToolCalls[idx] = {
            id: tc.id || `call_${Date.now()}_${idx}`,
            name: tc.function?.name || '',
            argsBuffer: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {}),
          };
        }
      }

      // Flush tool calls when tool_calls finish reason is signaled
      if (choice?.finish_reason === 'tool_calls') {
        for (const chunk of flushToolCalls()) yield chunk;
      }

      const delta = extractDeltaFromChunk(json);
      if (delta) {
        accumulatedText += delta;
        yield { type: 'delta', delta };
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
          for (const chunk of processLine(line)) {
            yield chunk;
          }
        }
      }

      // Process any trailing line in buffer
      if (buffer.trim()) {
        for (const chunk of processLine(buffer.trim())) {
          yield chunk;
        }
      }

      // Flush tool calls if finish_reason was tool_calls or stop, or if tool calls exist
      for (const chunk of flushToolCalls()) {
        yield chunk;
      }

      // If no native tool calls were emitted, check for text-embedded tool calls (e.g. Qwen / open models)
      if (Object.keys(pendingToolCalls).length === 0 && accumulatedText) {
        const tagMatch = accumulatedText.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/i);
        const codeMatch = !tagMatch && accumulatedText.match(/```(?:tool_call|json)?\s*(\{[\s\S]*?"(?:name|action|tool)"[\s\S]*?\})\s*```/i);
        const matchStr = tagMatch ? tagMatch[1] : (codeMatch ? codeMatch[1] : null);

        if (matchStr) {
          try {
            const parsed = JSON.parse(matchStr);
            const toolName = parsed.name || parsed.action || parsed.tool;
            if (toolName) {
              const parsedArgs = (parsed.arguments || parsed.payload || parsed.params || parsed) as Record<string, unknown>;
              delete (parsedArgs as any).name;
              delete (parsedArgs as any).action;
              delete (parsedArgs as any).tool;

              yield {
                type: 'tool_call',
                toolCall: {
                  id: `call_${Date.now()}`,
                  name: toolName,
                  arguments: parsedArgs,
                },
              };
            }
          } catch {
            // Ignore parse errors on text fallback
          }
        }
      }

      // Non-Streaming Fallback: If streaming yielded 0 deltas and 0 tool calls, attempt non-streaming before declaring empty
      if (!options.signal?.aborted && !accumulatedText.trim() && Object.keys(pendingToolCalls).length === 0) {
        console.log(`[Cloudflare Workers AI] Streaming produced empty response (chunks: ${chunksCount}). Attempting non-streaming fallback...`);
        try {
          const nonStreamRes = await fetch(primary.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify(buildPayload(primary.endpointType, false)),
            signal: options.signal,
          });

          if (nonStreamRes.ok) {
            const json = await nonStreamRes.json();
            const choice = json.choices?.[0];

            if (choice?.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
              for (const tc of choice.message.tool_calls) {
                let parsedArgs: Record<string, unknown> = {};
                try {
                  parsedArgs = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {};
                } catch {
                  parsedArgs = { raw: tc.function?.arguments };
                }
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id || `call_${Date.now()}`,
                    name: tc.function?.name || '',
                    arguments: parsedArgs,
                  },
                };
              }
            }

            const text = extractDeltaFromChunk(json);
            if (text) {
              accumulatedText += text;
              yield { type: 'delta', delta: text };
            }
          }
        } catch (fallbackErr) {
          console.warn('[Cloudflare Workers AI] Non-streaming fallback attempt error:', fallbackErr);
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Safe: Reader may have already been released or closed by abort
      }
    }

    console.log(
      `[DOCIUM AI Diagnostic] Cloudflare stream completed | model: ${cleanModel} | chunks: ${chunksCount} | finishReason: ${lastFinishReason || 'none'} | hasText: ${Boolean(accumulatedText.trim())} | toolCalls: ${Object.keys(pendingToolCalls).length}`
    );

    yield { type: 'done' };
  }
}
