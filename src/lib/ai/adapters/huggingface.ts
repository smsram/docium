/**
 * Hugging Face Inference Adapter
 * Supports Hugging Face Serverless Router (OpenAI-compatible) and dedicated endpoints.
 */

import {
  BaseProviderAdapter,
  NormalizedMessage,
  NormalizedToolDefinition,
  AdapterOptions,
  NormalizedStreamChunk,
} from './base';
import { OpenAICompatibleAdapter } from './openai';

export class HuggingFaceAdapter implements BaseProviderAdapter {
  readonly providerId = 'huggingface' as const;
  private readonly defaultRouterUrl = 'https://router.huggingface.co/hf-inference/v1';

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
    // Resolve endpoint: Hugging Face has an OpenAI-compatible router at router.huggingface.co/hf-inference/v1
    let resolvedBaseUrl = options.baseUrl?.trim() || this.defaultRouterUrl;

    // Normalize legacy api-inference endpoints to the v1 standard endpoint
    if (resolvedBaseUrl.includes('api-inference.huggingface.co/models')) {
      resolvedBaseUrl = 'https://router.huggingface.co/hf-inference/v1';
    } else if (resolvedBaseUrl.endsWith('/')) {
      resolvedBaseUrl = resolvedBaseUrl.slice(0, -1);
    }

    const openAiAdapter = new OpenAICompatibleAdapter('huggingface', resolvedBaseUrl);

    yield* openAiAdapter.generateStream(messages, tools, {
      ...options,
      baseUrl: resolvedBaseUrl,
    });
  }
}

