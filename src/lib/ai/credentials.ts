/**
 * Provider Credential Management, Encryption, and Automatic Key Rotation
 * Supports multiple comma-separated API keys, position-paired Cloudflare accounts,
 * intelligent rate-limit cooldown tracking, and zero secret leakage.
 */

import crypto from 'node:crypto';
import { ProviderId } from '@/lib/types';
import { normalizeCloudflareAccountId } from './adapters/cloudflare';

// In-memory key cooldown tracker (persists across requests within the process)
// Key: `${providerId}:${hash}` -> timestamp in ms when cooldown expires
const keyCooldownMap = new Map<string, number>();

/**
 * Mask secrets for safe diagnostics and logging.
 * Never outputs more than first 3 and last 3 characters.
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
}

/**
 * Hash a secret for secure cooldown tracking without storing raw keys in memory.
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

/**
 * Secure AES-256-GCM encryption for stored credentials.
 */
const ENCRYPTION_SECRET = process.env.CREDENTIAL_ENCRYPTION_KEY || 'docium-aes-256-gcm-master-salt-key-2026';
const KEY_BUFFER = crypto.scryptSync(ENCRYPTION_SECRET, 'docium-salt', 32);

export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptCredential(encryptedData: string): string {
  if (!encryptedData) return '';
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData; // Not encrypted, return as-is
    const [ivHex, tagHex, contentHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUFFER, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(contentHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If decryption fails, return original string (e.g. plain text key)
    return encryptedData;
  }
}

/**
 * Parses comma-separated API keys, trims whitespace, removes empty entries, and deduplicates.
 */
export function parseCommaSeparatedKeys(raw?: string): string[] {
  if (!raw) return [];
  // Also handle decrypted content if encrypted
  const decrypted = decryptCredential(raw);
  const keys = decrypted
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  return Array.from(new Set(keys));
}

export interface CloudflarePair {
  accountId: string;
  apiToken: string;
}

/**
 * Parses and pairs Cloudflare Account IDs and API Tokens by their position.
 * Validates that both lists contain the identical count of entries.
 */
export function parseCloudflarePairs(
  rawAccountIds?: string,
  rawApiTokens?: string
): {
  valid: boolean;
  pairs: CloudflarePair[];
  error?: string;
} {
  const decryptedAccounts = decryptCredential(rawAccountIds || '');
  const decryptedTokens = decryptCredential(rawApiTokens || '');

  const accountIds = decryptedAccounts
    .split(',')
    .map((a) => normalizeCloudflareAccountId(a))
    .filter((a) => a.length > 0);

  const apiTokens = decryptedTokens
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (accountIds.length === 0 && apiTokens.length === 0) {
    return { valid: true, pairs: [] };
  }

  if (accountIds.length !== apiTokens.length) {
    return {
      valid: false,
      pairs: [],
      error: `Cloudflare Account ID count (${accountIds.length}) does not match API Token count (${apiTokens.length}). Every Account ID must be paired with its corresponding API token.`,
    };
  }

  const pairs: CloudflarePair[] = accountIds.map((accId, i) => ({
    accountId: accId,
    apiToken: apiTokens[i],
  }));

  return { valid: true, pairs };
}

/**
 * Checks if an error is specific to credentials or rate-limits (should trigger rotation).
 * Non-credential errors (e.g. invalid model ID, malformed payload, 400 Bad Request, network errors) must NOT rotate.
 */
export function isCredentialError(statusOrError?: number | unknown, errorMessage?: string): boolean {
  let status: number | undefined;
  let text = errorMessage || '';

  if (typeof statusOrError === 'number') {
    status = statusOrError;
  } else if (statusOrError && typeof statusOrError === 'object') {
    if ('status' in statusOrError && typeof (statusOrError as { status?: unknown }).status === 'number') {
      status = (statusOrError as { status: number }).status;
    }
    if ('message' in statusOrError && typeof (statusOrError as { message?: unknown }).message === 'string') {
      text = `${text} ${(statusOrError as { message: string }).message}`;
    }
  } else if (typeof statusOrError === 'string') {
    text = `${text} ${statusOrError}`;
  }

  const lower = text.toLowerCase();

  // 1. Explicit non-credential errors that MUST NEVER trigger rotation:
  // Network connection failures & timeouts
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('network error') ||
    lower.includes('networkerror') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('aborterror') ||
    lower.includes('abort') ||
    lower.includes('no response body') ||
    lower.includes('readablestream') ||
    lower.includes('released and cannot be used') ||
    lower.includes('cannot release a lock') ||
    lower.includes('stream is already locked') ||
    lower.includes('reader has been released')
  ) {
    return false;
  }

  // Model ID & capability errors (invalid model, model does not exist)
  if (
    lower.includes('model not found') ||
    lower.includes('invalid model') ||
    lower.includes('model does not exist') ||
    lower.includes('does not exist') ||
    lower.includes('is not supported') ||
    lower.includes('not supported for this model') ||
    lower.includes('context_length_exceeded') ||
    lower.includes('maximum context length') ||
    lower.includes('unsupported parameter')
  ) {
    return false;
  }

  // Server-side provider 5xx outages
  if (
    (status !== undefined && status >= 500 && status < 600) ||
    lower.includes('500 internal server') ||
    lower.includes('502 bad gateway') ||
    lower.includes('503 service unavailable') ||
    lower.includes('504 gateway timeout')
  ) {
    return false;
  }

  // Malformed response / empty response / JSON parse errors
  if (
    lower.includes('empty response') ||
    lower.includes('unexpected token') ||
    lower.includes('syntaxerror') ||
    lower.includes('json parse') ||
    lower.includes('malformed')
  ) {
    return false;
  }

  // 2. HTTP Status Code Checks
  if (status === 401) return true; // 401 Unauthorized is always credential failure

  // 403 Forbidden: check if it's invalid key / permission / billing
  if (status === 403) {
    // If it's a generic WAF/Cloudflare security challenge without token issues, don't rotate
    if (lower.includes('cloudflare') && lower.includes('security') && !lower.includes('token') && !lower.includes('account')) {
      return false;
    }
    return true;
  }

  // 429 Too Many Requests:
  if (status === 429) {
    // Key/Account specific quota exhaustion or rate limits:
    if (
      lower.includes('quota') ||
      lower.includes('insufficient_quota') ||
      lower.includes('exceeded your current quota') ||
      lower.includes('billing') ||
      lower.includes('credit') ||
      lower.includes('rate limit') ||
      lower.includes('rate_limit') ||
      lower.includes('tpm') ||
      lower.includes('rpm') ||
      lower.includes('tokens per') ||
      lower.includes('requests per') ||
      lower.includes('resource_exhausted') ||
      !lower.includes('server')
    ) {
      return true;
    }
  }

  // 3. String content checks if status was not explicit
  if (
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid_api_key') ||
    lower.includes('incorrect api key') ||
    (lower.includes('key') && (lower.includes('invalid') || lower.includes('expired'))) ||
    lower.includes('authentication error') ||
    lower.includes('authentication_error') ||
    lower.includes('bad credentials') ||
    lower.includes('invalid auth') ||
    lower.includes('invalid token') ||
    lower.includes('revoked') ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('quota exceeded') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('resource has been exhausted') ||
    lower.includes('credit balance') ||
    lower.includes('billing') ||
    lower.includes('code 10000') || // Cloudflare auth error
    lower.includes('code 10001') || // Cloudflare permission error
    lower.includes('code 7003') || // Cloudflare account route error
    lower.includes('could not route to')
  ) {
    return true;
  }

  return false;
}

export const isCredentialOrQuotaError = isCredentialError;

/**
 * Cooldown management for rate-limited keys
 */
export function setKeyCooldown(providerId: string, secret: string, durationSeconds = 60): void {
  const keyHash = `${providerId}:${hashSecret(secret)}`;
  const expiresAt = Date.now() + Math.max(5, durationSeconds) * 1000;
  keyCooldownMap.set(keyHash, expiresAt);
}

export function isKeyInCooldown(providerId: string, secret: string): boolean {
  const keyHash = `${providerId}:${hashSecret(secret)}`;
  const expiresAt = keyCooldownMap.get(keyHash);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    keyCooldownMap.delete(keyHash);
    return false;
  }
  return true;
}

export function parseRetryAfterSeconds(headerValue?: string | null): number {
  if (!headerValue) return 60;
  const num = parseInt(headerValue, 10);
  if (!isNaN(num) && num > 0) return num;
  const dateMs = Date.parse(headerValue);
  if (!isNaN(dateMs)) {
    const diff = Math.ceil((dateMs - Date.now()) / 1000);
    return diff > 0 ? diff : 60;
  }
  return 60;
}

/**
 * Sorts and filters keys to prioritize keys that are NOT currently in cooldown.
 */
export function orderKeysByAvailability(providerId: string, keys: string[]): string[] {
  const active: string[] = [];
  const inCooldown: string[] = [];

  for (const k of keys) {
    if (isKeyInCooldown(providerId, k)) {
      inCooldown.push(k);
    } else {
      active.push(k);
    }
  }

  return [...active, ...inCooldown];
}

/**
 * Generic rotating executor for single-key providers (OpenAI, Anthropic, Gemini, Groq, OpenRouter, HuggingFace).
 */
export async function executeWithKeyRotation<T>(params: {
  providerId: ProviderId;
  rawKeys: string;
  runner: (key: string, index: number) => Promise<T>;
  onRotate?: (failedIndex: number, nextIndex: number, reason: string) => void;
}): Promise<{ result?: T; error?: string }> {
  const keys = parseCommaSeparatedKeys(params.rawKeys);
  if (keys.length === 0) {
    return { error: `No API key configured for ${params.providerId}.` };
  }

  const orderedKeys = orderKeysByAvailability(params.providerId, keys);
  let lastError = '';

  for (let i = 0; i < orderedKeys.length; i++) {
    const key = orderedKeys[i];
    try {
      const res = await params.runner(key, i);
      return { result: res };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastError = errMsg;

      if (isCredentialError(undefined, errMsg)) {
        // Track rate limit cooldown
        if (errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota')) {
          setKeyCooldown(params.providerId, key, 60);
        }

        if (i < orderedKeys.length - 1) {
          if (params.onRotate) {
            params.onRotate(i, i + 1, errMsg);
          }
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[${params.providerId}] Key ${i + 1}/${orderedKeys.length} (${maskSecret(key)}) failed with credential error. Rotating to key ${i + 2}...`
            );
          }
          continue; // Try next key
        }
      } else {
        // Non-credential error (e.g. invalid model, bad parameter): do NOT rotate
        return { error: errMsg };
      }
    }
  }

  return {
    error: `All ${orderedKeys.length} configured API keys for ${params.providerId} failed. Most recent error: ${lastError}`,
  };
}

/**
 * Generic rotating executor for Cloudflare Account ID + API Token pairs.
 */
export async function executeWithCloudflarePairRotation<T>(params: {
  rawAccountIds: string;
  rawApiTokens: string;
  runner: (pair: CloudflarePair, index: number) => Promise<T>;
  onRotate?: (failedIndex: number, nextIndex: number, reason: string) => void;
}): Promise<{ result?: T; error?: string }> {
  const { pairs, error: parseError } = parseCloudflarePairs(params.rawAccountIds, params.rawApiTokens);
  if (parseError) {
    return { error: parseError };
  }
  if (pairs.length === 0) {
    return { error: 'Cloudflare Account ID and API Token are required.' };
  }

  let lastError = '';

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    try {
      const res = await params.runner(pair, i);
      return { result: res };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastError = errMsg;

      if (isCredentialError(undefined, errMsg)) {
        setKeyCooldown('cloudflare', `${pair.accountId}:${pair.apiToken}`, 60);

        if (i < pairs.length - 1) {
          if (params.onRotate) {
            params.onRotate(i, i + 1, errMsg);
          }
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[Cloudflare] Pair ${i + 1}/${pairs.length} (Account: ${maskSecret(pair.accountId)}, Token: ${maskSecret(pair.apiToken)}) failed. Rotating to pair ${i + 2}...`
            );
          }
          continue;
        }
      } else {
        // Non-credential error: do NOT rotate
        return { error: errMsg };
      }
    }
  }

  return {
    error: `All ${pairs.length} configured Cloudflare Account ID / API Token pairs failed. Most recent error: ${lastError}`,
  };
}
