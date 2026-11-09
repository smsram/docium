/**
 * Web Research Tools
 * Searches the web, opens URLs with SSRF validation, extracts text, and generates citations.
 */

import { ToolDefinition } from './types';
import { safeFetch } from '../security/ssrfGuard';
import { parseCommaSeparatedKeys } from '../credentials';

export interface NormalizedSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  score?: number;
}

function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  label: 'Web Search',
  description: 'Search the live web for recent information, technical documentation, citations, or data.',
  activityLabel: 'Searching the web',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Web search query.',
      },
      numResults: {
        type: 'number',
        description: 'Number of search results to return (defaults to 5, max 8).',
      },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'Query is required' };

    const limit = typeof args.numResults === 'number' ? Math.min(args.numResults, 8) : 5;

    // Check configured search provider and keys
    const searchProvider = context.searchProvider;
    const tavilyKey = context.apiKeys?.['tavily'];
    const braveKey = context.apiKeys?.['brave'];
    const serperKey = context.apiKeys?.['serper'];

    const activeProvider =
      searchProvider ||
      (braveKey ? 'brave' : tavilyKey ? 'tavily' : serperKey ? 'serper' : undefined);

    const activeKey =
      (activeProvider ? context.apiKeys?.[activeProvider] : undefined) ||
      braveKey ||
      tavilyKey ||
      serperKey;

    // If web search is not configured, do NOT fabricate results or search unauthenticated
    if (!activeKey && activeProvider !== 'searxng') {
      return {
        success: false,
        error:
          'Web search is not configured. Please add an API key for Brave Search, Tavily, or Serper in Settings > AI Providers to enable live web research.',
        activitySummary: 'Web search is unconfigured',
      };
    }

    try {
      // 1. Brave Search API
      const braveKeys = parseCommaSeparatedKeys(braveKey || (activeProvider === 'brave' ? activeKey : ''));
      if ((activeProvider === 'brave' || !activeProvider) && braveKeys.length > 0) {
        for (let i = 0; i < braveKeys.length; i++) {
          const key = braveKeys[i];
          const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
            headers: { 'X-Subscription-Token': key },
            signal: AbortSignal.timeout(9000),
          });

          if (res.status === 401 || res.status === 403) {
            if (i < braveKeys.length - 1) continue; // Try next key
            return {
              success: false,
              error: `Brave Search API credentials are invalid (HTTP ${res.status}). Please check your API key in Settings > AI Providers.`,
              activitySummary: 'Invalid search credentials',
            };
          }

          if (res.status === 429) {
            if (i < braveKeys.length - 1) continue;
            return {
              success: false,
              error: 'Brave Search rate limit or quota exceeded (HTTP 429). Please try again shortly or check your quota.',
              activitySummary: 'Search rate limit exceeded',
            };
          }

          if (res.ok) {
            const json = await res.json();
            const raw = json.web?.results || [];
            const results: NormalizedSearchResultItem[] = raw.map((r: { title?: string; url: string; description?: string; page_age?: string; age?: string }) => ({
              title: r.title || extractDomain(r.url),
              url: r.url,
              snippet: r.description || '',
              domain: extractDomain(r.url),
              publishedDate: r.page_age || r.age || undefined,
            }));

            return {
              success: true,
              data: { query, results, count: results.length, provider: 'brave' },
              activitySummary: results.length > 0
                ? `Searched web for "${query}" via Brave Search (${results.length} results)`
                : `No results found for "${query}" on Brave Search`,
            };
          }
        }
      }

      // 2. Tavily Search API
      const tavilyKeys = parseCommaSeparatedKeys(tavilyKey || (activeProvider === 'tavily' ? activeKey : ''));
      if ((activeProvider === 'tavily' || !activeProvider) && tavilyKeys.length > 0) {
        for (let i = 0; i < tavilyKeys.length; i++) {
          const key = tavilyKeys[i];
          const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: key,
              query,
              max_results: limit,
              include_snippets: true,
            }),
            signal: AbortSignal.timeout(9000),
          });

          if (res.status === 401 || res.status === 403) {
            if (i < tavilyKeys.length - 1) continue;
            return {
              success: false,
              error: `Tavily Search API key is invalid (HTTP ${res.status}). Please check your API key in Settings > AI Providers.`,
              activitySummary: 'Invalid search credentials',
            };
          }

          if (res.status === 429) {
            if (i < tavilyKeys.length - 1) continue;
            return {
              success: false,
              error: 'Tavily Search rate limit or quota exceeded (HTTP 429). Please try again shortly.',
              activitySummary: 'Search rate limit exceeded',
            };
          }

          if (res.ok) {
            const json = await res.json();
            const raw = json.results || [];
            const results: NormalizedSearchResultItem[] = raw.map((r: { title?: string; url: string; content?: string; published_date?: string; score?: number }) => ({
              title: r.title || extractDomain(r.url),
              url: r.url,
              snippet: r.content || '',
              domain: extractDomain(r.url),
              publishedDate: r.published_date || undefined,
              score: r.score,
            }));

            return {
              success: true,
              data: { query, results, count: results.length, provider: 'tavily' },
              activitySummary: results.length > 0
                ? `Searched web for "${query}" via Tavily (${results.length} results)`
                : `No results found for "${query}" on Tavily`,
            };
          }
        }
      }

      // 3. Serper (Google Search) API
      const serperKeys = parseCommaSeparatedKeys(serperKey || (activeProvider === 'serper' ? activeKey : ''));
      if ((activeProvider === 'serper' || !activeProvider) && serperKeys.length > 0) {
        for (let i = 0; i < serperKeys.length; i++) {
          const key = serperKeys[i];
          const res = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
              'X-API-KEY': key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: query, num: limit }),
            signal: AbortSignal.timeout(9000),
          });

          if (res.status === 401 || res.status === 403) {
            if (i < serperKeys.length - 1) continue;
            return {
              success: false,
              error: `Serper API key is invalid (HTTP ${res.status}). Please check your key in Settings > AI Providers.`,
              activitySummary: 'Invalid search credentials',
            };
          }

          if (res.status === 429) {
            if (i < serperKeys.length - 1) continue;
            return {
              success: false,
              error: 'Serper rate limit or credit quota exceeded (HTTP 429). Please try again shortly.',
              activitySummary: 'Search rate limit exceeded',
            };
          }

          if (res.ok) {
            const json = await res.json();
            const raw = json.organic || [];
            const results: NormalizedSearchResultItem[] = raw.map((r: { title?: string; link: string; snippet?: string; date?: string }) => ({
              title: r.title || extractDomain(r.link),
              url: r.link,
              snippet: r.snippet || '',
              domain: extractDomain(r.link),
              publishedDate: r.date || undefined,
            }));

            return {
              success: true,
              data: { query, results, count: results.length, provider: 'serper' },
              activitySummary: results.length > 0
                ? `Searched web for "${query}" via Serper (${results.length} results)`
                : `No results found for "${query}" on Serper`,
            };
          }
        }
      }

      // 4. SearXNG Local Metasearch
      if (activeProvider === 'searxng') {
        const url = (context.apiKeys?.['searxngBaseUrl'] || 'http://localhost:8080').replace(/\/+$/, '');
        try {
          const res = await fetch(`${url}/search?q=${encodeURIComponent(query)}&format=json`, {
            signal: AbortSignal.timeout(9000),
          });
          if (res.ok) {
            const json = await res.json();
            const raw = (json.results || []).slice(0, limit);
            const results: NormalizedSearchResultItem[] = raw.map((r: { title?: string; url: string; content?: string; publishedDate?: string }) => ({
              title: r.title || extractDomain(r.url),
              url: r.url,
              snippet: r.content || '',
              domain: extractDomain(r.url),
              publishedDate: r.publishedDate || undefined,
            }));

            return {
              success: true,
              data: { query, results, count: results.length, provider: 'searxng' },
              activitySummary: `Searched web for "${query}" via SearXNG (${results.length} results)`,
            };
          }
        } catch {
          return {
            success: false,
            error: `Could not connect to SearXNG at ${url}. Check your instance settings.`,
            activitySummary: 'SearXNG connection failed',
          };
        }
      }

      return {
        success: false,
        error: `Live search for "${query}" returned no results. Verify your search provider API key in Settings > AI Providers.`,
        activitySummary: `No search results for "${query}"`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search error';
      return {
        success: false,
        error: `Search failed: ${msg}. Normal AI reasoning will continue without live web data.`,
        activitySummary: `Search failed for "${query}"`,
      };
    }
  },
};

export const openWebPageTool: ToolDefinition = {
  name: 'open_web_page',
  label: 'Open Web Page',
  description: 'Securely open a web page URL, validate it against SSRF vulnerabilities, and extract readable text content.',
  activityLabel: 'Opening a web page',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The HTTP or HTTPS URL to fetch and read.',
      },
      maxCharacters: {
        type: 'number',
        description: 'Maximum characters of text to return (defaults to 3500).',
      },
    },
    required: ['url'],
  },
  execute: async (args) => {
    const rawUrl = String(args.url || '').trim();
    if (!rawUrl) return { success: false, error: 'URL is required' };

    const maxChars = typeof args.maxCharacters === 'number' ? Math.min(args.maxCharacters, 6000) : 3500;

    try {
      const fetchResult = await safeFetch(rawUrl, { maxSizeBytes: 1024 * 1024, timeoutMs: 7000 });
      if (!fetchResult.ok) {
        return {
          success: false,
          error: `Failed to fetch page. HTTP status: ${fetchResult.status}`,
        };
      }

      let cleanText = fetchResult.text;
      // Strip script, style, and svg tags
      cleanText = cleanText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
      cleanText = cleanText.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
      cleanText = cleanText.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
      // Strip all HTML tags
      cleanText = cleanText.replace(/<[^>]+>/g, ' ');
      // Condense whitespace
      cleanText = cleanText.replace(/\s+/g, ' ').trim();

      const truncated = cleanText.slice(0, maxChars);

      return {
        success: true,
        data: {
          url: rawUrl,
          title: rawUrl.split('/').pop() || rawUrl,
          content: truncated,
          length: cleanText.length,
        },
        activitySummary: `Read content from ${rawUrl.slice(0, 40)}...`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch page';
      return { success: false, error: msg };
    }
  },
};

export const webTools = [webSearchTool, openWebPageTool];

