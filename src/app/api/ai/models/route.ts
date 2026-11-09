import { NextResponse } from 'next/server';
import { ProviderId, ModelOption } from '@/lib/types';
import { getProviderCatalogItem, inferModelCapabilities } from '@/lib/ai/providers';
import { normalizeCloudflareAccountId } from '@/lib/ai/adapters/cloudflare';

interface ModelsRequestPayload {
  providerId: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerId = url.searchParams.get('providerId') as ProviderId | null;
  const apiKey = url.searchParams.get('apiKey') || '';
  const baseUrl = url.searchParams.get('baseUrl') || '';
  const accountId = url.searchParams.get('accountId') || '';

  if (!providerId) {
    return NextResponse.json({ success: false, error: 'providerId query parameter is required' }, { status: 400 });
  }

  return discoverModels({ providerId, apiKey, baseUrl, accountId });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ModelsRequestPayload;
    if (!body?.providerId) {
      return NextResponse.json({ success: false, error: 'providerId is required' }, { status: 400 });
    }
    return discoverModels(body);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON request payload' }, { status: 400 });
  }
}

async function discoverModels(params: ModelsRequestPayload) {
  const { providerId, apiKey = '', baseUrl = '', accountId = '' } = params;
  const catalogItem = getProviderCatalogItem(providerId);
  const fallbackModels = catalogItem?.models || [];

  try {
    // ----------------------------------------------------
    // 1. OLLAMA
    // ----------------------------------------------------
    if (providerId === 'ollama') {
      const endpoint = (baseUrl.trim() || 'http://localhost:11434').replace(/\/+$/, '');
      const res = await fetch(`${endpoint}/api/tags`, {
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          error: `Ollama returned HTTP ${res.status}. Ensure Ollama is running.`,
          models: fallbackModels,
        });
      }

      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          size?: number;
          details?: { parameter_size?: string; family?: string };
        }>;
      };

      const discovered: ModelOption[] = (data.models || []).map((m) => {
        const sizeMb = m.size ? Math.round(m.size / (1024 * 1024)) : 0;
        const sizeStr = sizeMb > 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`;
        return {
          id: m.name,
          name: `${m.name} (${sizeStr})`,
          capabilities: inferModelCapabilities(m.name, m.name),
          description: `Locally installed model (${sizeStr})`,
        };
      });

      return NextResponse.json({
        success: true,
        source: 'live',
        models: discovered.length > 0 ? discovered : fallbackModels,
      });
    }

    // ----------------------------------------------------
    // 2. OPENAI
    // ----------------------------------------------------
    if (providerId === 'openai') {
      if (!apiKey.trim()) {
        return NextResponse.json({
          success: true,
          source: 'catalog',
          models: fallbackModels,
        });
      }

      const endpoint = (baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const res = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        const allowedPrefixes = ['gpt-4', 'gpt-3.5', 'o1', 'o3', 'chatgpt'];
        const discovered: ModelOption[] = (data.data || [])
          .filter((m) => allowedPrefixes.some((p) => m.id.toLowerCase().startsWith(p)))
          .map((m) => ({
            id: m.id,
            name: m.id,
            capabilities: inferModelCapabilities(m.id),
          }));

        return NextResponse.json({
          success: true,
          source: 'live',
          models: discovered.length > 0 ? discovered : fallbackModels,
        });
      }
    }

    // ----------------------------------------------------
    // 3. GROQ
    // ----------------------------------------------------
    if (providerId === 'groq') {
      if (!apiKey.trim()) {
        return NextResponse.json({ success: true, source: 'catalog', models: fallbackModels });
      }

      const endpoint = (baseUrl.trim() || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
      const res = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        const discovered: ModelOption[] = (data.data || []).map((m) => ({
          id: m.id,
          name: m.id,
          capabilities: inferModelCapabilities(m.id),
        }));

        return NextResponse.json({
          success: true,
          source: 'live',
          models: discovered.length > 0 ? discovered : fallbackModels,
        });
      }
    }

    // ----------------------------------------------------
    // 4. OPENROUTER
    // ----------------------------------------------------
    if (providerId === 'openrouter') {
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          data?: Array<{
            id: string;
            name?: string;
            description?: string;
            context_length?: number;
          }>;
        };

        const discovered: ModelOption[] = (data.data || []).slice(0, 40).map((m) => ({
          id: m.id,
          name: m.name || m.id,
          capabilities: {
            ...inferModelCapabilities(m.id, m.name),
            contextWindow: m.context_length ? `${Math.round(m.context_length / 1000)}k tokens` : '128k tokens',
          },
          description: m.description,
        }));

        return NextResponse.json({
          success: true,
          source: 'live',
          models: discovered.length > 0 ? discovered : fallbackModels,
        });
      }
    }

    // ----------------------------------------------------
    // 5. CLOUDFLARE WORKERS AI
    // ----------------------------------------------------
    if (providerId === 'cloudflare') {
      const cleanAccountId = normalizeCloudflareAccountId(accountId);
      const cleanApiToken = apiKey.trim();

      if (cleanAccountId && cleanApiToken) {
        try {
          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${cleanAccountId}/ai/models/search?per_page=50`,
            {
              headers: { Authorization: `Bearer ${cleanApiToken}` },
              signal: AbortSignal.timeout(5000),
            }
          );

          if (res.ok) {
            const data = (await res.json()) as {
              result?: Array<{ name: string; description?: string; task?: { name?: string } }>;
            };

            const discovered: ModelOption[] = (data.result || []).map((m) => ({
              id: m.name,
              name: m.name.replace(/^@cf\//, ''),
              capabilities: inferModelCapabilities(m.name, m.name),
              description: m.description || m.task?.name,
            }));

            if (discovered.length > 0) {
              return NextResponse.json({
                success: true,
                source: 'live',
                models: discovered,
              });
            }
          }
        } catch {
          // Fall through to catalog
        }
      }
    }

    // ----------------------------------------------------
    // 6. CUSTOM OPENAI-COMPATIBLE ENDPOINT
    // ----------------------------------------------------
    if (providerId === 'custom') {
      const endpoint = (baseUrl.trim() || 'http://localhost:8000/v1').replace(/\/+$/, '');
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      try {
        const res = await fetch(`${endpoint}/models`, {
          headers,
          signal: AbortSignal.timeout(4500),
        });

        if (res.ok) {
          const data = (await res.json()) as { data?: Array<{ id: string }> };
          const discovered: ModelOption[] = (data.data || []).map((m) => ({
            id: m.id,
            name: m.id,
            capabilities: inferModelCapabilities(m.id),
          }));

          if (discovered.length > 0) {
            return NextResponse.json({
              success: true,
              source: 'live',
              models: discovered,
            });
          }
        }
      } catch {
        // Fall through to catalog
      }
    }

    // Default: return static catalog models
    return NextResponse.json({
      success: true,
      source: 'catalog',
      models: fallbackModels,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Model discovery failed';
    return NextResponse.json({
      success: false,
      error: message,
      models: fallbackModels,
    });
  }
}

