#!/bin/bash

# Claude Code MCP Setup Script
# Automatically configures Claude Code to use the Claude AI Collaboration MCP Server

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="claude-code-ai-collab-mcp"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [options]

Options:
  --api-key <key>     DeepSeek API key (required)
  --openai-key <key>  OpenAI API key (optional)
  --anthropic-key <key> Anthropic API key (optional)
  --config-only       Only create config file, don't build project
  --help              Show this help message

Examples:
  $0 --api-key sk-your-deepseek-key
  $0 --api-key sk-deepseek-key --openai-key sk-openai-key
  $0 --config-only --api-key sk-your-key

Environment Variables:
  DEEPSEEK_API_KEY    - DeepSeek API key
  OPENAI_API_KEY      - OpenAI API key (optional)
  ANTHROPIC_API_KEY   - Anthropic API key (optional)
EOF
}

# Parse command line arguments
parse_args() {
    DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
    OPENAI_API_KEY="${OPENAI_API_KEY:-}"
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
    CONFIG_ONLY=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --api-key)
                DEEPSEEK_API_KEY="$2"
                shift 2
                ;;
            --openai-key)
                OPENAI_API_KEY="$2"
                shift 2
                ;;
            --anthropic-key)
                ANTHROPIC_API_KEY="$2"
                shift 2
                ;;
            --config-only)
                CONFIG_ONLY=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    if [[ -z "$DEEPSEEK_API_KEY" ]]; then
        log_error "DeepSeek API key is required"
        show_usage
        exit 1
    fi
}

# Detect operating system
detect_os() {
    case "$(uname -s)" in
        Darwin)
            OS="macos"
            CONFIG_DIR="$HOME/.config/claude-code"
            ;;
        Linux)
            OS="linux"
            CONFIG_DIR="$HOME/.config/claude-code"
            ;;
        CYGWIN*|MINGW32*|MSYS*|MINGW*)
            OS="windows"
            CONFIG_DIR="$APPDATA/Claude"
            ;;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
    
    log_info "Detected OS: $OS"
    log_info "Config directory: $CONFIG_DIR"
}

# Build the MCP server
build_server() {
    if [[ "$CONFIG_ONLY" == "true" ]]; then
        log_info "Skipping build (config-only mode)"
        return
    fi

    log_info "Building MCP server..."
    
    cd "$PROJECT_ROOT"
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    # Check if pnpm is installed
    if ! command -v pnpm &> /dev/null; then
        log_warning "pnpm not found. Installing pnpm..."
        npm install -g pnpm
    fi
    
    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile
    
    # Build project
    log_info "Building project..."
    pnpm run build
    
    # Test the server
    log_info "Testing server..."
    if DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" node dist/index.js --help > /dev/null; then
        log_success "Server built and tested successfully"
    else
        log_error "Server test failed"
        exit 1
    fi
}

# Create Claude Code configuration
create_config() {
    log_info "Creating Claude Code configuration..."
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Generate configuration file
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    
    # Build environment variables object
    ENV_VARS=$(cat << EOF
        "DEEPSEEK_API_KEY": "$DEEPSEEK_API_KEY",
        "NODE_ENV": "production",
        "MCP_PROTOCOL": "stdio",
        "MCP_DEFAULT_PROVIDER": "deepseek",
        "LOG_LEVEL": "info"
EOF
    )
    
    # Add optional API keys
    if [[ -n "$OPENAI_API_KEY" ]]; then
        ENV_VARS+=",\n        \"OPENAI_API_KEY\": \"$OPENAI_API_KEY\""
    fi
    
    if [[ -n "$ANTHROPIC_API_KEY" ]]; then
        ENV_VARS+=",\n        \"ANTHROPIC_API_KEY\": \"$ANTHROPIC_API_KEY\""
    fi
    
    # Create the configuration file
    cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "$PROJECT_NAME": {
      "command": "node",
      "args": ["$PROJECT_ROOT/dist/index.js"],
      "env": {
$ENV_VARS
      }
    }
  }
}
EOF
    
    log_success "Configuration file created: $CONFIG_FILE"
}

# Verify configuration
verify_config() {
    log_info "Verifying configuration..."
    
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "Configuration file not found: $CONFIG_FILE"
        exit 1
    fi
    
    # Validate JSON syntax
    if command -v python3 &> /dev/null; then
        if python3 -m json.tool "$CONFIG_FILE" > /dev/null 2>&1; then
            log_success "Configuration file is valid JSON"
        else
            log_error "Configuration file contains invalid JSON"
            exit 1
        fi
    elif command -v node &> /dev/null; then
        if node -e "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8'))" > /dev/null 2>&1; then
            log_success "Configuration file is valid JSON"
        else
            log_error "Configuration file contains invalid JSON"
            exit 1
        fi
    fi
    
    # Test MCP server startup
    if [[ "$CONFIG_ONLY" != "true" ]]; then
        log_info "Testing MCP server startup..."
        if timeout 10s bash -c "cd '$PROJECT_ROOT' && DEEPSEEK_API_KEY='$DEEPSEEK_API_KEY' node dist/index.js --help" > /dev/null 2>&1; then
            log_success "MCP server starts successfully"
        else
            log_warning "MCP server test timed out or failed (this may be normal)"
        fi
    fi
}

# Show next steps
show_next_steps() {
    log_success "Setup completed successfully!"
    echo
    echo "📋 Next Steps:"
    echo "1. Restart Claude Code completely"
    echo "2. Open a new conversation in Claude Code"
    echo "3. Ask: 'What tools are available?'"
    echo "4. You should see these MCP tools:"
    echo "   - 🤝 collaborate - Multi-provider AI collaboration"
    echo "   - 📝 review - Content analysis and quality assessment"
    echo "   - ⚖️ compare - Side-by-side comparison of multiple items"
    echo "   - ✨ refine - Iterative content improvement"
    echo
    echo "🧪 Test Commands:"
    echo "   'Use the collaborate tool to explain what MCP is'"
    echo "   'Use the review tool to analyze this code: console.log(\"hello\")'"
    echo
    echo "📁 Configuration file: $CONFIG_DIR/claude_desktop_config.json"
    echo "📝 Logs: $PROJECT_ROOT/logs/"
    echo
    echo "🔧 Troubleshooting:"
    echo "   - Check logs: tail -f '$PROJECT_ROOT/logs/application-\$(date +%Y-%m-%d).log'"
    echo "   - Test server: DEEPSEEK_API_KEY='$DEEPSEEK_API_KEY' node '$PROJECT_ROOT/dist/index.js' --help"
    echo "   - Verify config: cat '$CONFIG_DIR/claude_desktop_config.json'"
}

# Main execution
main() {
    log_info "Starting Claude Code MCP setup..."
    
    parse_args "$@"
    detect_os
    build_server
    create_config
    verify_config
    show_next_steps
    
    log_success "Claude Code MCP setup completed! 🎉"
}

# Run main function
main "$@"