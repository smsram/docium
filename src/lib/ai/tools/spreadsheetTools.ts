/**
 * Universal AI Agent — Spreadsheet Workspace Tools
 * Allows inspecting sheets, reading ranges, searching cells, calculating statistics, and generating charts.
 */

import { ToolDefinition } from './types';
import { SAMPLE_SHEETS } from '@/lib/sampleData';

export const listSheetsTool: ToolDefinition = {
  name: 'list_sheets',
  label: 'List Sheets',
  description: 'List available sheets and tabs in the active or target spreadsheet.',
  activityLabel: 'Listing spreadsheet tabs',
  parameters: {
    type: 'object',
    properties: {
      spreadsheetId: {
        type: 'string',
        description: 'Optional spreadsheet ID.',
      },
    },
  },
  execute: async () => {
    const sheetDoc = SAMPLE_SHEETS[0];
    const tabs = sheetDoc.sheets || [
      { id: 'tab-1', name: 'Financial Overview', rowCount: 100, colCount: 26 },
      { id: 'tab-2', name: 'Revenue Breakdown', rowCount: 50, colCount: 15 },
      { id: 'tab-3', name: 'Departmental Headcount', rowCount: 40, colCount: 10 },
    ];

    return {
      success: true,
      data: {
        spreadsheetTitle: sheetDoc.title,
        tabs,
        totalTabs: tabs.length,
      },
      activitySummary: `Found ${tabs.length} tabs in "${sheetDoc.title}"`,
    };
  },
};

export const readSheetRangeTool: ToolDefinition = {
  name: 'read_sheet_range',
  label: 'Read Sheet Range',
  description: 'Read a specific rectangular cell range from a spreadsheet tab (e.g. A1:D10).',
  activityLabel: 'Reading sheet cells',
  parameters: {
    type: 'object',
    properties: {
      sheetName: {
        type: 'string',
        description: 'Tab name (e.g. "Financial Overview").',
      },
      range: {
        type: 'string',
        description: 'Cell range coordinates in A1 notation (e.g. "A1:D6").',
      },
    },
    required: ['range'],
  },
  execute: async (args) => {
    const range = String(args.range || 'A1:D5').toUpperCase();
    const sheetName = args.sheetName ? String(args.sheetName) : 'Financial Overview';

    const sampleGrid = [
      ['Quarter', 'Revenue ($M)', 'Expenses ($M)', 'Operating Margin'],
      ['Q1 2026', '14.2', '9.8', '31.0%'],
      ['Q2 2026', '16.8', '10.5', '37.5%'],
      ['Q3 2026', '19.4', '11.2', '42.3%'],
      ['Q4 2026', '22.1', '12.0', '45.7%'],
    ];

    return {
      success: true,
      data: {
        sheetName,
        range,
        headers: sampleGrid[0],
        rows: sampleGrid.slice(1),
        rowCount: sampleGrid.length,
      },
      activitySummary: `Read range ${range} from "${sheetName}"`,
    };
  },
};

export const calculateStatisticsTool: ToolDefinition = {
  name: 'calculate_statistics',
  label: 'Calculate Statistics',
  description: 'Calculate mean, median, sum, minimum, maximum, and standard deviation for a dataset.',
  activityLabel: 'Calculating dataset statistics',
  parameters: {
    type: 'object',
    properties: {
      values: {
        type: 'array',
        items: { type: 'number' },
        description: 'List of numbers to evaluate.',
      },
      label: {
        type: 'string',
        description: 'Name of the metric or column (e.g. "Quarterly Revenue").',
      },
    },
    required: ['values'],
  },
  execute: async (args) => {
    const nums = (args.values as number[]).filter((n) => typeof n === 'number' && !isNaN(n));
    if (nums.length === 0) {
      return { success: false, error: 'Provide at least one valid numeric value.' };
    }

    const sum = nums.reduce((acc, v) => acc + v, 0);
    const mean = sum / nums.length;
    const sorted = [...nums].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const variance = nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / nums.length;
    const stdDev = Math.sqrt(variance);

    const stats = {
      label: args.label || 'Dataset',
      count: nums.length,
      sum: Math.round(sum * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
    };

    return {
      success: true,
      data: stats,
      activitySummary: `Calculated statistics for ${stats.count} values (Mean: ${stats.mean}, Sum: ${stats.sum})`,
    };
  },
};

export const spreadsheetTools: ToolDefinition[] = [
  listSheetsTool,
  readSheetRangeTool,
  calculateStatisticsTool,
];
