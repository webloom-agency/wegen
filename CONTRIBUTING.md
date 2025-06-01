# Contributing to MCP Client Chatbot

Thank you for your interest in contributing to MCP Client Chatbot! We welcome contributions from the community and appreciate your efforts to make this project better.

---

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

4. **Make your changes** following the existing code style and structure.

5. **Test your changes** thoroughly:

   ```bash
   pnpm dev
   pnpm test
   # Run manual tests and add automated tests if applicable
   ```

---

## Releasing and Versioning

We use [Release Please](https://github.com/googleapis/release-please) to manage GitHub releases.

### Conventional Commit Message Required

Your pull request title and commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format.

**Examples:**

* `fix: resolve voice chat audio initialization issue`
* `feat: support multi-language UI toggle`
* `chore: update dependencies`

This helps automate changelog generation and version bumps.

### Important Notes:

* All PRs should have a **descriptive title** in the correct format
* **No manual tagging or changelog editing** is needed — this is handled automatically on merge
* We recommend using **squash merge** to keep the git history clean and changelog predictable

---

## Submitting a Pull Request

1. **Format your code**:

   ```bash
   pnpm lint:fix
   ```

2. **Commit your changes** with a proper conventional commit message:

   ```bash
   git add .
   git commit -m "fix: resolve voice chat audio initialization issue"
   ```

3. **Push to your fork**:

   ```bash
   git push origin your-branch-name
   ```

4. **Create a Pull Request**:

   * **Title**: Must follow Conventional Commits
   * **Description**: Describe what you changed and why
   * **Link to related issues**, if any
   * **Include screenshots/demos** for UI changes

---

## Thank You

We truly appreciate your contribution to MCP Client Chatbot! Let's build a powerful, lightweight AI experience together. 🚀
