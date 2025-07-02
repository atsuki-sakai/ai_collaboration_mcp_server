# 🚀 Quick Start Guide

Get up and running with Claude Code AI Collaboration MCP Server in under 5 minutes!

## 📋 Prerequisites

- Node.js 18+ installed
- Claude Code (desktop app) installed
- DeepSeek API key

## ⚡ One-Command Setup

```bash
# Clone and setup in one go
git clone https://github.com/claude-code-ai-collab/mcp-server.git
cd mcp-server
./scripts/setup-claude-code.sh --api-key "your-deepseek-api-key"
```

## 🔧 Step-by-Step Setup

### 1. Get Your API Key

1. Visit [DeepSeek Platform](https://platform.deepseek.com/)
2. Sign up/login and create an API key
3. Copy your API key (starts with `sk-`)

### 2. Install and Setup

```bash
# 1. Clone the repository
git clone https://github.com/claude-code-ai-collab/mcp-server.git
cd mcp-server

# 2. Install dependencies
pnpm install

# 3. Build the project
pnpm run build

# 4. Setup Claude Code integration
./scripts/setup-claude-code.sh --api-key "sk-your-deepseek-api-key"
```

### 3. Restart Claude Code

1. **Completely quit** Claude Code (Cmd+Q on macOS)
2. **Restart** Claude Code
3. Wait for it to fully load

### 4. Test the Integration

Open a new conversation in Claude Code and try:

```
What tools are available to me?
```

You should see:
- 🤝 **collaborate** - Multi-provider AI collaboration
- 📝 **review** - Content analysis and quality assessment
- ⚖️ **compare** - Side-by-side comparison
- ✨ **refine** - Iterative content improvement

### 5. First Test

Try this command:

```
Use the collaborate tool to explain what quantum computing is in simple terms
```

## 🎯 Quick Examples

### Code Review
```
Use the review tool to analyze this JavaScript function:

function calculateTotal(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        total += items[i].price;
    }
    return total;
}
```

### Compare Solutions
```
Use the compare tool to compare these three sorting algorithms:
1. Bubble Sort
2. Quick Sort  
3. Merge Sort

Compare them based on time complexity, space complexity, and ease of implementation.
```

### Collaborate on Code
```
Use the collaborate tool with DeepSeek to help me write a Python function that finds the longest palindrome in a string.
```

### Refine Content
```
Use the refine tool to improve this technical explanation:

"APIs are like waiters in restaurants. They take your order and bring you food."

Make it more detailed and accurate for a technical audience.
```

## 🔍 Troubleshooting

### Tools Not Showing Up?

1. **Check config file exists:**
   ```bash
   # macOS/Linux
   ls ~/.config/claude-code/claude_desktop_config.json
   
   # Windows
   dir "%APPDATA%\Claude\claude_desktop_config.json"
   ```

2. **Verify server works:**
   ```bash
   cd /path/to/your/project
   DEEPSEEK_API_KEY="your-key" node dist/index.js --help
   ```

3. **Check logs:**
   ```bash
   tail -f logs/application-$(date +%Y-%m-%d).log
   ```

### Server Won't Start?

1. **Check Node.js version:**
   ```bash
   node --version  # Should be 18+
   ```

2. **Rebuild the project:**
   ```bash
   pnpm install
   pnpm run build
   ```

3. **Test API key:**
   ```bash
   pnpm run verify-deepseek
   ```

### Common Issues

**"Cannot find module" error:**
- Make sure you used the full absolute path in config
- Check that `dist/index.js` exists after building

**"API key invalid" error:**
- Verify your DeepSeek API key is correct
- Check you have sufficient credits/quota

**Tools timeout:**
- Check your internet connection
- Verify DeepSeek API is accessible
- Try increasing timeout in config

## 💡 Tips for Best Results

1. **Be specific** - "Use collaborate to explain X with examples"
2. **Use context** - Include relevant code/text in your requests
3. **Try different tools** - Each tool has different strengths
4. **Iterate** - Use refine tool to improve results

## 🆘 Need Help?

- **Documentation**: Check the full [README.md](README.md)
- **Issues**: [GitHub Issues](https://github.com/claude-code-ai-collab/mcp-server/issues)
- **Configuration**: Review [CONTRIBUTING.md](CONTRIBUTING.md)

## 🎉 Success!

You now have a powerful AI collaboration system integrated with Claude Code! 

The four MCP tools give you access to DeepSeek's capabilities directly within Claude Code, enabling advanced AI collaboration for coding, analysis, and content creation.

---

**Enjoy collaborating with AI! 🤖✨**