# Contributing to Claude Code AI Collaboration MCP Server

Thank you for your interest in contributing to the Claude Code AI Collaboration MCP Server! This document provides guidelines and information for contributors.

## 🌟 How to Contribute

### Types of Contributions

We welcome many types of contributions:

- **🐛 Bug Reports**: Help us identify and fix issues
- **✨ Feature Requests**: Suggest new features or enhancements
- **📝 Documentation**: Improve our docs, examples, and guides
- **🔧 Code Contributions**: Submit bug fixes, features, or improvements
- **🧪 Testing**: Add test coverage or improve existing tests
- **📊 Performance**: Optimize code for better performance
- **🎨 UX/DX**: Improve developer and user experience

### Getting Started

1. **Fork the Repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/yourusername/claude-code-ai-collab-mcp.git
   cd claude-code-ai-collab-mcp
   ```

2. **Set Up Development Environment**
   ```bash
   # Install dependencies
   pnpm install
   
   # Build the project
   pnpm run build
   
   # Run tests to ensure everything works
   pnpm test
   ```

3. **Configure Environment**
   ```bash
   # Create .env file with your API keys
   cp .env.example .env
   # Edit .env with your actual API keys
   ```

## 🔧 Development Setup

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **pnpm**: 8.0.0 or higher
- **TypeScript**: 5.3.0 or higher
- **Git**: Latest stable version

### Development Tools

```bash
# Start development server with auto-reload
pnpm run dev

# Run tests in watch mode
pnpm run test:watch

# Lint code
pnpm run lint

# Format code
pnpm run format

# Type checking
pnpm run typecheck
```

### IDE Setup

#### VS Code (Recommended)

Install these extensions:
- TypeScript Importer
- ESLint
- Prettier
- Jest Test Explorer
- GitLens

#### Settings

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 📋 Development Guidelines

### Code Style

We use ESLint and Prettier for consistent code formatting:

```bash
# Auto-fix linting issues
pnpm run lint:fix

# Format all files
pnpm run format
```

### Coding Standards

#### TypeScript

- **Strict Mode**: Always use TypeScript strict mode
- **Type Safety**: Avoid `any` types; use proper interfaces
- **Naming**: Use PascalCase for classes, camelCase for functions/variables
- **Exports**: Use named exports over default exports

```typescript
// ✅ Good
export interface AIProvider {
  name: string;
  execute(request: AIRequest): Promise<AIResponse>;
}

export class DeepSeekProvider implements AIProvider {
  // implementation
}

// ❌ Avoid
export default class Provider {
  execute(request: any): Promise<any> {
    // implementation
  }
}
```

#### File Organization

```
src/
├── core/           # Core framework components
├── providers/      # AI provider implementations
├── strategies/     # Collaboration strategies
├── tools/          # MCP tool implementations
├── services/       # Enterprise services
├── types/          # Type definitions
└── __tests__/      # Test files
```

#### Import Order

1. Node.js built-in modules
2. External dependencies
3. Internal modules (absolute paths)
4. Relative imports

```typescript
// ✅ Good import order
import { promises as fs } from 'fs';
import { injectable, inject } from 'inversify';
import { Logger } from '../core/logger.js';
import { TYPES } from './types.js';
```

### Documentation

#### Code Documentation

- **JSDoc**: Document all public interfaces and complex functions
- **Comments**: Explain "why" not "what"
- **README**: Update README for new features

```typescript
/**
 * Executes a collaboration request using the specified strategy
 * @param strategy - The collaboration strategy to use
 * @param providers - Array of AI providers to collaborate
 * @param request - The AI request to process
 * @returns Promise resolving to collaboration result
 */
async executeCollaboration(
  strategy: string,
  providers: AIProvider[],
  request: AIRequest
): Promise<CollaborationResult> {
  // Implementation
}
```

#### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: type(scope): description

# Examples:
feat(providers): add support for Claude-3.5 model
fix(cache): resolve memory leak in Redis connection
docs(readme): update installation instructions
test(tools): add integration tests for review tool
refactor(core): simplify dependency injection setup
```

### Testing

#### Test Organization

```
tests/
├── unit/           # Unit tests for individual components
├── integration/    # Integration tests for module interactions
├── e2e/           # End-to-end tests for complete workflows
└── fixtures/      # Test data and mock objects
```

#### Writing Tests

- **Coverage**: Aim for 90%+ test coverage
- **Naming**: Descriptive test names explaining the scenario
- **Structure**: Use Arrange-Act-Assert pattern
- **Mocking**: Mock external dependencies appropriately

```typescript
describe('DeepSeekProvider', () => {
  describe('execute', () => {
    it('should return successful response for valid request', async () => {
      // Arrange
      const provider = new DeepSeekProvider(mockConfig);
      const request: AIRequest = {
        prompt: 'Test prompt',
        model: 'deepseek-chat'
      };

      // Act
      const result = await provider.execute(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });
});
```

#### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e

# Run tests with coverage
pnpm run test:coverage

# Run tests in watch mode
pnpm run test:watch
```

## 🚀 Contribution Workflow

### 1. Planning

- **Issues First**: Create or comment on an issue before starting work
- **Discussion**: Discuss approach for significant changes
- **Assignment**: Get assignment confirmation for large features

### 2. Development

```bash
# Create feature branch
git checkout -b feat/your-feature-name

# Make your changes
# ... code, test, document ...

# Commit regularly with good messages
git add .
git commit -m "feat(scope): add feature description"
```

### 3. Testing

```bash
# Ensure all tests pass
pnpm test

# Check test coverage
pnpm run test:coverage

# Verify linting
pnpm run lint

# Test build
pnpm run build
```

### 4. Documentation

- Update README.md if adding features
- Add/update JSDoc comments
- Update configuration schema if needed
- Add examples for new functionality

### 5. Pull Request

```bash
# Push to your fork
git push origin feat/your-feature-name

# Create pull request on GitHub
```

#### Pull Request Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] Tests added for new functionality
- [ ] No breaking changes (or properly documented)
```

## 🔍 Review Process

### Code Review Criteria

- **Functionality**: Does the code work as intended?
- **Testing**: Are there adequate tests?
- **Performance**: Any performance implications?
- **Security**: Any security concerns?
- **Documentation**: Is it properly documented?
- **Style**: Follows project conventions?

### Review Timeline

- **Initial Review**: Within 2-3 business days
- **Follow-up**: Within 1-2 business days
- **Approval**: When all criteria are met

### Addressing Feedback

- **Responsiveness**: Respond to feedback promptly
- **Discussion**: Ask questions if feedback is unclear
- **Implementation**: Make requested changes
- **Re-request**: Request re-review after changes

## 🛠️ Advanced Topics

### Adding New AI Providers

1. **Extend BaseProvider**:
   ```typescript
   export class NewProvider extends BaseProvider {
     // Implement required methods
   }
   ```

2. **Update Configuration Schema**:
   ```json
   {
     "providers": {
       "enum": ["deepseek", "openai", "anthropic", "o3", "new-provider"]
     }
   }
   ```

3. **Add to Container**:
   ```typescript
   container.bind(TYPES.NewProvider).to(NewProvider);
   ```

4. **Write Tests**:
   ```typescript
   describe('NewProvider', () => {
     // Comprehensive test suite
   });
   ```

### Adding New Strategies

1. **Implement Strategy Interface**:
   ```typescript
   export class NewStrategy {
     async execute(config: NewStrategyConfig): Promise<CollaborationResult> {
       // Implementation
     }
   }
   ```

2. **Register in StrategyManager**:
   ```typescript
   this.strategies.set('new-strategy', new NewStrategy());
   ```

3. **Update Types**:
   ```typescript
   export type StrategyType = 'parallel' | 'sequential' | 'consensus' | 'iterative' | 'new-strategy';
   ```

### Performance Optimization

- **Profiling**: Use Node.js profiling tools
- **Caching**: Implement appropriate caching strategies
- **Async**: Use async/await and Promise.all effectively
- **Memory**: Monitor memory usage and prevent leaks

## 🐛 Bug Reports

### Before Reporting

1. **Search Existing Issues**: Check if already reported
2. **Reproduce**: Confirm the bug is reproducible
3. **Environment**: Note your environment details

### Bug Report Template

```markdown
## Bug Description
Clear description of what the bug is.

## To Reproduce
Steps to reproduce the behavior:
1. Configure server with '...'
2. Send request '...'
3. Observe result '...'

## Expected Behavior
Clear description of expected behavior.

## Environment
- OS: [e.g., macOS 13.0]
- Node.js: [e.g., 18.17.0]
- Version: [e.g., 1.0.0]

## Additional Context
Any other context about the problem.
```

## ✨ Feature Requests

### Feature Request Template

```markdown
## Feature Description
Clear description of the feature you'd like.

## Problem Statement
What problem does this solve?

## Proposed Solution
Detailed description of your proposed solution.

## Alternatives
Alternative solutions you've considered.

## Additional Context
Any other context about the feature request.
```

## 📞 Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord**: Real-time chat (invite link in README)
- **Email**: maintainers@claude-code-ai-collab.com

### Response Times

- **Critical Issues**: Within 24 hours
- **Bug Reports**: Within 2-3 business days
- **Feature Requests**: Within 1 week
- **Questions**: Within 2-3 business days

## 🏆 Recognition

### Contributors

All contributors will be:
- Added to the AUTHORS file
- Mentioned in release notes
- Recognized in GitHub contributors

### Maintainers

Outstanding contributors may be invited to become maintainers with:
- Commit access
- Review responsibilities
- Roadmap input

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Claude Code AI Collaboration MCP Server! 🙏**