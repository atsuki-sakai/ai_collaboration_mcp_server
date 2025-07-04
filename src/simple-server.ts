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
    return 'Error: DeepSeek API key is not configured. Please set the DEEPSEEK_API_KEY environment variable.';
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
  
  // JSON-RPC 2.0では、idがない場合は通知（notification）として扱う
  const isNotification = id === undefined;

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
        // 通知でない場合は、idを含める
        if (!isNotification) {
          initResponse.id = id === undefined ? null : id;
        }
        return initResponse;

      case 'tools/list':
        const toolsResponse: any = {
          jsonrpc: '2.0',
          result: { tools }
        };
        // 通知でない場合は、idを含める
        if (!isNotification) {
          toolsResponse.id = id === undefined ? null : id;
        }
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
        // 通知でない場合は、idを含める
        if (!isNotification) {
          callResponse.id = id === undefined ? null : id;
        }
        return callResponse;

      default:
        const errorResponse: any = {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
        // 通知でない場合は、idを含める（nullでも）
        if (!isNotification) {
          errorResponse.id = id === undefined ? null : id;
        }
        return errorResponse;
    }
  } catch (error) {
    const catchResponse: any = {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
        data: {
          details: error instanceof Error ? error.stack : String(error)
        }
      }
    };
    // 通知でない場合は、idを含める
    if (!isNotification) {
      catchResponse.id = id === undefined ? null : id;
    }
    return catchResponse;
  }
}

import * as readline from 'readline';
import { fileURLToPath } from 'url';

// メイン関数
async function main() {
  if (process.argv.includes('--help')) {
    console.error('Simple MCP Server - Claude Code AI Collaboration');
    console.error('Usage: node simple-server.js');
    console.error('Environment: DEEPSEEK_API_KEY=your-api-key');
    process.exit(0);
  }

  // MCPプロトコルでは標準エラー出力にのみログを出力
  // デバッグモードの場合のみログを出力
  if (process.env.DEBUG === 'true') {
    console.error('MCP server listening on stdio...');
  }

  // Stdio処理
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line: string) => {
    try {
      const request = JSON.parse(line);
      
      // リクエストの基本的なバリデーション
      if (!request || typeof request !== 'object') {
        throw new Error('Invalid request format');
      }
      
      const response = await handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      // パースエラーの場合
      let errorResponse: any = {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
      
      // Try to extract id from the request if possible
      try {
        const partialRequest = JSON.parse(line);
        if (partialRequest.id !== undefined) {
          errorResponse.id = partialRequest.id;
        } else {
          errorResponse.id = null;
        }
      } catch {
        // If we can't parse the request at all, use null for id
        errorResponse.id = null;
      }
      
      console.log(JSON.stringify(errorResponse));
    }
  });
}

// 実行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    // エラーを標準エラー出力に送る
    console.error('Server error:', err);
    process.exit(1);
  });
}

export { main, handleRequest, tools };