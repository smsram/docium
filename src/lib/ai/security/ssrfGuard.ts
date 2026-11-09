/**
 * SSRF Protection Utility for Docium
 * Validates URLs and prevents requests to private networks, loopback, and cloud metadata services.
 */

import { URL } from 'url';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'instance-data',
]);

const BLOCKED_IP_PREFIXES = [
  '127.',        // Loopback
  '10.',         // Private RFC1918 Class A
  '172.16.',     // Private RFC1918 Class B
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',    // Private RFC1918 Class C
  '169.254.',    // Link-local / Cloud Metadata
  'fc00:',       // IPv6 ULA
  'fe80:',       // IPv6 Link-local
  '::ffff:127.', // IPv4 mapped loopback
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  sanitizedUrl?: string;
}

/**
 * Validates whether a URL is safe to fetch from the server.
 */
export function validateUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, reason: 'URL cannot be empty' };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}. Only http and https are allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { valid: false, reason: 'Access to internal or loopback hostnames is prohibited' };
  }

  // Check blocked IP prefixes
  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      return { valid: false, reason: 'Access to private or local network IP addresses is prohibited' };
    }
  }

  // Check port if specified
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    // Allow standard web ports only
    if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443) {
      return { valid: false, reason: `Non-standard port ${port} is blocked for security.` };
    }
  }

  return { valid: true, sanitizedUrl: parsed.toString() };
}

/**
 * Performs a safe fetch enforcing timeouts, size limits, and SSRF validation.
 */
export async function safeFetch(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxSizeBytes?: number;
    headers?: Record<string, string>;
  } = {}
): Promise<{ ok: boolean; status: number; text: string; contentType: string }> {
  const validation = validateUrl(rawUrl);
  if (!validation.valid || !validation.sanitizedUrl) {
    throw new Error(validation.reason || 'Invalid URL');
  }

  const timeoutMs = options.timeoutMs || 8000;
  const maxSizeBytes = options.maxSizeBytes || 2 * 1024 * 1024; // 2MB limit

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(validation.sanitizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Docium-AI-Research/1.0 (+https://github.com/docium)',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        ...options.headers,
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timer);

    // Validate final redirected URL as well
    const redirectedValidation = validateUrl(res.url);
    if (!redirectedValidation.valid) {
      throw new Error(`Redirect destination blocked: ${redirectedValidation.reason}`);
    }

    const contentType = res.headers.get('content-type') || 'text/html';

    // Read with size limit
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { ok: res.ok, status: res.status, text: text.slice(0, maxSizeBytes), contentType };
    }

    let receivedBytes = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        if (receivedBytes > maxSizeBytes) {
          chunks.push(value.slice(0, maxSizeBytes - (receivedBytes - value.length)));
          break;
        }
        chunks.push(value);
      }
    }

    const totalBuffer = new Uint8Array(Math.min(receivedBytes, maxSizeBytes));
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(totalBuffer);

    return {
      ok: res.ok,
      status: res.status,
      text,
      contentType,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : 'Fetch failed';
    throw new Error(`Failed to safely fetch URL: ${message}`);
  }
}

