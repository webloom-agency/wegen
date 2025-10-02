# AI Orchestration System

A ground-up rework of the chat orchestration system that intelligently plans and executes multi-step queries using natural language understanding instead of keyword-based logic.

## Overview

The new orchestration system replaces the complex, keyword-based tool selection logic with an intelligent planning system that:

1. **Analyzes queries** using natural language understanding
2. **Plans execution** with multi-step workflows  
3. **Orchestrates tools** (MCP, workflows, app defaults) intelligently
4. **Always ends with LLM summarization** to answer the user

## Architecture

```
Query → QueryAnalyzer → ExecutionPlanner → Orchestrator → Response
         ↓              ↓                   ↓
    Intent/Entities   Execution Plan    Tool Execution
```

### Components

- **QueryAnalyzer**: Understands user intent and extracts entities
- **ExecutionPlanner**: Creates optimal execution plans with dependencies
- **CapabilityRegistry**: Manages and categorizes available tools
- **Orchestrator**: Coordinates the entire execution flow

## Example Scenarios

### 1. Google Ads vs Search Console Comparison
```
Query: "compare les top mots-clés Google Ads vs Search Console (30 jours) pour caats.co"

Plan:
1. Tool: google-ads (get keywords for caats.co, 30 days)
2. Tool: google-search-console (get keywords for caats.co, 30 days)  
3. LLM-analysis: compare the two datasets
4. LLM-summary: present comparison in French
```

### 2. Research + Persona Creation + Image Generation
```
Query: "recherche web sur Nike, définis 4 personae cibles et crée une image seelab pour chaque persona"

Plan:
1. Tool: web-search (research Nike)
2. LLM-analysis: define 4 target personas from research
3. Tool: seelab-text-to-image (create image for persona 1)
4. Tool: seelab-text-to-image (create image for persona 2)
5. Tool: seelab-text-to-image (create image for persona 3)
6. Tool: seelab-text-to-image (create image for persona 4)
7. LLM-summary: present personas with images in French
```

### 3. Data Retrieval + Visualization
```
Query: "top 50 mots-clés Search Console de webloom.fr ce mois-ci en tableau"

Plan:
1. Tool: google-search-console (get top 50 keywords for webloom.fr, current month)
2. Tool: createTable (format data as interactive table)
3. LLM-summary: present table with insights in French
```

## Key Features

### 🧠 Natural Language Understanding
- No keyword matching or mention-based logic
- Understands intent, entities, and complexity
- Supports multiple languages (EN, FR, ES)

### 🔄 Intelligent Planning
- Creates optimal execution sequences
- Handles dependencies between steps
- Adapts to available capabilities

### 🛠️ Universal Tool Support
- **MCP Tools**: External service integrations
- **Workflows**: Custom multi-step processes  
- **App Defaults**: Built-in tools (web search, visualization, etc.)

### 📊 Always Summarizes
- Every execution ends with LLM summarization
- Contextual responses in user's language
- Actionable insights and next steps

## Usage

### Basic Usage
```typescript
import { ChatOrchestrator } from 'lib/ai/orchestration';

const orchestrator = new ChatOrchestrator(chatModel);

const context: OrchestrationContext = {
  userId: 'user-123',
  sessionId: 'session-123', 
  availableCapabilities: [], // Auto-populated
  previousMessages: messages,
  userPreferences: preferences,
  agent: selectedAgent
};

const result = await orchestrator.orchestrate(userQuery, context);
```

### Integration with Chat API
The orchestration system is integrated into the chat API route (`/api/chat`) and automatically:

1. Detects complex queries that need orchestration
2. Falls back to simple LLM responses for basic queries
3. Handles errors gracefully with fallback responses

## Capability Registry

The system automatically discovers and categorizes available tools:

### MCP Tools
- **Google Services**: `google-ads`, `google-search-console`, `google-workspace`
- **Analytics**: `fathom`, `analytics`, `tracking`
- **Social Media**: `twitter`, `facebook`, `linkedin`
- **File Operations**: `drive`, `storage`, `files`

### Workflows  
- **SEO**: `volume-de-recherche`, `seo-analysis`, `competitor-analysis`
- **Reporting**: `reporting`, `audit`, `content-analysis`
- **Custom**: User-defined workflows

### App Defaults
- **Web Search**: `web-search`, `web-content`
- **Visualization**: `createTable`, `createChart`, `createGraph`
- **Code**: `javascript-execution`, `python-execution`
- **Images**: `seelab-text-to-image`

## Performance

- **Fast Planning**: Query analysis and planning typically < 2s
- **Parallel Execution**: Independent steps run concurrently
- **Caching**: Capability registry cached for 30s
- **Fallback**: Graceful degradation to simple LLM responses

## Testing

### Unit Tests
```bash
npm test src/lib/ai/orchestration/orchestrator.test.ts
```

### Integration Tests
```bash
npx tsx src/lib/ai/orchestration/test-integration.ts
```

## Migration from Old System

The new system completely replaces the old mention-based logic:

### Before (1000+ lines)
- Complex mention parsing and filtering
- Keyword-based tool selection
- Manual tool loading and prioritization
- Limited multi-step coordination

### After (Clean Architecture)
- Natural language understanding
- Intelligent capability matching
- Automatic execution planning
- Robust multi-step orchestration

## Configuration

### Environment Variables
- `MCP_MAX_TOTAL_TIMEOUT`: Maximum MCP tool execution time
- `OPENAI_API_KEY`: Required for query analysis and planning

### Model Requirements
- Supports any model compatible with Vercel AI SDK
- Recommended: GPT-4o for best planning quality
- Fallback: Any model for simple responses

## Troubleshooting

### Common Issues

1. **No capabilities found**: Check MCP server connections and workflow permissions
2. **Planning failures**: Verify model configuration and API keys
3. **Tool execution errors**: Check individual tool configurations

### Debug Logging
```typescript
import globalLogger from 'logger';
const logger = globalLogger.withDefaults({ message: 'Orchestration Debug: ' });
```

## Future Enhancements

- **Learning**: Improve planning based on execution success
- **Caching**: Cache execution plans for similar queries
- **Streaming**: Stream intermediate results during execution
- **Metrics**: Track orchestration performance and success rates
