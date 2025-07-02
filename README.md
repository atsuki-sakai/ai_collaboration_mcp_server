# Claude Code AI Collaboration MCP Server

A powerful Model Context Protocol (MCP) server that enables AI collaboration through multiple providers with advanced strategies and comprehensive tooling.

[![Build Status](https://github.com/claude-code-ai-collab/mcp-server/workflows/CI/badge.svg)](https://github.com/claude-code-ai-collab/mcp-server/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

## 🌟 Features

### 🤖 Multi-Provider AI Integration
- **DeepSeek**: Primary provider with optimized performance
- **OpenAI**: GPT models integration
- **Anthropic**: Claude models support
- **O3**: Next-generation model support

### 🚀 Advanced Collaboration Strategies
- **Parallel**: Execute requests across multiple providers simultaneously
- **Sequential**: Chain provider responses for iterative improvement
- **Consensus**: Build agreement through multiple provider opinions
- **Iterative**: Refine responses through multiple rounds

### 🛠️ Comprehensive MCP Tools
- **collaborate**: Multi-provider collaboration with strategy selection
- **review**: Content analysis and quality assessment
- **compare**: Side-by-side comparison of multiple items
- **refine**: Iterative content improvement

### 📊 Enterprise Features
- **Caching**: Memory and Redis-compatible caching system
- **Metrics**: OpenTelemetry-compatible performance monitoring
- **Search**: Full-text search with inverted indexing
- **Synthesis**: Intelligent response aggregation

## 🚀 Quick Start

> **📖 New to MCP?** Check out our [Quick Start Guide](docs/QUICKSTART.md) for a 5-minute setup!

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm 8.0.0 or higher
- TypeScript 5.3.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/claude-code-ai-collab/mcp-server.git
cd mcp-server

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run tests
pnpm test
```

### Configuration

1. **Environment Variables**:
   ```bash
   # Required: Set your API keys
   export DEEPSEEK_API_KEY="your-deepseek-api-key"
   export OPENAI_API_KEY="your-openai-api-key"
   export ANTHROPIC_API_KEY="your-anthropic-api-key"
   
   # Optional: Configure other settings
   export MCP_DEFAULT_PROVIDER="deepseek"
   export MCP_PROTOCOL="stdio"
   ```

2. **Configuration Files**:
   - `config/default.yaml`: Default configuration
   - `config/development.yaml`: Development settings
   - `config/production.yaml`: Production settings

### Running the Server

```bash
# Start with default settings
pnpm start

# Start with specific protocol
node dist/index.js --protocol stdio

# Start with custom providers
node dist/index.js --providers deepseek,openai --default-provider deepseek

# Enable debug mode
NODE_ENV=development LOG_LEVEL=debug pnpm start
```

## 🔗 Claude Code Integration

### Connecting to Claude Code

To use this MCP server with Claude Code, you need to configure Claude Code to recognize and connect to your server.

#### 1. Automated Setup (Recommended)

Use the automated setup script for easy configuration:

```bash
# Navigate to your project directory
cd /Users/atsukisakai/Desktop/ThinkHub

# Run automated setup with your DeepSeek API key
./scripts/setup-claude-code.sh --api-key "sk-4fdsfsadfsafsafdsfsda4ert345345fdsgdsg"

# Or with multiple providers
./scripts/setup-claude-code.sh \
  --api-key "your-deepseek-key" \
  --openai-key "your-openai-key" \
  --anthropic-key "your-anthropic-key"

# Alternative using pnpm
pnpm run setup:claude-code -- --api-key "your-deepseek-key"
```

The setup script will:
- ✅ Build the MCP server
- ✅ Create Claude Code configuration file
- ✅ Test the server connection
- ✅ Provide next steps

#### 1b. Manual Setup

If you prefer manual setup:

```bash
# Navigate to your project directory
cd /Users/atsukisakai/Desktop/ThinkHub

# Install dependencies and build
pnpm install
pnpm run build

# Set your DeepSeek API key
export DEEPSEEK_API_KEY="your-deepseek-api-key"

# Create Claude Code configuration file
"

# Test the server
pnpm run verify-deepseek
```

#### 2. Configure Claude Code

Create or update the Claude Code configuration file:

**macOS/Linux:**
```bash
# Create config directory if it doesn't exist
mkdir -p ~/.config/claude-code

# Create configuration file
cat > ~/.config/claude-code/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "claude-ai-collab": {
      "command": "node",
      "args": ["/path/to/your/project/dist/index.js"],
      "env": {
        "DEEPSEEK_API_KEY": "your-deepseek-api-key",
        "NODE_ENV": "production",
        "MCP_PROTOCOL": "stdio",
        "MCP_DEFAULT_PROVIDER": "deepseek"
      }
    }
  }
}
EOF
```

**Windows:**
```cmd
# Create config directory
mkdir "%APPDATA%\Claude"

# Create configuration file (use your preferred text editor)
# File: %APPDATA%\Claude\claude_desktop_config.json
```

#### 3. Configuration Options

```json
{
  "mcpServers": {
    "claude-ai-collab": {
      "command": "node",
      "args": [
        "/absolute/path/to/your/project/dist/index.js",
        "--default-provider", "deepseek",
        "--providers", "deepseek,openai"
      ],
      "env": {
        "DEEPSEEK_API_KEY": "your-deepseek-api-key",
        "OPENAI_API_KEY": "your-openai-api-key",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key",
        "NODE_ENV": "production",
        "LOG_LEVEL": "info",
        "MCP_DISABLE_CACHING": "false",
        "MCP_DISABLE_METRICS": "false"
      }
    }
  }
}
```

#### 4. Available Tools in Claude Code

After restarting Claude Code, you'll have access to these powerful tools:

- **🤝 collaborate** - Multi-provider AI collaboration
- **📝 review** - Content analysis and quality assessment  
- **⚖️ compare** - Side-by-side comparison of multiple items
- **✨ refine** - Iterative content improvement

#### 5. Usage Examples in Claude Code

```
# Use DeepSeek for code explanation
Please use the collaborate tool to explain this Python code with DeepSeek

# Review code quality
Use the review tool to analyze the quality of this code

# Compare multiple solutions
Use the compare tool to compare these 3 approaches to solving this problem

# Improve code iteratively
Use the refine tool to make this function more efficient
```

#### 6. Troubleshooting

**Check MCP server connectivity:**
```bash
# Test if the server starts correctly
DEEPSEEK_API_KEY="your-key" node dist/index.js --help
```

**View logs:**
```bash
# Check application logs
tail -f logs/application-$(date +%Y-%m-%d).log
```

**Verify Claude Code configuration:**
1. Restart Claude Code completely
2. In a new conversation, ask "What tools are available?"
3. You should see the four MCP tools listed
4. Test with a simple command like "Use collaborate to say hello"

#### 7. Configuration File Locations

- **macOS**: `~/.config/claude-code/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
- **Linux**: `~/.config/claude-code/claude_desktop_config.json`

## 📖 Usage

### MCP Tools

#### Collaborate Tool
Execute multi-provider collaboration with strategy selection:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "collaborate",
    "arguments": {
      "prompt": "Explain quantum computing in simple terms",
      "strategy": "consensus",
      "providers": ["deepseek", "openai"],
      "config": {
        "timeout": 30000,
        "consensus_threshold": 0.7
      }
    }
  }
}
```

#### Review Tool
Analyze content quality and provide detailed feedback:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "review",
    "arguments": {
      "content": "Your content here...",
      "criteria": ["accuracy", "clarity", "completeness"],
      "review_type": "comprehensive"
    }
  }
}
```

#### Compare Tool
Compare multiple items with detailed analysis:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "compare",
    "arguments": {
      "items": [
        {"id": "1", "content": "Option A"},
        {"id": "2", "content": "Option B"}
      ],
      "comparison_dimensions": ["quality", "relevance", "innovation"]
    }
  }
}
```

#### Refine Tool
Iteratively improve content quality:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "refine",
    "arguments": {
      "content": "Content to improve...",
      "refinement_goals": {
        "primary_goal": "clarity",
        "target_audience": "general public"
      }
    }
  }
}
```

### Available Resources

- **collaboration_history**: Access past collaboration results
- **provider_stats**: Monitor provider performance metrics
- **tool_usage**: Track tool utilization statistics

## 🏗️ Architecture

### Core Components

```
src/
├── core/                    # Core framework components
│   ├── types.ts            # Dependency injection symbols
│   ├── logger.ts           # Structured logging
│   ├── config.ts           # Configuration management
│   ├── container.ts        # DI container setup
│   ├── provider-manager.ts # AI provider orchestration
│   ├── strategy-manager.ts # Execution strategy management
│   └── tool-manager.ts     # MCP tool management
├── providers/              # AI provider implementations
│   ├── base-provider.ts    # Common provider functionality
│   ├── deepseek-provider.ts
│   ├── openai-provider.ts
│   ├── anthropic-provider.ts
│   └── o3-provider.ts
├── strategies/             # Collaboration strategies
│   ├── parallel-strategy.ts
│   ├── sequential-strategy.ts
│   ├── consensus-strategy.ts
│   └── iterative-strategy.ts
├── tools/                  # MCP tool implementations
│   ├── collaborate-tool.ts
│   ├── review-tool.ts
│   ├── compare-tool.ts
│   └── refine-tool.ts
├── services/               # Enterprise services
│   ├── cache-service.ts
│   ├── metrics-service.ts
│   ├── search-service.ts
│   └── synthesis-service.ts
├── server/                 # MCP server implementation
│   └── mcp-server.ts
└── types/                  # Type definitions
    ├── common.ts
    ├── interfaces.ts
    └── index.ts
```

### Design Principles

- **Dependency Injection**: Clean architecture with InversifyJS
- **Strategy Pattern**: Pluggable collaboration strategies
- **Provider Abstraction**: Unified interface for different AI services
- **Performance**: Efficient caching and rate limiting
- **Observability**: Comprehensive metrics and logging
- **Extensibility**: Easy to add new providers and strategies

## 🔧 Configuration

### Configuration Schema

The server uses YAML configuration files with JSON Schema validation. See `config/schema.json` for the complete schema.

### Key Configuration Sections

- **Server**: Basic server settings (name, version, protocol)
- **Providers**: AI provider configurations and credentials
- **Strategies**: Strategy-specific settings and timeouts
- **Cache**: Caching behavior (memory, Redis, file)
- **Metrics**: Performance monitoring settings
- **Logging**: Log levels and output configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEEPSEEK_API_KEY` | DeepSeek API key | Required |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |
| `MCP_PROTOCOL` | Transport protocol | `stdio` |
| `MCP_DEFAULT_PROVIDER` | Default AI provider | `deepseek` |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging level | `info` |

## 📊 Monitoring & Metrics

### Built-in Metrics

- **Request Metrics**: Response times, success rates, error counts
- **Provider Metrics**: Individual provider performance
- **Tool Metrics**: Usage statistics per MCP tool
- **Cache Metrics**: Hit rates, memory usage
- **System Metrics**: CPU, memory, and resource utilization

### OpenTelemetry Integration

The server supports OpenTelemetry for distributed tracing and metrics collection:

```yaml
metrics:
  enabled: true
  export:
    enabled: true
    format: "opentelemetry"
    endpoint: "http://localhost:4317"
```

## 🧪 Testing

### Test Coverage

- **Unit Tests**: 95+ individual component tests
- **Integration Tests**: End-to-end MCP protocol testing
- **E2E Tests**: Complete workflow validation
- **API Tests**: Direct provider API validation

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm run test:coverage

# Run specific test suites
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e

# Verify API connectivity
pnpm run verify-deepseek
```

## 🚢 Deployment

### Docker

```dockerfile
# Build image
docker build -t claude-code-ai-collab-mcp .

# Run container
docker run -d \
  -e DEEPSEEK_API_KEY=your-key \
  -p 3000:3000 \
  claude-code-ai-collab-mcp
```

### Production Considerations

- **Load Balancing**: Multiple server instances for high availability
- **Caching**: Redis for distributed caching
- **Monitoring**: Prometheus/Grafana for metrics visualization
- **Security**: API key rotation and rate limiting
- **Backup**: Regular configuration and data backups

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/yourusername/claude-code-ai-collab-mcp.git
cd claude-code-ai-collab-mcp

# Install dependencies
pnpm install

# Start development
pnpm run dev

# Run tests
pnpm test

# Lint and format
pnpm run lint
pnpm run lint:fix
```

## 📋 Roadmap

### Version 1.1
- [ ] GraphQL API support
- [ ] WebSocket transport protocol
- [ ] Advanced caching strategies
- [ ] Custom strategy plugins

### Version 1.2
- [ ] Multi-tenant support
- [ ] Enhanced security features
- [ ] Performance optimizations
- [ ] Additional AI providers

### Version 2.0
- [ ] Distributed architecture
- [ ] Advanced workflow orchestration
- [ ] Machine learning optimization
- [ ] Enterprise SSO integration

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/claude-code-ai-collab/mcp-server/wiki)
- **Issues**: [GitHub Issues](https://github.com/claude-code-ai-collab/mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/claude-code-ai-collab/mcp-server/discussions)
- **Email**: support@claude-code-ai-collab.com

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the foundational protocol
- [InversifyJS](https://inversify.io/) for dependency injection
- [TypeScript](https://www.typescriptlang.org/) for type safety
- All AI provider APIs for enabling collaboration

---

**Built with ❤️ by the Claude Code AI Collaboration Team**# think_hub
