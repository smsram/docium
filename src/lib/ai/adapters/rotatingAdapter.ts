/**
 * DOCIUM Rotating Provider Adapter
 * Wraps base provider adapters with request-local, silent API key rotation.
 * 
 * Rules:
 * 1. Standard providers: parse comma-separated keys, trim whitespace, ignore empty.
 * 2. Cloudflare: 1:1 positional pairing between Account IDs and API Keys.
 * 3. Silent rotation on qualifying errors (401, 403 invalid key, 429 quota exhaustion).
 * 4. Never rotate for non-credential errors (invalid model ID, invalid payload, network failure, 5xx).
 * 5. If partial content has already reached the user, do not restart to prevent duplicate output.
 * 6. Zero secret leakage in errors or logs.
 * 7. Request-local rotation state to avoid credential cross-talk in concurrent requests.
 */

import {
  BaseProviderAdapter,
  NormalizedMessage,
  NormalizedToolDefinition,
  AdapterOptions,
  NormalizedStreamChunk,
} from './base';
import { ProviderId } from '@/lib/types';
import {
  parseCommaSeparatedKeys,
  parseCloudflarePairs,
  orderKeysByAvailability,
  orderCloudflarePairsByAvailability,
  isCredentialError,
  setKeyCooldown,
  setCloudflarePairCooldown,
  maskSecret,
} from '../credentials';

export class RotatingProviderAdapter implements BaseProviderAdapter {
  constructor(public readonly innerAdapter: BaseProviderAdapter) {}

  get providerId(): ProviderId {
    return this.innerAdapter.providerId;
  }

  supportsNativeTools(): boolean {
    return this.innerAdapter.supportsNativeTools();
  }

  supportsVision(): boolean {
    return this.innerAdapter.supportsVision();
  }

  async *generateStream(
    messages: NormalizedMessage[],
    tools: NormalizedToolDefinition[],
    options: AdapterOptions
  ): AsyncIterable<NormalizedStreamChunk> {
    const providerId = this.innerAdapter.providerId;

    // 1. Cloudflare 1:1 Account ID + API Key positional pairing
    if (providerId === 'cloudflare') {
      const { pairs, error: pairError } = parseCloudflarePairs(options.accountId, options.apiKey);
      if (pairError) {
        yield { type: 'error', error: pairError };
        return;
      }
      if (pairs.length === 0) {
        yield {
          type: 'error',
          error: 'Cloudflare Account ID and API Token are required.',
        };
        return;
      }

      const orderedPairs = orderCloudflarePairsByAvailability(pairs, options.preferredPairIndex);

      let lastError = '';
      let hasYieldedVisibleContent = false;

      for (let i = 0; i < orderedPairs.length; i++) {
        const pair = orderedPairs[i];
        let streamError: string | null = null;
        let yieldedInThisAttempt = false;

        try {
          const stream = this.innerAdapter.generateStream(messages, tools, {
            ...options,
            accountId: pair.accountId,
            apiKey: pair.apiToken,
          });

          for await (const chunk of stream) {
            if (options.signal?.aborted) {
              return;
            }

            if (chunk.type === 'delta' || chunk.type === 'tool_call') {
              hasYieldedVisibleContent = true;
              yieldedInThisAttempt = true;
              options.onCredentialActive?.({
                providerId: 'cloudflare',
                index: pairs.findIndex((p) => p.accountId === pair.accountId && p.apiToken === pair.apiToken),
                accountId: pair.accountId,
              });
              yield chunk;
            } else if (chunk.type === 'error' && chunk.error) {
              streamError = chunk.error;
              break;
            } else {
              yield chunk;
            }
          }
        } catch (err: unknown) {
          streamError = err instanceof Error ? err.message : String(err);
        }

        if (!streamError) {
          // Stream completed successfully with this credential
          options.onCredentialActive?.({
            providerId: 'cloudflare',
            index: pairs.findIndex((p) => p.accountId === pair.accountId && p.apiToken === pair.apiToken),
            accountId: pair.accountId,
          });
          return;
        }

        lastError = streamError;

        // If visible content was already streamed to the user, do not restart
        if (hasYieldedVisibleContent || yieldedInThisAttempt) {
          yield { type: 'error', error: streamError };
          return;
        }

        // Check if qualifying credential error that allows rotation
        const isCred = isCredentialError(undefined, streamError);
        if (isCred && i < orderedPairs.length - 1) {
          const isAccountQuota = streamError.toLowerCase().includes('quota') || streamError.toLowerCase().includes('limit');
          setCloudflarePairCooldown(pair, 60, isAccountQuota);

          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[Cloudflare] Pair ${i + 1}/${orderedPairs.length} (Account: ${maskSecret(pair.accountId)}, Token: ${maskSecret(pair.apiToken)}) failed with credential/quota error. Rotating silently to pair ${i + 2}...`
            );
          }
          continue; // Rotate to next pair
        }

        // Non-credential error (e.g. 400 Bad Request, payload/image error, invalid model, network failure)
        // Immediately halt without credential rotation and without misleading "All credentials failed" message
        if (!isCred) {
          yield { type: 'error', error: streamError };
          return;
        }

        // Last credential reached and all attempts were genuine credential failures
        const finalMsg = orderedPairs.length > 1
          ? `All ${orderedPairs.length} configured Cloudflare credentials failed authentication/quota checks. ${streamError}`
          : streamError;
        yield { type: 'error', error: finalMsg };
        return;
      }

      yield {
        type: 'error',
        error: `All ${orderedPairs.length} configured Cloudflare credentials failed. Most recent error: ${lastError}`,
      };
      return;
    }

    // 2. Standard Providers (OpenAI, Anthropic, Gemini, Groq, OpenRouter, HuggingFace, etc.)
    const rawKeys = parseCommaSeparatedKeys(options.apiKey);
    if (rawKeys.length === 0) {
      // Fallback for providers that may not require a key (e.g. local Ollama)
      yield* this.innerAdapter.generateStream(messages, tools, options);
      return;
    }

    const orderedKeys = orderKeysByAvailability(providerId, rawKeys);
    let lastError = '';
    let hasYieldedVisibleContent = false;

    for (let i = 0; i < orderedKeys.length; i++) {
      const activeKey = orderedKeys[i];
      let streamError: string | null = null;
      let yieldedInThisAttempt = false;

      try {
        const stream = this.innerAdapter.generateStream(messages, tools, {
          ...options,
          apiKey: activeKey,
        });

        for await (const chunk of stream) {
          if (options.signal?.aborted) {
            return;
          }

          if (chunk.type === 'delta' || chunk.type === 'tool_call') {
            hasYieldedVisibleContent = true;
            yieldedInThisAttempt = true;
            yield chunk;
          } else if (chunk.type === 'error' && chunk.error) {
            streamError = chunk.error;
            break;
          } else {
            yield chunk;
          }
        }
      } catch (err: unknown) {
        streamError = err instanceof Error ? err.message : String(err);
      }

      if (!streamError) {
        // Stream completed successfully with this key
        options.onCredentialActive?.({
          providerId,
          index: rawKeys.indexOf(activeKey),
        });
        return;
      }

      lastError = streamError;

      // If visible content was already streamed to the user, do not restart
      if (hasYieldedVisibleContent || yieldedInThisAttempt) {
        yield { type: 'error', error: streamError };
        return;
      }

      // Check if qualifying credential error that allows rotation
      const isCred = isCredentialError(undefined, streamError);
      if (isCred && i < orderedKeys.length - 1) {
        setKeyCooldown(providerId, activeKey, 60);
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[${providerId}] Key ${i + 1}/${orderedKeys.length} (${maskSecret(activeKey)}) failed with auth/quota error. Rotating silently to key ${i + 2}...`
          );
        }
        continue; // Rotate to next key
      }

      // Non-credential error: halt immediately without misleading "All keys failed" message
      if (!isCred) {
        yield { type: 'error', error: streamError };
        return;
      }

      const finalMsg = orderedKeys.length > 1
        ? `All ${orderedKeys.length} configured API keys for ${providerId} failed authentication/quota checks. ${streamError}`
        : streamError;
      yield { type: 'error', error: finalMsg };
      return;
    }

    yield {
      type: 'error',
      error: `All ${orderedKeys.length} configured API keys for ${providerId} failed. Most recent error: ${lastError}`,
    };
  }
}

