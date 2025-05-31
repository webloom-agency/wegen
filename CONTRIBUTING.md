# Contributing to MCP Client Chatbot

Thank you for your interest in contributing to MCP Client Chatbot! We welcome contributions from the community and appreciate your efforts to make this project better.


## Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-client-chatbot.git
   cd mcp-client-chatbot
   ```

3. **Create a new branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

4. **Make your changes** following the existing code style and patterns

5. **Test your changes** thoroughly:
   ```bash
   pnpm dev
   pnpm test
   # Test the functionality manually and write test code if necessary.
   ```

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and releases. When you make changes, you need to add a changeset.

### Adding a Changeset

Run the following command in the project root:

```bash
pnpm changeset:add
```

This will prompt you to:

1. **Select version bump type**:
   - **Patch** (0.0.1): Bug fixes, small improvements
   - **Minor** (0.1.0): New features, backward-compatible changes
   - **Major** (1.0.0): Breaking changes (use sparingly)

2. **Write a summary**: **Same as your PR title**

**Important**: The changeset summary and pull request title **must be identical**.

**Guidelines for version selection:**
- **Use Patch** for most contributions (bug fixes, documentation, small improvements)
- **Use Minor** only for significant new features
- **Avoid Major** unless specifically requested by maintainers

### Example Changeset Summary
```
fix: resolve voice chat audio initialization issue
```

## Submitting a Pull Request

1. **Add a changeset** (see above)

2. **Format your code**:
   ```bash
   pnpm lint:fix
   ```

3. **Commit your changes**:
   ```bash
   git add .
   git commit -m "fix: resolve voice chat audio initialization issue"
   ```

4. **Push to your fork**:
   ```bash
   git push origin your-branch-name
   ```

5. **Create a Pull Request**:
   - **Title**: **Exactly the same** as your changeset summary (e.g., `fix: resolve voice chat audio initialization issue`)
   - **Detailed description**: Explain what you changed and why
   - **Link to related issues** (if applicable)
   - **Screenshots or demos** (if relevant)

**Title format examples:**
- `fix: description` - Bug fixes
- `feat: description` - New features
- `refactor: description` - Code refactoring
- `chore: description` - Other tasks (documentation, configuration, etc.)


Thank you for contributing to MCP Client Chatbot! 🚀
