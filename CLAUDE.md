# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that enables multi-provider AI collaboration. It integrates with Claude Code to provide access to multiple AI providers (DeepSeek, OpenAI, Anthropic, O3) through various collaboration strategies.

## Essential Commands

### Development
```bash
pnpm install              # Install dependencies
pnpm run build           # Build TypeScript to dist/
pnpm run dev             # Run server in development mode
pnpm test                # Run all tests
pnpm run lint            # Run ESLint
pnpm run format          # Format code with Prettier

# Run specific test suites
pnpm run test:unit       # Unit tests only
pnpm run test:integration # Integration tests
pnpm run test:coverage   # Generate coverage report

# Setup and verification
pnpm run setup:claude-code  # Configure Claude Code integration
pnpm run verify-deepseek    # Test DeepSeek API connection
```

### Docker Operations
```bash
pnpm run docker:build    # Build Docker image
pnpm run docker:dev      # Run with docker-compose (development)
pnpm run docker:prod     # Run with docker-compose (production)
```

## Architecture

The codebase follows dependency injection patterns using InversifyJS:

1. **Core Framework** (`src/core/`): DI container, logging, configuration
2. **Providers** (`src/providers/`): AI provider implementations (DeepSeek, OpenAI, etc.)
3. **Strategies** (`src/strategies/`): Collaboration patterns (parallel, sequential, consensus, iterative)
4. **MCP Server** (`src/server/`): Protocol implementation and tool registration
5. **Services** (`src/services/`): Caching, metrics, search, synthesis

### Key Integration Points

- **Entry Point**: `src/index.ts` - Main server initialization
- **DI Container**: `src/core/container.ts` - All service bindings
- **MCP Tools**: `src/tools/` - Collaborate, review, compare, refine tools
- **Configuration**: `config/default.yaml` + environment-specific overrides

### Testing a Single File
```bash
pnpm test -- path/to/file.test.ts
pnpm test -- --watch path/to/file.test.ts  # Watch mode
```

## Configuration Requirements

1. **Environment Variables** (`.env` file):
   - `DEEPSEEK_API_KEY` - Required for primary AI provider
   - `OPENAI_API_KEY` - Optional for OpenAI integration
   - `ANTHROPIC_API_KEY` - Optional for Anthropic integration

2. **Claude Code Config**: Located at `~/.config/claude-code/claude_desktop_config.json`
   - Must include MCP server configuration pointing to this server

## Development Workflow

1. **Adding a New Provider**:
   - Create provider class in `src/providers/`
   - Implement `IProvider` interface
   - Register in DI container (`src/core/container.ts`)
   - Add configuration in `config/default.yaml`

2. **Adding a New Strategy**:
   - Create strategy class in `src/strategies/`
   - Implement `IStrategy` interface
   - Register in container and strategy factory

3. **Adding a New MCP Tool**:
   - Create tool handler in `src/tools/`
   - Register in `MCPServer.registerTools()` method
   - Add TypeScript types in `src/types/tools.ts`

## Important Patterns

- All services use dependency injection - never instantiate directly
- Configuration is validated using JSON Schema on startup
- Providers implement retry logic and rate limiting internally
- MCP tools return structured JSON responses
- Logging uses Winston with structured format
- Tests use Jest with TypeScript support via ts-jest