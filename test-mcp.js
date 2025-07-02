#!/usr/bin/env node

// Test MCP server that logs all requests
import * as readline from 'readline';
import { writeFileSync, appendFileSync } from 'fs';

const logFile = '/tmp/mcp-test.log';
writeFileSync(logFile, '=== MCP Test Server Started ===\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  appendFileSync(logFile, `Received: ${line}\n`);
  
  try {
    const request = JSON.parse(line);
    let response;
    
    if (request.method === 'initialize') {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' }
        }
      };
    } else if (request.method === 'tools/list') {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: [] }
      };
    } else {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      };
    }
    
    const responseStr = JSON.stringify(response);
    appendFileSync(logFile, `Sending: ${responseStr}\n`);
    console.log(responseStr);
  } catch (error) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    };
    const responseStr = JSON.stringify(errorResponse);
    appendFileSync(logFile, `Error parsing, sending: ${responseStr}\n`);
    console.log(responseStr);
  }
});

appendFileSync(logFile, 'Server ready\n');