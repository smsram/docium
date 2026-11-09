/**
 * Provider Adapter Registry
 * Maps provider IDs to normalized provider adapters.
 */

import { ProviderId } from '@/lib/types';
import { BaseProviderAdapter } from './base';
import { RotatingProviderAdapter } from './rotatingAdapter';
import { OpenAICompatibleAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { CloudflareAdapter } from './cloudflare';
import { HuggingFaceAdapter } from './huggingface';

const adapters: Partial<Record<ProviderId, BaseProviderAdapter>> = {
  openai: new OpenAICompatibleAdapter('openai', 'https://api.openai.com/v1'),
  groq: new OpenAICompatibleAdapter('groq', 'https://api.groq.com/openai/v1'),
  openrouter: new OpenAICompatibleAdapter('openrouter', 'https://openrouter.ai/api/v1'),
  ollama: new OpenAICompatibleAdapter('ollama', 'http://localhost:11434/v1'),
  custom: new OpenAICompatibleAdapter('custom', 'http://localhost:8000/v1'),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
  cloudflare: new CloudflareAdapter(),
  huggingface: new HuggingFaceAdapter(),
};

export function registerProviderAdapter(providerId: string, adapter: BaseProviderAdapter): void {
  adapters[providerId as ProviderId] = adapter;
}

/**
 * Returns the configured provider adapter for the requested provider ID.
 */
export function resolveProviderAdapter(providerId: ProviderId): BaseProviderAdapter {
  const adapter = adapters[providerId];
  if (!adapter) {
    // Fall back to OpenAI-compatible interface for custom / compatible endpoints
    return new RotatingProviderAdapter(new OpenAICompatibleAdapter(providerId, 'https://api.openai.com/v1'));
  }
  return new RotatingProviderAdapter(adapter);
}

