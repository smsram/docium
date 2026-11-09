/**
 * Universal AI Agent — Presentation & Slide Workspace Tools
 * Allows inspecting slides, reading presentation content, and analyzing deck structure.
 */

import { ToolDefinition } from './types';
import { SAMPLE_SLIDES } from '@/lib/sampleData';

export const listSlidesTool: ToolDefinition = {
  name: 'list_slides',
  label: 'List Slides',
  description: 'List all slides and their titles in the active or referenced presentation.',
  activityLabel: 'Listing presentation slides',
  parameters: {
    type: 'object',
    properties: {
      presentationId: {
        type: 'string',
        description: 'Optional presentation ID.',
      },
    },
  },
  execute: async () => {
    const pres = SAMPLE_SLIDES[0];
    const slides = pres.slides.map((s, idx) => ({
      slideNumber: idx + 1,
      id: s.id,
      title: s.title || `Slide ${idx + 1}`,
      elementCount: s.elements?.length || 0,
      layout: s.layout || 'title-and-content',
    }));

    return {
      success: true,
      data: {
        presentationTitle: pres.title,
        slides,
        totalSlides: slides.length,
      },
      activitySummary: `Found ${slides.length} slides in "${pres.title}"`,
    };
  },
};

export const readSlideContentTool: ToolDefinition = {
  name: 'read_slide_content',
  label: 'Read Slide Content',
  description: 'Read the text, bullet points, speaker notes, and visual layout of a specific slide.',
  activityLabel: 'Reading slide details',
  parameters: {
    type: 'object',
    properties: {
      slideNumber: {
        type: 'number',
        description: 'The 1-based slide number to read.',
      },
    },
    required: ['slideNumber'],
  },
  execute: async (args) => {
    const num = typeof args.slideNumber === 'number' ? args.slideNumber : 1;
    const pres = SAMPLE_SLIDES[0];
    const slideIdx = Math.max(0, Math.min(num - 1, pres.slides.length - 1));
    const slide = pres.slides[slideIdx];

    return {
      success: true,
      data: {
        presentationTitle: pres.title,
        slideNumber: slideIdx + 1,
        title: slide.title,
        layout: slide.layout,
        notes: slide.notes || 'No speaker notes recorded.',
        elements: slide.elements,
      },
      activitySummary: `Read Slide ${slideIdx + 1}: "${slide.title}"`,
    };
  },
};

export const presentationTools: ToolDefinition[] = [listSlidesTool, readSlideContentTool];

