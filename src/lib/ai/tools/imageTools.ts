/**
 * Image Understanding Tools
 * Analyzes objects, diagrams, visible text, and UI layouts in attached images.
 */

import { ToolDefinition } from './types';
import {
  searchIndexedImages,
  getIndexedImageById,
  getAllIndexedImages,
  findCachedImageAnalysis,
  computeImageContentHash,
} from '../images/imageUnderstanding';

export const analyzeAttachedImageTool: ToolDefinition = {
  name: 'analyze_attached_image',
  label: 'Analyze Attached Image',
  description: 'Inspect and describe the contents of an attached image, including diagrams, charts, UI, or photos.',
  activityLabel: 'Analyzing an image',
  parameters: {
    type: 'object',
    properties: {
      imageIdOrFilename: {
        type: 'string',
        description: 'ID or filename of the attached image.',
      },
      question: {
        type: 'string',
        description: 'Specific question about the image elements or details.',
      },
    },
    required: ['imageIdOrFilename'],
  },
  execute: async (args, context) => {
    const target = String(args.imageIdOrFilename || '').toLowerCase();
    const source = context.attachedSources.find(
      (s) => (s.type === 'image' || s.mimeType?.startsWith('image/')) &&
        (s.id.toLowerCase() === target || s.title.toLowerCase().includes(target))
    );

    const indexed = getIndexedImageById(target) ||
      getAllIndexedImages(context.workspaceId).find((i) => i.filename.toLowerCase().includes(target));

    if (!source && !indexed) {
      return { success: false, error: `Image "${args.imageIdOrFilename}" not found in conversation sources.` };
    }

    const question = args.question ? String(args.question) : 'Describe key elements';
    const description = indexed?.aiGeneratedDescription || source?.snippet || `Visual analysis of ${source?.title || indexed?.filename}`;

    return {
      success: true,
      data: {
        imageTitle: indexed?.filename || source?.title,
        question,
        analysis: description,
        subjects: indexed?.mainSubjects || [],
        hasCharts: indexed?.hasChartsOrDiagrams ?? false,
        ocrText: indexed?.ocrText,
        fileSize: source?.fileSize,
      },
      activitySummary: `Analyzed image "${indexed?.filename || source?.title}"`,
    };
  },
};

export const extractTextFromImageTool: ToolDefinition = {
  name: 'extract_text_from_image',
  label: 'Extract Text from Image (OCR)',
  description: 'Perform optical character recognition on an attached image to extract legible text and code.',
  activityLabel: 'Extracting text from image',
  parameters: {
    type: 'object',
    properties: {
      imageIdOrFilename: {
        type: 'string',
        description: 'ID or filename of the image.',
      },
    },
    required: ['imageIdOrFilename'],
  },
  execute: async (args, context) => {
    const target = String(args.imageIdOrFilename || '').toLowerCase();
    const source = context.attachedSources.find(
      (s) => (s.type === 'image' || s.mimeType?.startsWith('image/')) &&
        (s.id.toLowerCase() === target || s.title.toLowerCase().includes(target))
    );

    const indexed = getIndexedImageById(target) ||
      getAllIndexedImages(context.workspaceId).find((i) => i.filename.toLowerCase().includes(target));

    if (!source && !indexed) {
      return { success: false, error: 'Image not found in attached sources.' };
    }

    const ocrText = indexed?.ocrText || source?.extractedText || source?.snippet || 'No visible text detected.';

    return {
      success: true,
      data: {
        imageTitle: indexed?.filename || source?.title,
        extractedText: ocrText,
      },
      activitySummary: `Extracted text from "${indexed?.filename || source?.title}"`,
    };
  },
};

export const searchWorkspaceImagesTool: ToolDefinition = {
  name: 'search_workspace_images',
  label: 'Search Workspace Images',
  description: 'Search workspace images using natural language queries across visual descriptions, OCR text, and keywords.',
  activityLabel: 'Searching workspace images',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query (e.g. "architecture diagram", "sales chart", "login button").',
      },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const query = String(args.query || '').trim();
    const results = searchIndexedImages(query, context.workspaceId);

    const items = results.slice(0, 5).map(({ record, score }) => ({
      id: record.id,
      filename: record.filename,
      subjects: record.mainSubjects,
      description: record.objectsAndDetails,
      ocrText: record.ocrText,
      page: record.page,
      hasCharts: record.hasChartsOrDiagrams,
      relevanceScore: Math.round(score * 10) / 10,
    }));

    return {
      success: true,
      data: {
        query,
        count: items.length,
        images: items,
      },
      activitySummary: `Found ${items.length} images matching "${query}"`,
    };
  },
};

export const inspectImageDetailsTool: ToolDefinition = {
  name: 'inspect_image_details',
  label: 'Inspect Image Details',
  description: 'Retrieve full structured visual understanding, OCR text, keywords, and metadata for a specific image.',
  activityLabel: 'Inspecting image details',
  parameters: {
    type: 'object',
    properties: {
      imageId: {
        type: 'string',
        description: 'ID of the image to inspect.',
      },
    },
    required: ['imageId'],
  },
  execute: async (args, context) => {
    const imageId = String(args.imageId || '').trim();
    const record = getIndexedImageById(imageId) ||
      getAllIndexedImages(context.workspaceId).find((i) => i.id === imageId || i.filename.toLowerCase().includes(imageId.toLowerCase()));

    if (!record) {
      return {
        success: false,
        error: `Image with ID "${imageId}" was not found in the workspace index.`,
      };
    }

    return {
      success: true,
      data: {
        id: record.id,
        filename: record.filename,
        subjects: record.mainSubjects,
        details: record.objectsAndDetails,
        ocrText: record.ocrText,
        keywords: record.keywords,
        hasChartsOrDiagrams: record.hasChartsOrDiagrams,
        chartOrTableData: record.chartOrTableData,
        page: record.page,
        slide: record.slide,
        analysisModel: record.analysisModel,
        analyzedAt: record.analyzedAt,
      },
      activitySummary: `Retrieved details for "${record.filename}"`,
    };
  },
};

export const imageTools = [
  analyzeAttachedImageTool,
  extractTextFromImageTool,
  searchWorkspaceImagesTool,
  inspectImageDetailsTool,
];

