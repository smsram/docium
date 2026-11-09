/**
 * Normalized AI Provider Adapter Interfaces
 * Provides a unified model calling, streaming, and tool execution protocol across all providers.
 */

import { ProviderId } from '@/lib/types';

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface NormalizedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
  name?: string;
}

export interface NormalizedToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type StreamChunkType = 'delta' | 'tool_call' | 'done' | 'error';

export interface NormalizedStreamChunk {
  type: StreamChunkType;
  delta?: string;
  toolCall?: ToolCallRequest;
  finishReason?: string;
  error?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AdapterOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  accountId?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface BaseProviderAdapter {
  readonly providerId: ProviderId;
  supportsNativeTools(): boolean;
  supportsVision(): boolean;
  generateStream(
    messages: NormalizedMessage[],
    tools: NormalizedToolDefinition[],
    options: AdapterOptions
  ): AsyncIterable<NormalizedStreamChunk>;
}

