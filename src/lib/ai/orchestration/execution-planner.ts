import { streamObject } from 'ai';
import { z } from 'zod';
import { customModelProvider } from '../models';
import type { QueryAnalysis, ExecutionPlan, ExecutionStep, ToolCapability, OrchestrationContext } from './types';
import { generateUUID } from 'lib/utils';

const ExecutionStepSchema = z.object({
  type: z.enum(['tool', 'llm-analysis', 'llm-summary']),
  toolId: z.string().optional(),
  description: z.string(),
  inputs: z.record(z.any()).optional(),
  dependencies: z.array(z.string()).optional()
});

const ExecutionPlanSchema = z.object({
  steps: z.array(ExecutionStepSchema),
  estimatedSteps: z.number(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string()
});

export class ExecutionPlanner {
  private model: any;

  constructor(chatModel?: any) {
    this.model = customModelProvider.getModel(chatModel || { provider: 'openai', model: 'gpt-4o' });
  }

  async createPlan(
    query: string, 
    analysis: QueryAnalysis, 
    context: OrchestrationContext
  ): Promise<ExecutionPlan> {
    // Filter available capabilities to only those needed
    const relevantCapabilities = context.availableCapabilities.filter(cap => 
      analysis.requiredCapabilities.some(req => 
        cap.category.includes(req) || cap.name.toLowerCase().includes(req.toLowerCase())
      )
    );

    const capabilityDescriptions = relevantCapabilities.map(cap => 
      `${cap.id}: ${cap.name} (${cap.type}) - ${cap.description}`
    ).join('\n');

    const systemPrompt = `You are an intelligent execution planner for a multi-tool AI assistant. Your job is to create optimal execution plans for user queries.

Available relevant capabilities:
${capabilityDescriptions}

Create an execution plan with these step types:
1. "tool" - Execute a specific tool/capability
2. "llm-analysis" - Perform LLM analysis on data
3. "llm-summary" - Generate final summary/response

Rules:
- Always end with an "llm-summary" step to answer the user
- Use dependencies to ensure proper step ordering
- Keep plans efficient (typically 2-5 steps)
- For complex queries requiring multiple data sources, fetch all data first, then analyze
- Tool steps should have specific toolId from available capabilities
- Include realistic input parameters for tools when possible

Examples:
Query: "compare Google Ads vs Search Console keywords for domain.com"
Plan: 
1. Tool: google-ads (get keywords)
2. Tool: google-search-console (get keywords) 
3. LLM-analysis: compare the datasets
4. LLM-summary: present comparison

Query: "web search Nike and create personas"
Plan:
1. Tool: web-search (research Nike)
2. LLM-analysis: define personas from research
3. Tool: seelab-text-to-image (create images for each persona)
4. LLM-summary: present personas with images`;

    const result = await streamObject({
      model: this.model,
      system: systemPrompt,
      prompt: `Create an execution plan for: "${query}"

Analysis context:
- Intent: ${analysis.intent}
- Required capabilities: ${analysis.requiredCapabilities.join(', ')}
- Complexity: ${analysis.complexity}
- Language: ${analysis.language}`,
      schema: ExecutionPlanSchema,
    });

    const planData = await result.object;

    // Convert to full ExecutionPlan with IDs and status
    const steps: ExecutionStep[] = planData.steps.map((step, index) => ({
      id: generateUUID(),
      type: step.type,
      toolId: step.toolId,
      description: step.description,
      inputs: step.inputs || {},
      dependencies: step.dependencies || (index > 0 ? [generateUUID()] : []), // Simple sequential dependency for now
      status: 'pending' as const
    }));

    // Fix dependencies to use actual step IDs
    steps.forEach((step, index) => {
      if (index > 0 && step.dependencies?.length === 1) {
        step.dependencies = [steps[index - 1].id];
      }
    });

    return {
      id: generateUUID(),
      query,
      steps,
      estimatedSteps: planData.estimatedSteps,
      confidence: planData.confidence,
      reasoning: planData.reasoning
    };
  }

  /**
   * Create a simple sequential plan for straightforward queries
   */
  createSimplePlan(query: string, requiredCapabilities: string[], context: OrchestrationContext): ExecutionPlan {
    const steps: ExecutionStep[] = [];
    
    // Add tool steps for each required capability
    requiredCapabilities.forEach(capName => {
      const capability = context.availableCapabilities.find(cap => 
        cap.category.includes(capName) || cap.name.toLowerCase().includes(capName.toLowerCase())
      );
      
      if (capability) {
        steps.push({
          id: generateUUID(),
          type: 'tool',
          toolId: capability.id,
          description: `Execute ${capability.name}`,
          inputs: {},
          dependencies: steps.length > 0 ? [steps[steps.length - 1].id] : [],
          status: 'pending'
        });
      }
    });

    // Always end with summary
    steps.push({
      id: generateUUID(),
      type: 'llm-summary',
      description: 'Generate final response',
      dependencies: steps.length > 0 ? [steps[steps.length - 1].id] : [],
      status: 'pending'
    });

    return {
      id: generateUUID(),
      query,
      steps,
      estimatedSteps: steps.length,
      confidence: 0.8,
      reasoning: 'Simple sequential plan based on required capabilities'
    };
  }
}
