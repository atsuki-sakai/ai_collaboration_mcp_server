#!/usr/bin/env node
/**
 * MCP Server Entry Point - エントリーポイント
 * T011: Claude Code AI Collaboration MCP Server のメインエントリーポイント
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';

// dotenvの設定（ログを無効化）
dotenv.config({ silent: true } as any);

import { setupContainer } from './core/container.js';
import { MCPServer } from './server/mcp-server.js';
import { Logger } from './core/logger.js';
import { TYPES } from './core/types.js';

async function main() {
  let logger: Logger | undefined;
  
  try {
    // DIコンテナをセットアップ
    const container = await setupContainer();
    
    // ロガーの取得
    logger = container.get<Logger>(TYPES.Logger);
    
    // スタンドアロンモードでのみ起動メッセージを表示
    const isMCPMode = process.env.MCP_PROTOCOL === 'stdio';
    if (!isMCPMode) {
      console.log('\n🚀 Claude Code AI Collaboration MCP Server');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    
    logger!.info('Starting server...');
    
    // MCPサーバーの取得と起動
    const server = container.get<MCPServer>(TYPES.MCPServer);
    await server.start();
    
    // プロセス終了ハンドラー
    process.on('SIGINT', async () => {
      logger?.info('Shutting down server...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger?.info('Shutting down server...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    if (logger) {
      logger.error('Failed to start server', error as Error);
    } else {
      console.error('Failed to start server:', error);
    }
    process.exit(1);
  }
}

// エントリーポイント
if (import.meta.url.startsWith('file:')) {
  const modulePath = new URL(import.meta.url).pathname;
  if (process.argv[1] === modulePath || process.argv[1]?.endsWith('/index.js')) {
    main().catch(console.error);
  }
}

export { main };