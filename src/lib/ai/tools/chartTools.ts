/**
 * Chart and Data Visualization Tools
 * Generates validated structured chart specifications (bar, line, pie, scatter) rendered via ECharts.
 */

import { ToolDefinition } from './types';
import { ChartSpecification } from '@/lib/types';

export const createBarChartTool: ToolDefinition = {
  name: 'create_bar_chart',
  label: 'Create Bar Chart',
  description: 'Generate an interactive bar chart visualization with categories, series, and values.',
  activityLabel: 'Creating a bar chart',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title of the chart' },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'X-axis category labels (e.g. ["Q1", "Q2", "Q3", "Q4"]).',
      },
      seriesName: { type: 'string', description: 'Name of the data series' },
      data: {
        type: 'array',
        items: { type: 'number' },
        description: 'Numeric values corresponding to each category.',
      },
      summary: { type: 'string', description: 'Brief analytical summary of key takeaway' },
    },
    required: ['title', 'categories', 'data'],
  },
  execute: async (args) => {
    const title = String(args.title || 'Bar Chart');
    const categories = Array.isArray(args.categories) ? args.categories.map(String) : ['A', 'B', 'C'];
    const data = Array.isArray(args.data) ? args.data.map(Number) : [10, 20, 30];
    const seriesName = String(args.seriesName || 'Value');
    const summary = args.summary ? String(args.summary) : undefined;

    const chartSpec: ChartSpecification = {
      type: 'bar',
      title,
      xAxis: {
        data: categories,
      },
      series: [
        {
          name: seriesName,
          data,
          color: '#245C45',
        },
      ],
      summary,
    };

    return {
      success: true,
      data: chartSpec,
      structuredBlock: {
        type: 'chart',
        chart: chartSpec,
      },
      activitySummary: `Created bar chart "${title}"`,
    };
  },
};

export const createLineChartTool: ToolDefinition = {
  name: 'create_line_chart',
  label: 'Create Line Chart',
  description: 'Generate an interactive line chart showing time-series trends or continuous progression.',
  activityLabel: 'Creating a line chart',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title of the chart' },
      xAxisLabels: {
        type: 'array',
        items: { type: 'string' },
        description: 'X-axis timestamps or time intervals.',
      },
      seriesName: { type: 'string', description: 'Name of the trend series' },
      data: {
        type: 'array',
        items: { type: 'number' },
        description: 'Sequence of numeric values.',
      },
      summary: { type: 'string', description: 'Brief analytical summary of the trend' },
    },
    required: ['title', 'xAxisLabels', 'data'],
  },
  execute: async (args) => {
    const title = String(args.title || 'Line Chart');
    const xAxisLabels = Array.isArray(args.xAxisLabels) ? args.xAxisLabels.map(String) : ['Jan', 'Feb', 'Mar'];
    const data = Array.isArray(args.data) ? args.data.map(Number) : [10, 15, 25];
    const seriesName = String(args.seriesName || 'Trend');
    const summary = args.summary ? String(args.summary) : undefined;

    const chartSpec: ChartSpecification = {
      type: 'line',
      title,
      xAxis: {
        data: xAxisLabels,
      },
      series: [
        {
          name: seriesName,
          data,
          color: '#398568',
        },
      ],
      summary,
    };

    return {
      success: true,
      data: chartSpec,
      structuredBlock: {
        type: 'chart',
        chart: chartSpec,
      },
      activitySummary: `Created line chart "${title}"`,
    };
  },
};

export const createPieChartTool: ToolDefinition = {
  name: 'create_pie_chart',
  label: 'Create Pie Chart',
  description: 'Generate a pie or donut chart representing proportional distribution or market share.',
  activityLabel: 'Creating a pie chart',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Chart title' },
      segments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' },
          },
          required: ['name', 'value'],
        },
        description: 'Array of slice names and numeric values.',
      },
      summary: { type: 'string', description: 'Brief observation on distribution' },
    },
    required: ['title', 'segments'],
  },
  execute: async (args) => {
    const title = String(args.title || 'Distribution');
    const segments = Array.isArray(args.segments)
      ? (args.segments as Array<{ name: string; value: number }>).map((s) => ({
          name: String(s.name),
          value: Number(s.value),
        }))
      : [
          { name: 'Segment A', value: 40 },
          { name: 'Segment B', value: 60 },
        ];
    const summary = args.summary ? String(args.summary) : undefined;

    const chartSpec: ChartSpecification = {
      type: 'pie',
      title,
      series: [],
      pieData: segments,
      summary,
    };

    return {
      success: true,
      data: chartSpec,
      structuredBlock: {
        type: 'chart',
        chart: chartSpec,
      },
      activitySummary: `Created pie chart "${title}"`,
    };
  },
};

export const createComparisonChartTool: ToolDefinition = {
  name: 'create_comparison_chart',
  label: 'Create Comparison Chart',
  description: 'Create a multi-series bar or line chart comparing multiple metrics or time horizons.',
  activityLabel: 'Creating a comparison chart',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Chart title' },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Common category labels.',
      },
      series: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            data: { type: 'array', items: { type: 'number' } },
          },
          required: ['name', 'data'],
        },
        description: 'Array of series names and data arrays.',
      },
      summary: { type: 'string', description: 'Key comparative findings' },
    },
    required: ['title', 'categories', 'series'],
  },
  execute: async (args) => {
    const title = String(args.title || 'Comparative Analysis');
    const categories = Array.isArray(args.categories) ? args.categories.map(String) : [];
    const seriesList = Array.isArray(args.series)
      ? (args.series as Array<{ name: string; data: number[] }>).map((s, idx) => ({
          name: String(s.name),
          data: Array.isArray(s.data) ? s.data.map(Number) : [],
          color: idx === 0 ? '#245C45' : idx === 1 ? '#4F8C71' : '#82B49E',
        }))
      : [];
    const summary = args.summary ? String(args.summary) : undefined;

    const chartSpec: ChartSpecification = {
      type: 'bar',
      title,
      xAxis: { data: categories },
      series: seriesList,
      summary,
    };

    return {
      success: true,
      data: chartSpec,
      structuredBlock: {
        type: 'chart',
        chart: chartSpec,
      },
      activitySummary: `Created comparison chart "${title}"`,
    };
  },
};

export const createDataTableTool: ToolDefinition = {
  name: 'create_data_table',
  label: 'Create Data Table',
  description: 'Render a structured data table with headers and rows inside the conversation.',
  activityLabel: 'Formulating data table',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Table title' },
      headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
      rows: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
        description: 'Array of row value arrays.',
      },
    },
    required: ['headers', 'rows'],
  },
  execute: async (args) => {
    const title = args.title ? String(args.title) : undefined;
    const headers = Array.isArray(args.headers) ? args.headers.map(String) : [];
    const rows = Array.isArray(args.rows)
      ? (args.rows as unknown[][]).map((row) => (Array.isArray(row) ? row.map(String) : []))
      : [];

    return {
      success: true,
      data: { title, headers, rows },
      structuredBlock: {
        type: 'table',
        title,
        headers,
        rows,
      },
      activitySummary: `Generated table with ${rows.length} rows`,
    };
  },
};

export const chartTools = [
  createBarChartTool,
  createLineChartTool,
  createPieChartTool,
  createComparisonChartTool,
  createDataTableTool,
];

