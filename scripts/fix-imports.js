#!/usr/bin/env node

/**
 * Import Path Fixer
 * @/ パスエイリアスを相対パスに修正するスクリプト
 */

import { promises as fs } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const srcDir = join(projectRoot, 'src');

async function* getTypescriptFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      yield* getTypescriptFiles(fullPath);
    } else if (entry.name.endsWith('.ts')) {
      yield fullPath;
    }
  }
}

function getRelativePath(fromFile, toPath) {
  const fromDir = dirname(fromFile);
  const srcRelative = relative(srcDir, fromDir);
  
  // パスエイリアスを解決
  const resolvedPath = toPath.replace('@/', '');
  const targetPath = join(srcDir, resolvedPath);
  
  // 相対パスを計算
  const relativePath = relative(fromDir, targetPath);
  
  // .js 拡張子を追加
  return relativePath.startsWith('.') ? relativePath + '.js' : './' + relativePath + '.js';
}

async function fixImportsInFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  let changed = false;
  
  const fixedLines = lines.map(line => {
    // import文のマッチング（より包括的なパターン）
    const importMatch = line.match(/^(\s*import\s+.*?\bfrom\s+['"])(@\/[^'"]+)(['"];?)(.*)$/);
    if (importMatch) {
      const [, prefix, aliasPath, suffix, rest] = importMatch;
      const relativePath = getRelativePath(filePath, aliasPath);
      const newLine = prefix + relativePath + suffix + rest;
      if (newLine !== line) {
        console.log(`  ${filePath}:`);
        console.log(`    ${line.trim()}`);
        console.log(`    → ${newLine.trim()}`);
        changed = true;
      }
      return newLine;
    }
    
    // 他のimport形式もチェック
    const simpleImportMatch = line.match(/^(\s*}\s+from\s+['"])(@\/[^'"]+)(['"];?)(.*)$/);
    if (simpleImportMatch) {
      const [, prefix, aliasPath, suffix, rest] = simpleImportMatch;
      const relativePath = getRelativePath(filePath, aliasPath);
      const newLine = prefix + relativePath + suffix + rest;
      if (newLine !== line) {
        console.log(`  ${filePath}:`);
        console.log(`    ${line.trim()}`);
        console.log(`    → ${newLine.trim()}`);
        changed = true;
      }
      return newLine;
    }
    
    return line;
  });
  
  if (changed) {
    await fs.writeFile(filePath, fixedLines.join('\n'));
    return true;
  }
  
  return false;
}

async function main() {
  console.log('🔧 Fixing import paths...\n');
  
  let totalFiles = 0;
  let fixedFiles = 0;
  
  for await (const filePath of getTypescriptFiles(srcDir)) {
    totalFiles++;
    
    try {
      const wasFixed = await fixImportsInFile(filePath);
      if (wasFixed) {
        fixedFiles++;
      }
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log(`\n✅ Complete! Fixed ${fixedFiles} out of ${totalFiles} files.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}