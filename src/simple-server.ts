#!/usr/bin/env node
/**
 * Simple MCP Server - 簡略化されたMCPサーバー実装
 * DIコンテナなしで動作確認用
 */

import 'reflect-metadata';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

// MCPツールの定義
const tools = [
  {
    name: 'collaborate',
    description: 'Collaborate with AI providers using various strategies',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to send to AI providers' },
        strategy: { type: 'string', enum: ['parallel', 'sequential', 'consensus', 'iterative'] },
        providers: { type: 'array', items: { type: 'string' } }
      },
      required: ['prompt']
    }
  },
  {
    name: 'review',
    description: 'Review and analyze content',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to review' },
        criteria: { type: 'array', items: { type: 'string' } }
      },
      required: ['content']
    }
  },
  {
    name: 'compare',
    description: 'Compare multiple items',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        comparison_dimensions: { type: 'array', items: { type: 'string' } }
      },
      required: ['items']
    }
  },
  {
    name: 'refine',
    description: 'Refine and improve content',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to refine' },
        refinement_goals: { type: 'object' }
      },
      required: ['content']
    }
  }
];

// DeepSeek API呼び出し
async function callDeepSeek(prompt: string): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    return 'Error: DeepSeek API key is not configured';
  }

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      return `Error: DeepSeek API returned ${response.status}`;
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// ツール実行
async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'collaborate':
      const result = await callDeepSeek(args.prompt);
      return {
        provider: 'deepseek',
        strategy: args.strategy || 'single',
        result
      };

    case 'review':
      const reviewPrompt = `Please review the following content:\n\n${args.content}\n\nCriteria: ${args.criteria?.join(', ') || 'general quality'}`;
      return {
        review: await callDeepSeek(reviewPrompt),
        criteria: args.criteria || ['general']
      };

    case 'compare':
      const comparePrompt = `Compare the following items:\n\n${JSON.stringify(args.items, null, 2)}\n\nDimensions: ${args.comparison_dimensions?.join(', ') || 'all aspects'}`;
      return {
        comparison: await callDeepSeek(comparePrompt),
        items_count: args.items.length
      };

    case 'refine':
      const refinePrompt = `Please refine and improve the following content:\n\n${args.content}\n\nGoals: ${JSON.stringify(args.refinement_goals || {})}`;
      return {
        refined_content: await callDeepSeek(refinePrompt),
        original_length: args.content.length
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC ハンドラー
async function handleRequest(request: any): Promise<any> {
  const { method, params, id } = request;

  try {
    switch (method) {
      case 'initialize':
        const initResponse: any = {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: true },
              resources: { subscribe: false }
            },
            serverInfo: {
              name: 'claude-code-ai-collab-mcp',
              version: '1.0.0'
            }
          }
        };
        if (id !== undefined) initResponse.id = id;
        return initResponse;

      case 'tools/list':
        const toolsResponse: any = {
          jsonrpc: '2.0',
          result: { tools }
        };
        if (id !== undefined) toolsResponse.id = id;
        return toolsResponse;

      case 'tools/call':
        const toolResult = await executeTool(params.name, params.arguments);
        const callResponse: any = {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(toolResult, null, 2)
              }
            ]
          }
        };
        if (id !== undefined) callResponse.id = id;
        return callResponse;

      default:
        const errorResponse: any = {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
        if (id !== undefined) errorResponse.id = id;
        return errorResponse;
    }
  } catch (error) {
    const catchResponse: any = {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    };
    if (id !== undefined) catchResponse.id = id;
    return catchResponse;
  }
}

import * as readline from 'readline';
import { fileURLToPath } from 'url';

// メイン関数
async function main() {
  if (process.argv.includes('--help')) {
    console.log('Simple MCP Server - Claude Code AI Collaboration');
    console.log('Usage: node simple-server.js');
    console.log('Environment: DEEPSEEK_API_KEY=your-api-key');
    process.exit(0);
  }

  // MCPプロトコルでは標準エラー出力にのみログを出力
  console.error('MCP server listening on stdio...');

  // Stdio処理
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line: string) => {
    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      }));
    }
  });
}

// 実行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { main, handleRequest, tools };