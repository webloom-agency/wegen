# System Patterns

## Architecture
- Next.js App Router architecture
- Component-based UI with React
- TailwindCSS for styling
- Drizzle ORM for database operations
- AI provider abstraction via AI SDK
- MCP protocol for tool integration

## Data Flow
1. User inputs message via chat interface
2. Message routed to selected AI provider via AI SDK
3. Model generates response, potentially using MCP tools
4. Response rendered in chat interface
5. Conversation stored in database

## Key Components
- Chat interface (components/chat-bot)
- Model provider selection
- MCP tool integration layer
- Database schema for conversations/threads
- Standalone tool testing environment

## Design Patterns
- Provider abstraction for AI models
- Component composition for UI elements
- React Server Components for performance
- Client components for interactivity
- Streaming responses for better UX
