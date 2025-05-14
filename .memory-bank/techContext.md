# Technical Context

## Tech Stack Details
- **Frontend**: Next.js 15, React 19, TailwindCSS 4
- **Database**: SQLite (default), PostgreSQL (optional)
- **AI Integration**: AI SDK (@ai-sdk/react, @ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/openai)
- **MCP**: Model Context Protocol (@modelcontextprotocol/sdk)
- **Package Manager**: pnpm 10.2.1
- **Testing**: Vitest
- **State Management**: Zustand

## Dependencies
- **UI Components**: Radix UI, shadcn/ui patterns
- **Data Fetching**: SWR
- **Database ORM**: Drizzle
- **Markdown Rendering**: React Markdown
- **Code Editor**: TipTap
- **Charts**: Recharts

## Development Environment
- Node.js 18+ (supports 20, 22)
- TypeScript
- Biome for linting and formatting
- Next.js App Router architecture
- Turbopack for faster development

## Deployment Options
- Local development server
- Docker deployment (in roadmap)
- Vercel deployment (in roadmap)

## Integration Points
- AI model providers (OpenAI, Anthropic, Google AI, Ollama)
- MCP tools (via custom server or external sources)
- Database connections (SQLite or PostgreSQL)
