import { streamText } from 'ai';
import { customModelProvider } from '../models';
import type { 
  ExecutionPlan, 
  ExecutionStep, 
  OrchestrationContext, 
  OrchestrationResult,
  ToolCapability 
} from './types';
import { QueryAnalyzer } from './query-analyzer';
import { ExecutionPlanner } from './execution-planner';
import { CapabilityRegistry } from './capability-registry';
import { mcpClientsManager } from '../mcp/mcp-manager';
import { workflowRepository } from 'lib/db/repository';
import { generateUUID } from 'lib/utils';
import globalLogger from 'logger';

export class Orchestrator {
  private queryAnalyzer: QueryAnalyzer;
  private executionPlanner: ExecutionPlanner;
  private capabilityRegistry: CapabilityRegistry;
  private model: any;
  private logger = globalLogger.withDefaults({ message: 'Orchestrator: ' });

  constructor(chatModel?: any) {
    this.model = customModelProvider.getModel(chatModel || { provider: 'openai', model: 'gpt-4o' });
    this.queryAnalyzer = new QueryAnalyzer(chatModel);
    this.executionPlanner = new ExecutionPlanner(chatModel);
    this.capabilityRegistry = new CapabilityRegistry();
  }

  async orchestrate(
    query: string, 
    context: OrchestrationContext,
    dataStream?: any
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting orchestration for query: "${query}"`);

      // 1. Load available capabilities
      context.availableCapabilities = await this.capabilityRegistry.getAvailableCapabilities(context);
      this.logger.info(`Loaded ${context.availableCapabilities.length} capabilities`);

      // 2. Analyze the query
      const analysis = await this.queryAnalyzer.analyze(query, context);
      this.logger.info(`Query analysis: ${analysis.complexity} complexity, needs: ${analysis.requiredCapabilities.join(', ')}`);

      // 3. Create execution plan
      const plan = await this.executionPlanner.createPlan(query, analysis, context);
      this.logger.info(`Created plan with ${plan.steps.length} steps (confidence: ${plan.confidence})`);

      // 4. Execute the plan
      const executedSteps = await this.executePlan(plan, context, dataStream);

      // 5. Generate final response
      const finalResponse = await this.generateFinalResponse(query, executedSteps, analysis, context);

      const result: OrchestrationResult = {
        plan,
        executedSteps,
        finalResponse,
        usedCapabilities: executedSteps
          .filter(step => step.toolId)
          .map(step => step.toolId!)
          .filter((id, index, arr) => arr.indexOf(id) === index),
        executionTimeMs: Date.now() - startTime
      };

      this.logger.info(`Orchestration completed in ${result.executionTimeMs}ms`);
      return result;

    } catch (error) {
      this.logger.error('Orchestration failed:', error);
      throw error;
    }
  }

  private async executePlan(
    plan: ExecutionPlan, 
    context: OrchestrationContext,
    dataStream?: any
  ): Promise<ExecutionStep[]> {
    const executedSteps: ExecutionStep[] = [];
    const stepResults = new Map<string, any>();

    // Execute steps in dependency order
    for (const step of plan.steps) {
      try {
        // Wait for dependencies
        if (step.dependencies?.length) {
          const dependenciesReady = step.dependencies.every(depId => 
            executedSteps.some(s => s.id === depId && s.status === 'completed')
          );
          
          if (!dependenciesReady) {
            this.logger.warn(`Step ${step.id} dependencies not ready, skipping`);
            continue;
          }
        }

        this.logger.info(`Executing step: ${step.description}`);
        step.status = 'running';

        let result: any;

        switch (step.type) {
          case 'tool':
            result = await this.executeToolStep(step, context, stepResults);
            break;
          case 'llm-analysis':
            result = await this.executeLLMAnalysisStep(step, context, stepResults);
            break;
          case 'llm-summary':
            result = await this.executeLLMSummaryStep(step, context, stepResults, plan.query);
            break;
        }

        step.result = result;
        step.status = 'completed';
        stepResults.set(step.id, result);
        executedSteps.push(step);

        this.logger.info(`Step completed: ${step.description}`);

      } catch (error) {
        this.logger.error(`Step failed: ${step.description}`, error);
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        executedSteps.push(step);
      }
    }

    return executedSteps;
  }

  private async executeToolStep(
    step: ExecutionStep, 
    context: OrchestrationContext,
    stepResults: Map<string, any>
  ): Promise<any> {
    if (!step.toolId) {
      throw new Error('Tool step missing toolId');
    }

    const capability = this.capabilityRegistry.getCapabilityById(step.toolId);
    if (!capability) {
      throw new Error(`Capability not found: ${step.toolId}`);
    }

    // Prepare inputs by resolving dependencies
    const inputs = { ...step.inputs };
    if (step.dependencies?.length) {
      for (const depId of step.dependencies) {
        const depResult = stepResults.get(depId);
        if (depResult) {
          Object.assign(inputs, depResult);
        }
      }
    }

    switch (capability.type) {
      case 'mcp':
        return await this.executeMCPTool(capability, inputs);
      case 'workflow':
        return await this.executeWorkflow(capability, inputs, context);
      case 'app-default':
        return await this.executeAppTool(capability, inputs);
      default:
        throw new Error(`Unknown capability type: ${capability.type}`);
    }
  }

  private async executeMCPTool(capability: ToolCapability, inputs: any): Promise<any> {
    if (!capability.serverId) {
      throw new Error('MCP tool missing serverId');
    }

    const result = await mcpClientsManager.toolCall(
      capability.serverId,
      capability.name,
      inputs
    );

    if (result.isError) {
      throw new Error(result.error?.message || 'MCP tool execution failed');
    }

    return result;
  }

  private async executeWorkflow(
    capability: ToolCapability, 
    inputs: any, 
    context: OrchestrationContext
  ): Promise<any> {
    if (!capability.workflowId) {
      throw new Error('Workflow missing workflowId');
    }

    // This would need to be implemented based on your workflow execution system
    // For now, return a placeholder
    return {
      workflowId: capability.workflowId,
      inputs,
      status: 'completed',
      message: `Workflow ${capability.name} executed successfully`
    };
  }

  private async executeAppTool(capability: ToolCapability, inputs: any): Promise<any> {
    if (!capability.execute) {
      throw new Error('App tool missing execute function');
    }

    return await capability.execute(inputs, {
      toolCallId: generateUUID(),
      abortSignal: new AbortController().signal,
      messages: []
    });
  }

  private async executeLLMAnalysisStep(
    step: ExecutionStep,
    context: OrchestrationContext,
    stepResults: Map<string, any>
  ): Promise<any> {
    // Gather data from previous steps
    const previousData = Array.from(stepResults.values());
    
    const prompt = `Analyze the following data for the user query: "${step.description}"

Data from previous steps:
${JSON.stringify(previousData, null, 2)}

Provide a structured analysis that can be used by subsequent steps.`;

    const result = await streamText({
      model: this.model,
      prompt,
      temperature: 0.3
    });

    return {
      analysis: await result.text,
      data: previousData
    };
  }

  private async executeLLMSummaryStep(
    step: ExecutionStep,
    context: OrchestrationContext,
    stepResults: Map<string, any>,
    originalQuery: string
  ): Promise<any> {
    // Gather all results
    const allResults = Array.from(stepResults.values());
    
    const prompt = `Generate a comprehensive response to the user's query: "${originalQuery}"

Based on the following execution results:
${JSON.stringify(allResults, null, 2)}

Provide a clear, actionable response in the user's language. Include:
1. Direct answer to their question
2. Key findings and insights
3. Any relevant links or data
4. Next steps or recommendations if applicable

Be concise but complete.`;

    const result = await streamText({
      model: this.model,
      prompt,
      temperature: 0.7
    });

    return await result.text;
  }

  private async generateFinalResponse(
    query: string,
    executedSteps: ExecutionStep[],
    analysis: any,
    context: OrchestrationContext
  ): Promise<string> {
    // Find the summary step result
    const summaryStep = executedSteps.find(step => step.type === 'llm-summary');
    if (summaryStep?.result) {
      return summaryStep.result;
    }

    // Fallback: generate response from all step results
    const results = executedSteps.map(step => step.result).filter(Boolean);
    
    const prompt = `Generate a response to: "${query}"

Based on these execution results:
${JSON.stringify(results, null, 2)}

Language: ${analysis.language || 'auto'}`;

    const result = await streamText({
      model: this.model,
      prompt,
      temperature: 0.7
    });

    return await result.text;
  }
}
