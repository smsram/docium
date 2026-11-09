import { NextRequest } from 'next/server';
import { runAgentOrchestrator, AgentRunParams, AgentSSEEvent } from '@/lib/ai/agent/orchestrator';
import { parseCloudflarePairs } from '@/lib/ai/credentials';

function resolveProviderApiKey(providerId: string, clientKey?: string): string {
  if (clientKey && clientKey.trim()) return clientKey.trim();
  switch (providerId) {
    case 'openai':
      return process.env.OPENAI_API_KEY || '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || '';
    case 'gemini':
      return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    case 'groq':
      return process.env.GROQ_API_KEY || '';
    case 'mistral':
      return process.env.MISTRAL_API_KEY || '';
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY || '';
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY || '';
    case 'cohere':
      return process.env.COHERE_API_KEY || '';
    case 'cloudflare':
      return process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN || '';
    case 'huggingface':
      return process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '';
    default:
      return '';
  }
}

function resolveProviderAccountId(providerId: string, clientAccountId?: string): string {
  if (clientAccountId && clientAccountId.trim()) return clientAccountId.trim();
  if (providerId === 'cloudflare' || providerId === 'cloudflare-flux') {
    return process.env.CLOUDFLARE_ACCOUNT_ID || '';
  }
  return '';
}

function resolveProviderDefaultModel(providerId: string, requestedModel?: string): string {
  if (requestedModel && requestedModel.trim()) {
    if (providerId === 'anthropic') {
      if (requestedModel === 'claude-3-5-sonnet') return 'claude-3-5-sonnet-20241022';
      if (requestedModel.startsWith('claude-')) return requestedModel;
    } else if (providerId === 'openai') {
      if (!requestedModel.startsWith('claude-') && !requestedModel.startsWith('gemini-')) return requestedModel;
    } else if (providerId === 'gemini') {
      if (requestedModel.startsWith('gemini-')) return requestedModel;
    } else if (providerId === 'groq') {
      if (!requestedModel.startsWith('claude-') && !requestedModel.startsWith('gemini-') && !requestedModel.startsWith('gpt-')) return requestedModel;
    } else {
      return requestedModel;
    }
  }

  switch (providerId) {
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'openai':
      return 'gpt-4o';
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'groq':
      return 'llama-3.2-11b-vision-preview';
    case 'openrouter':
      return 'meta-llama/llama-3.2-11b-vision-instruct';
    case 'ollama':
      return 'llama3.2-vision';
    case 'cloudflare':
      return '@cf/meta/llama-3.2-11b-vision-instruct';
    case 'huggingface':
      return 'Qwen/Qwen2-VL-7B-Instruct';
    case 'custom':
      return 'custom-model';
    default:
      return 'gpt-4o';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      requestId,
      workspaceId,
      workspaceType = 'doc',
      conversationId,
      userPrompt,
      attachments = [],
      attachedSources = [],
      explicitSourceIds = [],
      conversationHistory = [],
      scratchpad = '',
      providerId = 'openai',
      modelId,
      apiKey = '',
      baseUrl,
      accountId,
      enabledTools = { internetSearch: false, imageGeneration: false, chartsAndData: true },
      workspaceFiles = [],
      activeDocument,
      timeZone,
    } = body;

    if (!userPrompt || !workspaceId) {
      return new Response(JSON.stringify({ error: 'userPrompt and workspaceId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resolvedApiKey = resolveProviderApiKey(providerId, apiKey);
    const resolvedModelId = resolveProviderDefaultModel(providerId, modelId);
    const resolvedAccountId = resolveProviderAccountId(providerId, accountId);

    // If cloud provider is missing an API key, yield a descriptive SSE error immediately
    if (!resolvedApiKey && providerId !== 'ollama' && providerId !== 'custom') {
      const envName = providerId === 'cloudflare' ? 'CLOUDFLARE_API_TOKEN' : providerId.toUpperCase() + '_API_KEY';
      const providerLabel = providerId === 'cloudflare' ? 'Cloudflare Workers AI' : providerId.charAt(0).toUpperCase() + providerId.slice(1);
      const errMsg = `No API key configured for ${providerLabel}. Please add your API key in Settings > AI Providers or set ${envName} in your environment variables.`;

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const errEvent: AgentSSEEvent = { type: 'error', message: errMsg };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Cloudflare requires an Account ID in addition to the API Token
    if (providerId === 'cloudflare' && !resolvedAccountId) {
      const errMsg =
        'Cloudflare Account ID is required. Please add your 32-character Account ID in Settings > AI Providers or set CLOUDFLARE_ACCOUNT_ID in your environment variables.';

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const errEvent: AgentSSEEvent = { type: 'error', message: errMsg };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Cloudflare 1:1 Account ID to API Token count verification
    if (providerId === 'cloudflare' && resolvedAccountId && resolvedApiKey) {
      const cfCheck = parseCloudflarePairs(resolvedAccountId, resolvedApiKey);
      if (cfCheck.error) {
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const errEvent: AgentSSEEvent = { type: 'error', message: cfCheck.error! };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      }
    }

    const abortController = new AbortController();
    req.signal.addEventListener('abort', () => abortController.abort());

    let searchProvider = body.searchConfig?.provider;
    let searchApiKey = body.searchConfig?.apiKey;

    if (!searchApiKey) {
      if (searchProvider === 'brave') searchApiKey = process.env.BRAVE_API_KEY || '';
      else if (searchProvider === 'tavily') searchApiKey = process.env.TAVILY_API_KEY || '';
      else if (searchProvider === 'serper') searchApiKey = process.env.SERPER_API_KEY || '';
      else {
        if (process.env.BRAVE_API_KEY) {
          searchProvider = 'brave';
          searchApiKey = process.env.BRAVE_API_KEY;
        } else if (process.env.TAVILY_API_KEY) {
          searchProvider = 'tavily';
          searchApiKey = process.env.TAVILY_API_KEY;
        } else if (process.env.SERPER_API_KEY) {
          searchProvider = 'serper';
          searchApiKey = process.env.SERPER_API_KEY;
        }
      }
    }

    const resolvedSearchConfig = {
      provider: searchProvider,
      apiKey: searchApiKey || '',
      baseUrl: body.searchConfig?.baseUrl,
    };

    const params: AgentRunParams = {
      requestId,
      workspaceId,
      workspaceType,
      conversationId: conversationId || `conv-${workspaceId}-1`,
      userPrompt,
      attachments,
      attachedSources,
      explicitSourceIds,
      conversationHistory,
      scratchpad,
      providerId,
      modelId: resolvedModelId,
      apiKey: resolvedApiKey,
      baseUrl,
      accountId: resolvedAccountId,
      searchConfig: resolvedSearchConfig,
      enabledTools,
      workspaceFiles,
      activeDocument,
      timeZone,
      signal: abortController.signal,
    };

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of runAgentOrchestrator(params)) {
            const dataStr = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(dataStr));
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Orchestration error';
          const errEvent = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
          controller.enqueue(encoder.encode(errEvent));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
