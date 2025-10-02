import { streamObject } from 'ai';
import { z } from 'zod';
import { customModelProvider } from '../models';
import type { QueryAnalysis, OrchestrationContext } from './types';

const QueryAnalysisSchema = z.object({
  intent: z.string().describe('The main intent or goal of the user query'),
  entities: z.array(z.object({
    type: z.enum(['domain', 'timeframe', 'metric', 'action', 'format']),
    value: z.string(),
    confidence: z.number().min(0).max(1)
  })).describe('Extracted entities from the query'),
  requiredCapabilities: z.array(z.string()).describe('Required capability categories like google-ads, google-search-console, web-search, visualization, etc.'),
  complexity: z.enum(['simple', 'medium', 'complex']).describe('Complexity level of the query'),
  language: z.enum(['en', 'fr', 'es', 'auto']).describe('Detected language of the query')
});

export class QueryAnalyzer {
  private model: any;

  constructor(chatModel?: any) {
    this.model = customModelProvider.getModel(chatModel || { provider: 'openai', model: 'gpt-4o' });
  }

  async analyze(query: string, context: OrchestrationContext): Promise<QueryAnalysis> {
    const availableCapabilities = context.availableCapabilities.map(cap => 
      `${cap.category}: ${cap.name} - ${cap.description}`
    ).join('\n');

    const systemPrompt = `You are an intelligent query analyzer for a multi-tool AI assistant. Your job is to analyze user queries and determine what capabilities and steps are needed to fulfill them.

Available capabilities:
${availableCapabilities}

Analyze the user query and extract:
1. The main intent/goal
2. Key entities (domains, timeframes, metrics, actions, formats)
3. Required capabilities from the available list
4. Complexity level
5. Language

Examples:
- "compare les top mots-clés Google Ads vs Search Console (30 jours) pour caats.co" 
  → needs google-ads, google-search-console capabilities, complex query
- "recherche web sur Nike, définis 4 personae cibles et crée une image seelab pour chaque persona"
  → needs web-search, seelab-text-to-image capabilities, complex query
- "top 50 mots-clés Search Console de webloom.fr ce mois-ci en tableau"
  → needs google-search-console, visualization capabilities, medium query

Be precise and only include capabilities that are actually needed.`;

    const result = await streamObject({
      model: this.model,
      system: systemPrompt,
      prompt: `Analyze this query: "${query}"`,
      schema: QueryAnalysisSchema,
    });

    const analysis = await result.object;
    
    return {
      intent: analysis.intent,
      entities: analysis.entities,
      requiredCapabilities: analysis.requiredCapabilities,
      complexity: analysis.complexity,
      language: analysis.language
    };
  }

  /**
   * Quick capability matching for simple queries
   */
  quickMatch(query: string, availableCapabilities: string[]): string[] {
    const queryLower = query.toLowerCase();
    const matches: string[] = [];

    // Google Services
    if (queryLower.includes('google ads') || queryLower.includes('ads')) {
      matches.push('google-ads');
    }
    if (queryLower.includes('search console') || queryLower.includes('gsc')) {
      matches.push('google-search-console');
    }
    if (queryLower.includes('google drive') || queryLower.includes('drive')) {
      matches.push('google-workspace');
    }

    // Web search
    if (queryLower.includes('recherche web') || queryLower.includes('web search') || queryLower.includes('search')) {
      matches.push('web-search');
    }

    // Visualization
    if (queryLower.includes('tableau') || queryLower.includes('table') || queryLower.includes('graphique') || queryLower.includes('chart')) {
      matches.push('visualization');
    }

    // Image generation
    if (queryLower.includes('image') || queryLower.includes('seelab')) {
      matches.push('seelab-text-to-image');
    }

    return matches.filter(match => availableCapabilities.includes(match));
  }
}
