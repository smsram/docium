/**
 * DOCIUM Vision Model Runner & Image Inspection Service
 *
 * Dispatches original image binaries and user instructions directly to the configured
 * vision-capable AI model (Cloudflare Workers AI, OpenAI, Groq, Anthropic, Gemini).
 *
 * Guarantees:
 * 1. Passes actual original image bytes as valid multimodal data URLs.
 * 2. Enforces configurable maximum image limit (DOCIUM_MAX_VISION_IMAGES_PER_REQUEST, default 5).
 * 3. Never logs base64 data URLs, API keys, or private image contents.
 * 4. Categorizes failures into precise diagnostic error categories.
 * 5. Returns structured inspection and text extraction results.
 */

import { ProviderId } from '@/lib/types';
import { resolveProviderAdapter } from '../adapters/registry';
import { NormalizedMessage } from '../adapters/base';
import { parseCloudflarePairs } from '../credentials';
import { normalizeCloudflareAccountId, normalizeCloudflareModelId, normalizeBase64DataUrl } from '../adapters/cloudflare';
import { validateImageBuffer } from '../pdf/pdfService';

export type VisionErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_WORKSPACE_MISMATCH'
  | 'SOURCE_NOT_ACCESSIBLE'
  | 'STORAGE_OBJECT_NOT_FOUND'
  | 'IMAGE_BYTES_EMPTY'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'IMAGE_COUNT_LIMIT_EXCEEDED'
  | 'IMAGE_PAYLOAD_PREPARATION_FAILED'
  | 'PROVIDER_IMAGE_INPUT_REJECTED'
  | 'VISION_REQUEST_FAILED'
  | 'VISION_RESPONSE_EMPTY';

export interface VisionImageInput {
  sourceId: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
  byteLength?: number;
}

export interface VisionInspectionAnalysis {
  extractedText: string;
  visualDescription: string;
  observations: string[];
}

export interface VisionInspectionResult {
  success: boolean;
  status?: 'inspected' | 'failed';
  sourceId?: string;
  mimeType?: string;
  imageCount?: number;
  analysis?: VisionInspectionAnalysis;
  error?: string;
  errorCategory?: VisionErrorCategory;
  diagnostics?: {
    requestId?: string;
    toolCallId?: string;
    provider: string;
    model: string;
    endpointType: string;
    httpStatus?: number;
  };
}

export interface VisionRunnerOptions {
  providerId: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
  requestId?: string;
  toolCallId?: string;
  workspaceId?: string;
  signal?: AbortSignal;
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

/**
 * Returns the configurable maximum number of images per inspection request.
 */
export function getMaxVisionImagesPerRequest(): number {
  const envVal = process.env.DOCIUM_MAX_VISION_IMAGES_PER_REQUEST;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 5;
}

/**
 * Dispatches multimodal inspection request directly to the selected vision provider.
 */
export async function executeVisionInspection(
  images: VisionImageInput[],
  instructionPrompt: string,
  options: VisionRunnerOptions
): Promise<VisionInspectionResult> {
  const maxLimit = getMaxVisionImagesPerRequest();
  const primarySourceId = images[0]?.sourceId || 'unknown';
  const primaryMime = images[0]?.mimeType || 'image/jpeg';

  // 1. Validate image count limit
  if (images.length === 0) {
    return {
      success: false,
      errorCategory: 'SOURCE_NOT_FOUND',
      error: 'No image assets provided for visual inspection.',
    };
  }

  if (images.length > maxLimit) {
    return {
      success: false,
      errorCategory: 'IMAGE_COUNT_LIMIT_EXCEEDED',
      error: `Maximum image count limit exceeded: ${images.length} images were supplied, but the configured limit is ${maxLimit} images per request. Please inspect fewer images simultaneously.`,
    };
  }

  // 2. Validate MIME types and byte length
  for (const img of images) {
    const cleanMime = (img.mimeType || '').toLowerCase();
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(cleanMime)) {
      return {
        success: false,
        sourceId: img.sourceId,
        errorCategory: 'UNSUPPORTED_IMAGE_TYPE',
        error: `Unsupported image format "${img.mimeType}" for image "${img.filename}". Supported formats: JPEG, PNG, WEBP, GIF, SVG.`,
      };
    }

    if (img.byteLength !== undefined && img.byteLength <= 0) {
      return {
        success: false,
        sourceId: img.sourceId,
        errorCategory: 'IMAGE_BYTES_EMPTY',
        error: `Image content for "${img.filename}" is empty (0 bytes).`,
      };
    }

    const normalizedDataUrl = normalizeBase64DataUrl(img.dataUrl);
    if (!normalizedDataUrl) {
      return {
        success: false,
        sourceId: img.sourceId,
        errorCategory: 'IMAGE_PAYLOAD_PREPARATION_FAILED',
        error: `Failed to construct valid multimodal image payload for "${img.filename}". Base64 data is invalid or malformed.`,
      };
    }

    const match = normalizedDataUrl.match(/^data:image\/[a-zA-Z0-9.+_-]+;base64,([\s\S]+)$/);
    if (match) {
      const rawBuf = Buffer.from(match[1], 'base64');
      const val = await validateImageBuffer(rawBuf, cleanMime);
      if (!val.valid) {
        return {
          success: false,
          sourceId: img.sourceId,
          errorCategory: 'IMAGE_PAYLOAD_PREPARATION_FAILED',
          error: `Image validation failed for "${img.filename}": ${val.error}`,
        };
      }
    }

    img.dataUrl = normalizedDataUrl;
  }

  // 3. Build comprehensive multimodal prompt
  const userInstruction = instructionPrompt.trim()
    ? instructionPrompt.trim()
    : 'Read and transcribe all visible text, numbers, and labels from this image, and describe the diagrams, layout, and visual contents.';

  const systemVisionPrompt = `You are a high-precision multimodal visual perception and OCR intelligence system.
Analyze the provided original image asset(s) and provide a thorough, accurate response.

MANDATORY DIRECTIVES:
1. COMPLETE TEXT EXTRACTION (OCR):
   - Transcribe ALL visible text, labels, numbers, titles, table headers, column data, and notes verbatim.
   - Preserve line breaks, paragraphs, number formatting, punctuation, and structural hierarchy.
   - Do not summarize, truncate, or omit visible text.
   - If any text is partially obscured or unreadable, explicitly denote it as [unreadable].

2. VISUAL ANALYSIS & LAYOUT:
   - Describe diagrams, tables, charts, flowcharts, interface elements, spatial relationships, and colors.
   - Address the user's specific instruction thoroughly.

User Instruction:
${userInstruction}`;

  const { providerId, modelId, apiKey, baseUrl, accountId, requestId, toolCallId } = options;

  console.log(`[DOCIUM Vision Diagnostics] Preparing vision inspection request:`, {
    requestId: requestId || 'none',
    toolCallId: toolCallId || 'none',
    workspaceId: options.workspaceId || 'none',
    imageCount: images.length,
    sourceIds: images.map((i) => i.sourceId),
    primaryMime,
    provider: providerId,
    model: modelId,
  });

  try {
    // 4. Validate credentials upfront based on provider
    if (providerId === 'cloudflare') {
      const { pairs, error: pairError } = parseCloudflarePairs(accountId, apiKey);
      if (pairError) {
        return {
          success: false,
          errorCategory: 'AUTHENTICATION_ERROR',
          error: `Cloudflare credential error: ${pairError}`,
          diagnostics: {
            requestId,
            toolCallId,
            provider: 'cloudflare',
            model: modelId,
            endpointType: 'chat_completions',
            httpStatus: 401,
          },
        };
      }
      if (pairs.length === 0) {
        return {
          success: false,
          errorCategory: 'AUTHENTICATION_ERROR',
          error: 'Cloudflare Account ID or API Token is not configured. Please verify Settings > AI Providers.',
          diagnostics: {
            requestId,
            toolCallId,
            provider: 'cloudflare',
            model: modelId,
            endpointType: 'chat_completions',
            httpStatus: 401,
          },
        };
      }
    } else if (!apiKey && providerId !== 'ollama' && providerId !== 'custom') {
      return {
        success: false,
        errorCategory: 'AUTHENTICATION_ERROR',
        error: `No API key configured for ${providerId}. Please verify Settings > AI Providers.`,
        diagnostics: {
          requestId,
          toolCallId,
          provider: providerId,
          model: modelId,
          endpointType: 'adapter',
          httpStatus: 401,
        },
      };
    }

    // 5. Execute multimodal inspection through the normalized provider adapter
    const adapter = resolveProviderAdapter(providerId);
    const normalizedMessages: NormalizedMessage[] = [
      {
        role: 'user',
        content: systemVisionPrompt,
        images: images.map((img) => img.dataUrl),
      },
    ];

    let outputText = '';
    let streamError: string | null = null;

    for await (const chunk of adapter.generateStream(normalizedMessages, [], {
      model: modelId,
      apiKey: apiKey || '',
      accountId,
      baseUrl,
      signal: options.signal,
    })) {
      if (chunk.type === 'delta' && chunk.delta) {
        outputText += chunk.delta;
      } else if (chunk.type === 'error' && chunk.error) {
        streamError = chunk.error;
        break;
      }
    }

    if (streamError) {
      const isAuth =
        streamError.includes('401') ||
        streamError.includes('403') ||
        /authentication|unauthorized|invalid api key|token|unauthenticated/i.test(streamError);

      console.warn(`[DOCIUM Vision Diagnostics] Vision model returned error for ${providerId}:`, {
        error: streamError.slice(0, 300),
        isAuth,
      });

      return {
        success: false,
        errorCategory: isAuth ? 'AUTHENTICATION_ERROR' : 'VISION_REQUEST_FAILED',
        error: isAuth
          ? `Authentication error with ${providerId}: ${streamError}. Please verify your API credentials in Settings > AI Providers.`
          : `Vision provider error (${providerId}): ${streamError}`,
        diagnostics: {
          requestId,
          toolCallId,
          provider: providerId,
          model: modelId,
          endpointType: 'adapter',
          httpStatus: isAuth ? 401 : 500,
        },
      };
    }

    if (!outputText.trim()) {
      return {
        success: false,
        errorCategory: 'VISION_RESPONSE_EMPTY',
        error: 'The vision model processed the image but returned an empty response. Please retry with a more specific prompt.',
      };
    }

    const parsedAnalysis = formatVisionModelAnalysis(outputText, images[0].filename);

    return {
      success: true,
      status: 'inspected',
      sourceId: primarySourceId,
      mimeType: primaryMime,
      imageCount: images.length,
      analysis: parsedAnalysis,
      diagnostics: {
        requestId,
        toolCallId,
        provider: providerId,
        model: modelId,
        endpointType: 'adapter',
        httpStatus: 200,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[DOCIUM Vision Diagnostics] Uncaught vision execution error:', err);
    return {
      success: false,
      errorCategory: 'VISION_REQUEST_FAILED',
      error: `Failed to inspect image with vision model: ${errorMsg}`,
      diagnostics: {
        requestId,
        toolCallId,
        provider: providerId,
        model: modelId,
        endpointType: 'unknown',
      },
    };
  }
}

/**
 * Splits vision model response into structured extractedText, visualDescription, and observations.
 */
function formatVisionModelAnalysis(
  modelOutput: string,
  primaryFilename: string
): VisionInspectionAnalysis {
  const trimmed = modelOutput.trim();

  // Look for OCR or Text Transcription sections
  let extractedText = '';
  let visualDescription = '';
  const observations: string[] = [];

  const ocrMatch = trimmed.match(
    /(?:###?\s*(?:ocr text|extracted text|transcription|visible text|text content)[\s\S]*?)(?:(?=###?\s*(?:visual|description|analysis|layout))|$)/i
  );

  if (ocrMatch) {
    extractedText = ocrMatch[0]
      .replace(/^###?\s*(?:ocr text|extracted text|transcription|visible text|text content)[:\s]*/i, '')
      .trim();
  }

  const descMatch = trimmed.match(
    /(?:###?\s*(?:visual description|visual analysis|description|layout & diagram|layout)[\s\S]*?)(?:(?=###?\s*(?:ocr|transcription|extracted))|$)/i
  );

  if (descMatch) {
    visualDescription = descMatch[0]
      .replace(/^###?\s*(?:visual description|visual analysis|description|layout & diagram|layout)[:\s]*/i, '')
      .trim();
  }

  // If sections were not formatted as explicit headers, use the complete output
  if (!extractedText && !visualDescription) {
    extractedText = trimmed;
    visualDescription = `Visual inspection of original image asset "${primaryFilename}".`;
  } else if (!extractedText) {
    extractedText = trimmed;
  } else if (!visualDescription) {
    visualDescription = `Visual inspection of original image asset "${primaryFilename}".`;
  }

  // Extract bullet points as observations
  const bulletMatches = trimmed.match(/^[-*•]\s+(.+)$/gm);
  if (bulletMatches && bulletMatches.length > 0) {
    for (const b of bulletMatches.slice(0, 6)) {
      observations.push(b.replace(/^[-*•]\s+/, '').trim());
    }
  } else {
    observations.push(`Analyzed original image asset "${primaryFilename}".`);
    observations.push(`Extracted ${extractedText.length} characters of visible textual content.`);
  }

  return {
    extractedText,
    visualDescription,
    observations,
  };
}

