/**
 * Calculator Tool
 * Evaluates mathematical expressions safely using an AST token parser (zero eval/new Function).
 */

import { ToolDefinition } from './types';

function evaluateExpression(expr: string): number {
  // Clean expression: allow numbers, operators, parens, decimal points, spaces
  const sanitized = expr.replace(/[^0-9+\-*/().^eE\s]/g, '');
  if (!sanitized) throw new Error('Invalid expression');

  // Simple token parser and evaluator
  const tokens = sanitized.match(/\d+(\.\d+)?([eE][+-]?\d+)?|[+\-*/^()]/g);
  if (!tokens) throw new Error('No valid mathematical tokens found');

  let pos = 0;

  function peek(): string | null {
    return pos < tokens!.length ? tokens![pos] : null;
  }

  function consume(): string {
    return tokens![pos++];
  }

  function parsePrimary(): number {
    const token = consume();
    if (token === '(') {
      const val = parseAddSub();
      if (consume() !== ')') throw new Error('Mismatched parentheses');
      return val;
    }
    if (token === '-') {
      return -parsePrimary();
    }
    if (token === '+') {
      return parsePrimary();
    }
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error(`Unexpected token: ${token}`);
    return num;
  }

  function parsePower(): number {
    let left = parsePrimary();
    while (peek() === '^') {
      consume();
      const right = parsePrimary();
      left = Math.pow(left, right);
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parsePower();
      if (op === '*') left *= right;
      else {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      }
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseMulDiv();
      if (op === '+') left += right;
      else left -= right;
    }
    return left;
  }

  return parseAddSub();
}

export const calculateTool: ToolDefinition = {
  name: 'calculate',
  label: 'Calculator',
  description: 'Evaluate mathematical calculations, financial formulas, ratios, percentages, and growth rates.',
  activityLabel: 'Calculating formula',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to calculate (e.g. "(125000 * 1.15) - 34000").',
      },
    },
    required: ['expression'],
  },
  execute: async (args) => {
    const expr = String(args.expression || '').trim();
    if (!expr) return { success: false, error: 'Expression is required' };

    try {
      const result = evaluateExpression(expr);
      return {
        success: true,
        data: {
          expression: expr,
          result,
          formatted: Number.isInteger(result) ? result.toLocaleString() : result.toFixed(4).replace(/\.?0+$/, ''),
        },
        activitySummary: `Calculated: ${expr} = ${result}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Calculation error';
      return { success: false, error: msg };
    }
  },
};

