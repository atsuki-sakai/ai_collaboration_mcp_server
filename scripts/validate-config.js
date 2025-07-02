#!/usr/bin/env node
/**
 * Configuration Validation Script
 * T012: Validates YAML configuration files against JSON schema
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color] || ''}${text}${colors.reset}`;
}

async function loadSchema() {
  try {
    const schemaPath = path.join(__dirname, '..', 'config', 'schema.json');
    const schemaContent = await fs.promises.readFile(schemaPath, 'utf8');
    return JSON.parse(schemaContent);
  } catch (error) {
    console.error(colorize('❌ Failed to load schema:', 'red'), error.message);
    process.exit(1);
  }
}

async function loadYamlConfig(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    
    // Replace environment variable placeholders for validation
    const processedContent = content.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      // For validation purposes, provide dummy values
      const dummyValues = {
        'DEEPSEEK_API_KEY': 'sk-dummy-deepseek-key-for-validation-only',
        'OPENAI_API_KEY': 'sk-dummy-openai-key-for-validation-only',
        'ANTHROPIC_API_KEY': 'sk-dummy-anthropic-key-for-validation-only',
        'O3_API_KEY': 'sk-dummy-o3-key-for-validation-only',
        'REDIS_PASSWORD': 'dummy-redis-password',
        'PORT': '3000'
      };
      
      return dummyValues[envVar] || `dummy-${envVar.toLowerCase()}`;
    });
    
    return yaml.load(processedContent);
  } catch (error) {
    throw new Error(`Failed to load YAML config: ${error.message}`);
  }
}

async function validateConfig(configPath, schema) {
  console.log(colorize(`📝 Validating: ${path.basename(configPath)}`, 'blue'));
  
  try {
    const config = await loadYamlConfig(configPath);
    
    const ajv = new Ajv({ 
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(ajv);
    
    const validate = ajv.compile(schema);
    const valid = validate(config);
    
    if (valid) {
      console.log(colorize('  ✅ Valid configuration', 'green'));
      return true;
    } else {
      console.log(colorize('  ❌ Invalid configuration:', 'red'));
      
      if (validate.errors) {
        validate.errors.forEach(error => {
          const path = error.instancePath || error.schemaPath;
          const message = error.message;
          const value = error.data !== undefined ? ` (got: ${JSON.stringify(error.data)})` : '';
          
          console.log(colorize(`    • ${path}: ${message}${value}`, 'red'));
        });
      }
      
      return false;
    }
  } catch (error) {
    console.log(colorize(`  ❌ Error loading config: ${error.message}`, 'red'));
    return false;
  }
}

async function validateConfigStructure(config) {
  const warnings = [];
  
  // Check provider configurations
  if (config.providers && Array.isArray(config.providers)) {
    const enabledProviders = config.providers.filter(p => p.enabled);
    if (enabledProviders.length === 0) {
      warnings.push('No providers are enabled');
    }
    
    // Check for missing API keys
    enabledProviders.forEach(provider => {
      if (!provider.api_key || provider.api_key.includes('dummy')) {
        warnings.push(`Provider ${provider.name} may be missing API key`);
      }
    });
  }
  
  // Check strategy configuration
  if (config.strategies) {
    const defaultStrategy = config.strategies.default;
    if (defaultStrategy && !['parallel', 'sequential', 'consensus', 'iterative'].includes(defaultStrategy)) {
      warnings.push(`Unknown default strategy: ${defaultStrategy}`);
    }
  }
  
  // Check cache configuration
  if (config.cache && config.cache.enabled) {
    if (config.cache.type === 'redis' && (!config.cache.redis || !config.cache.redis.host)) {
      warnings.push('Redis cache enabled but host not configured');
    }
  }
  
  return warnings;
}

async function validateEnvironmentSpecific(configPath, config) {
  const filename = path.basename(configPath, '.yaml');
  const warnings = [];
  
  switch (filename) {
    case 'production':
      // Production-specific validations
      if (config.server && config.server.log_level === 'debug') {
        warnings.push('Debug logging should not be used in production');
      }
      
      if (config.development && config.development.debug_mode) {
        warnings.push('Debug mode should be disabled in production');
      }
      
      if (config.cache && config.cache.type === 'memory') {
        warnings.push('Memory cache may not be suitable for production');
      }
      break;
      
    case 'test':
      // Test-specific validations
      if (config.cache && config.cache.enabled) {
        warnings.push('Cache should typically be disabled in test environment');
      }
      
      if (config.metrics && config.metrics.enabled) {
        warnings.push('Metrics collection should typically be disabled in test environment');
      }
      break;
      
    case 'development':
      // Development-specific validations
      if (config.server && config.server.host !== 'localhost' && config.server.host !== '127.0.0.1') {
        warnings.push('Development should typically use localhost');
      }
      break;
  }
  
  return warnings;
}

async function main() {
  console.log(colorize('🔍 Configuration Validation Tool', 'cyan'));
  console.log(colorize('=' .repeat(40), 'cyan'));
  
  const schema = await loadSchema();
  const configDir = path.join(__dirname, '..', 'config');
  
  try {
    const files = await fs.promises.readdir(configDir);
    const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
    
    if (yamlFiles.length === 0) {
      console.log(colorize('⚠️  No YAML configuration files found', 'yellow'));
      return;
    }
    
    let allValid = true;
    
    for (const file of yamlFiles) {
      const filePath = path.join(configDir, file);
      const isValid = await validateConfig(filePath, schema);
      
      if (isValid) {
        // Additional structural validation
        try {
          const config = await loadYamlConfig(filePath);
          
          const structuralWarnings = await validateConfigStructure(config);
          const environmentWarnings = await validateEnvironmentSpecific(filePath, config);
          const allWarnings = [...structuralWarnings, ...environmentWarnings];
          
          if (allWarnings.length > 0) {
            console.log(colorize('  ⚠️  Warnings:', 'yellow'));
            allWarnings.forEach(warning => {
              console.log(colorize(`    • ${warning}`, 'yellow'));
            });
          }
        } catch (error) {
          console.log(colorize(`  ⚠️  Could not perform structural validation: ${error.message}`, 'yellow'));
        }
      } else {
        allValid = false;
      }
      
      console.log(); // Empty line for readability
    }
    
    console.log(colorize('=' .repeat(40), 'cyan'));
    
    if (allValid) {
      console.log(colorize('🎉 All configuration files are valid!', 'green'));
      process.exit(0);
    } else {
      console.log(colorize('💥 Some configuration files have errors', 'red'));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(colorize('❌ Error reading config directory:', 'red'), error.message);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.length > 2) {
  const specificFile = process.argv[2];
  const configPath = path.resolve(specificFile);
  
  console.log(colorize(`🔍 Validating specific file: ${configPath}`, 'cyan'));
  
  (async () => {
    const schema = await loadSchema();
    const isValid = await validateConfig(configPath, schema);
    
    if (isValid) {
      const config = await loadYamlConfig(configPath);
      const warnings = await validateConfigStructure(config);
      
      if (warnings.length > 0) {
        console.log(colorize('⚠️  Warnings:', 'yellow'));
        warnings.forEach(warning => {
          console.log(colorize(`  • ${warning}`, 'yellow'));
        });
      }
      
      console.log(colorize('✅ Configuration is valid', 'green'));
      process.exit(0);
    } else {
      console.log(colorize('❌ Configuration is invalid', 'red'));
      process.exit(1);
    }
  })().catch(error => {
    console.error(colorize('❌ Validation error:', 'red'), error.message);
    process.exit(1);
  });
} else {
  main().catch(error => {
    console.error(colorize('❌ Unexpected error:', 'red'), error.message);
    process.exit(1);
  });
}