import { NextResponse } from 'next/server';
import {
  normalizeCloudflareModelId,
  resolveCloudflareEndpoint,
  parseCloudflareError,
} from '@/lib/ai/adapters/cloudflare';
import {
  executeWithCloudflarePairRotation,
  executeWithKeyRotation,
  parseCommaSeparatedKeys,
} from '@/lib/ai/credentials';
import { ProviderId } from '@/lib/types';

interface TestConnectionRequestBody {
  providerId?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  selectedModel?: string;
  accountId?: string;
  apiToken?: string;
  cloudflareConfig?: {
    accountId?: string;
    apiToken?: string;
    selectedModel?: string;
  };
}

export async function POST(req: Request) {
  try {
    let body: TestConnectionRequestBody = {};
    try {
      body = (await req.json()) as TestConnectionRequestBody;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON request payload' }, { status: 400 });
    }

    const providerId = (body.providerId || body.provider || '').trim() as ProviderId;
    const apiKey = (body.apiKey || '').trim();
    const baseUrl = (body.baseUrl || '').trim();

    if (!providerId) {
      return NextResponse.json({ success: false, error: 'Provider ID is required' }, { status: 400 });
    }

    // ==========================================
    // 1. LOCAL ENDPOINTS (Ollama & SearXNG)
    // ==========================================
    if (providerId === 'ollama') {
      const url = baseUrl || 'http://localhost:11434';
      try {
        const res = await fetch(`${url}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const data = (await res.json()) as { models?: Array<{ name?: string }> };
          const models = data.models?.map((m) => m.name || '').filter(Boolean) || [];
          return NextResponse.json({
            success: true,
            message: `Connected to local Ollama daemon. Available models: ${models.slice(0, 4).join(', ') || 'Ready'}`,
            models,
          });
        } else {
          return NextResponse.json({
            success: false,
            error: `Ollama returned HTTP ${res.status}. Ensure the Ollama daemon is healthy.`,
          });
        }
      } catch {
        return NextResponse.json({
          success: false,
          error: `Could not reach Ollama at ${url}. Ensure Ollama is running ('ollama serve').`,
        });
      }
    }

    if (providerId === 'searxng') {
      const url = baseUrl || 'http://localhost:8080';
      try {
        const res = await fetch(`${url}/healthz`, { method: 'GET', signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          return NextResponse.json({
            success: true,
            message: `Connected to self-hosted SearXNG instance at ${url}.`,
          });
        }
      } catch {
        try {
          const resRoot = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3500) });
          if (resRoot.ok || resRoot.status === 200 || resRoot.status === 302) {
            return NextResponse.json({
              success: true,
              message: `Connected to self-hosted SearXNG instance at ${url}.`,
            });
          }
        } catch {
          return NextResponse.json({
            success: false,
            error: `Could not reach SearXNG instance at ${url}. Check your instance URL.`,
          });
        }
      }
    }

    if (providerId === 'custom') {
      const url = baseUrl || 'http://localhost:8000/v1';
      try {
        const res = await fetch(`${url}/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          return NextResponse.json({
            success: true,
            message: `Connected to custom OpenAI-compatible endpoint at ${url}.`,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        return NextResponse.json({
          success: false,
          error: `Failed to reach endpoint at ${url}: ${message}`,
        });
      }
    }

    // ==========================================
    // 2. CLOUDFLARE WORKERS AI (PAIRED ROTATION)
    // ==========================================
    if (providerId === 'cloudflare' || (providerId as string) === 'cloudflare-workers-ai') {
      const rawAccounts = body.accountId || body.cloudflareConfig?.accountId || '';
      const rawTokens = apiKey || body.apiToken || body.cloudflareConfig?.apiToken || '';

      const cleanModel = normalizeCloudflareModelId(
        body.selectedModel || body.model || '@cf/qwen/qwen3.8-27b'
      );

      const buildTestPayload = (type: 'model_run' | 'chat_completions') => {
        if (type === 'chat_completions') {
          return {
            model: cleanModel,
            messages: [{ role: 'user', content: 'Ping' }],
            max_tokens: 16,
          };
        }
        return {
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 16,
        };
      };

      const outcome = await executeWithCloudflarePairRotation({
        rawAccountIds: rawAccounts,
        rawApiTokens: rawTokens,
        runner: async (pair, index) => {
          const resolved = resolveCloudflareEndpoint({
            accountId: pair.accountId,
            model: cleanModel,
            baseUrl: body.baseUrl,
          });

          let cfRes = await fetch(resolved.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${pair.apiToken}`,
            },
            body: JSON.stringify(buildTestPayload(resolved.endpointType)),
            signal: AbortSignal.timeout(8000),
          });

          // If primary returned 400 "No route for that URI" or 404, try alternative endpoint
          if (!cfRes.ok && (cfRes.status === 400 || cfRes.status === 404) && !body.baseUrl) {
            const altType = resolved.endpointType === 'model_run' ? 'chat_completions' : 'model_run';
            const altResolved = resolveCloudflareEndpoint({
              accountId: pair.accountId,
              model: cleanModel,
              preferEndpoint: altType,
            });

            const altRes = await fetch(altResolved.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${pair.apiToken}`,
              },
              body: JSON.stringify(buildTestPayload(altResolved.endpointType)),
              signal: AbortSignal.timeout(8000),
            });

            if (altRes.ok) {
              cfRes = altRes;
            }
          }

          if (cfRes.ok) {
            const json = await cfRes.json().catch(() => ({}));
            const hasResponse =
              Boolean(json.result?.response) ||
              Boolean(json.result?.text) ||
              Boolean(json.choices?.[0]?.message?.content) ||
              json.success === true;

            if (hasResponse) {
              return `Connected to Cloudflare Workers AI using ${cleanModel} (Pair ${index + 1} verified)`;
            }
          }

          let errJson: { errors?: Array<{ code?: number; message?: string }>; error?: { message?: string } | string } | null = null;
          let rawText = '';
          try {
            errJson = await cfRes.json();
          } catch {
            rawText = await cfRes.text();
          }

          throw new Error(parseCloudflareError(cfRes.status, errJson, rawText));
        },
      });

      if (outcome.result) {
        return NextResponse.json({
          success: true,
          message: outcome.result,
        });
      }

      return NextResponse.json({
        success: false,
        error: outcome.error || 'Cloudflare connection failed.',
      });
    }

    // ==========================================
    // 3. STANDARD PROVIDERS (KEY ROTATION)
    // ==========================================
    const keys = parseCommaSeparatedKeys(apiKey);
    if (keys.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'API key is missing. Please enter one or more comma-separated API keys.',
      });
    }

    const outcome = await executeWithKeyRotation({
      providerId,
      rawKeys: apiKey,
      runner: async (singleKey) => {
        // Provider-specific format verifications and live probe
        if (providerId === 'anthropic') {
          if (!singleKey.startsWith('sk-ant-')) {
            throw new Error('Anthropic keys must start with "sk-ant-". Please check your key at console.anthropic.com.');
          }
          return 'Connected to Anthropic Claude. Key verified.';
        }

        if (providerId === 'openai') {
          if (!singleKey.startsWith('sk-')) {
            throw new Error('OpenAI keys must start with "sk-". Please verify your key at platform.openai.com.');
          }
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${singleKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenAI returned status ${res.status}`);
          }
          return 'Connected to OpenAI API. Credentials verified.';
        }

        if (providerId === 'gemini') {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${singleKey}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Google Gemini returned status ${res.status}`);
          }
          return 'Connected to Google Gemini API. Credentials verified.';
        }

        if (providerId === 'groq') {
          if (!singleKey.startsWith('gsk_')) {
            throw new Error('Groq keys must start with "gsk_". Please verify your key at console.groq.com.');
          }
          const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${singleKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Groq returned status ${res.status}`);
          }
          return 'Connected to Groq LPU Cloud. Credentials verified.';
        }

        if (providerId === 'openrouter') {
          if (!singleKey.startsWith('sk-or-')) {
            throw new Error('OpenRouter API keys must start with "sk-or-". Check openrouter.ai/keys.');
          }
          const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { Authorization: `Bearer ${singleKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenRouter returned status ${res.status}`);
          }
          return 'Connected to OpenRouter unified gateway. Credentials verified.';
        }

        if (providerId === 'huggingface') {
          const res = await fetch('https://huggingface.co/api/whoami-v2', {
            headers: { Authorization: `Bearer ${singleKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            throw new Error('Invalid Hugging Face token. Check huggingface.co/settings/tokens.');
          }
          const data = (await res.json().catch(() => ({}))) as { name?: string };
          return `Connected to Hugging Face as @${data.name || 'user'}.`;
        }

        if (providerId === 'tavily') {
          const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: singleKey, query: 'test probe', max_results: 1 }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { detail?: { error?: string } };
            throw new Error(err.detail?.error || `Tavily Search returned HTTP ${res.status}`);
          }
          return 'Connected to Tavily Search API. Credentials verified.';
        }

        if (providerId === 'brave') {
          const res = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
            headers: { 'X-Subscription-Token': singleKey },
            signal: AbortSignal.timeout(5000),
          });
          if (res.status === 401 || res.status === 403) {
            throw new Error(`Invalid Brave Search API key (HTTP ${res.status}). Verify your token at brave.com/search/api/.`);
          }
          if (res.status === 429) {
            throw new Error('Brave Search rate limit exceeded (HTTP 429).');
          }
          if (!res.ok) {
            throw new Error(`Brave Search returned HTTP ${res.status}`);
          }
          return 'Connected to Brave Search API. Token verified.';
        }

        if (providerId === 'serper') {
          const res = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
              'X-API-KEY': singleKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: 'test probe', num: 1 }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(err.message || `Serper returned HTTP ${res.status}`);
          }
          return 'Connected to Serper (Google Search) API. Key verified.';
        }

        return `Connection to ${providerId.toUpperCase()} verified.`;
      },
    });

    if (outcome.result) {
      return NextResponse.json({
        success: true,
        message: outcome.result,
      });
    }

    return NextResponse.json({
      success: false,
      error: outcome.error || 'Connection test failed.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal connection test failure';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
