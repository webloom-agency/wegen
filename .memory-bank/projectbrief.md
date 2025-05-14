# MCP Client Chatbot Project Brief

## Project Overview
MCP Client Chatbot is a versatile chat interface that supports multiple AI model providers (OpenAI, Anthropic, Google, Ollama) with a focus on local-first execution. The client leverages the Model Context Protocol (MCP) to seamlessly integrate external tools into chat conversations.

## Key Features
- 100% Local Execution: Runs directly on local PC or server
- Multiple AI Model Support: OpenAI, Anthropic, Google AI, Ollama 
- MCP Integration: Connect external tools via Model Context Protocol
- Standalone Tool Testing: Debug MCP tools separately
- Intuitive Tool Mentions: Trigger tools with @ mentions
- Tool Control Modes: Auto, Manual, None modes for tool execution
- Easy MCP Server Setup: UI or file-based configuration
- Markdown UI: Clean, readable interface
- Local Database: SQLite by default, PostgreSQL supported
- Custom MCP Server Support: Modify built-in or create custom servers
- Built-in Chart Tools: Generate visualizations directly in chat

## Tech Stack
- Frontend: Next.js 15, React 19, TailwindCSS 4
- Database: SQLite (default), PostgreSQL (optional)
- AI Models: OpenAI, Anthropic, Google, Ollama
- Package Manager: pnpm
- MCP Integration: Model Context Protocol
- Testing: Vitest

## Project Status
Initial development phase. Core chatbot functionality and MCP integration working. Ongoing development of features outlined in roadmap.
