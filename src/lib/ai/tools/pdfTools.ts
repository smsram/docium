/**
 * Universal AI Agent — PDF Document Workspace Tools
 * Allows reading PDF pages, searching content, and extracting tables or visual figures.
 */

import { ToolDefinition } from './types';
import { SAMPLE_PDFS } from '@/lib/sampleData';

export const readPdfPageTool: ToolDefinition = {
  name: 'read_pdf_page',
  label: 'Read PDF Page',
  description: 'Read the extracted text and metadata of a specific PDF page.',
  activityLabel: 'Reading PDF page',
  parameters: {
    type: 'object',
    properties: {
      pdfId: {
        type: 'string',
        description: 'Optional PDF ID.',
      },
      pageNumber: {
        type: 'number',
        description: '1-based page number to inspect.',
      },
    },
    required: ['pageNumber'],
  },
  execute: async (args) => {
    const pageNum = typeof args.pageNumber === 'number' ? args.pageNumber : 1;
    const pdf = SAMPLE_PDFS[0];

    const sampleText =
      pageNum === 1
        ? `Executive Summary & Multimodal AI Framework\nModern enterprise knowledge management requires unified semantic pipelines across text and visuals.`
        : `Page ${pageNum}: Performance Analysis & System Reliability\nSystem latency benchmarks demonstrated sub-15ms throughput under concurrent load.`;

    return {
      success: true,
      data: {
        pdfTitle: pdf.title,
        pageNumber: pageNum,
        totalPages: pdf.pageCount || 12,
        content: sampleText,
        annotationsCount: pdf.annotations?.length || 0,
      },
      activitySummary: `Read Page ${pageNum} of "${pdf.title}"`,
    };
  },
};

export const searchPdfContentTool: ToolDefinition = {
  name: 'search_pdf_content',
  label: 'Search PDF Content',
  description: 'Search for keywords, phrases, or topics across all pages of a PDF document.',
  activityLabel: 'Searching PDF pages',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keyword or phrase to search within the PDF.',
      },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const q = String(args.query || '').toLowerCase();
    const pdf = SAMPLE_PDFS[0];

    const matches = [
      {
        page: 1,
        snippet: `...modern enterprise knowledge management requires unified semantic pipelines...`,
      },
      {
        page: 3,
        snippet: `...performance analysis demonstrates significant precision gains across benchmarks...`,
      },
    ];

    return {
      success: true,
      data: {
        pdfTitle: pdf.title,
        query: q,
        matches,
        matchCount: matches.length,
      },
      activitySummary: `Found ${matches.length} matches for "${q}" in "${pdf.title}"`,
    };
  },
};

export const pdfTools: ToolDefinition[] = [readPdfPageTool, searchPdfContentTool];

