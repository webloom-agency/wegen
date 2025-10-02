export interface ToolCapability {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'workflow' | 'app-default';
  category: string;
  serverId?: string; // for MCP tools
  workflowId?: string; // for workflows
  parameters?: any;
  execute?: (args: any, ctx?: any) => Promise<any> | PromiseLike<any>;
}

export interface ExecutionStep {
  id: string;
  type: 'tool' | 'llm-analysis' | 'llm-summary';
  toolId?: string;
  description: string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  dependencies?: string[]; // IDs of steps that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  query: string;
  steps: ExecutionStep[];
  estimatedSteps: number;
  confidence: number; // 0-1 score of how confident we are in this plan
  reasoning: string;
}

export interface QueryAnalysis {
  intent: string;
  entities: Array<{
    type: 'domain' | 'timeframe' | 'metric' | 'action' | 'format';
    value: string;
    confidence: number;
  }>;
  requiredCapabilities: string[]; // capability categories needed
  complexity: 'simple' | 'medium' | 'complex';
  language: 'en' | 'fr' | 'es' | 'auto';
}

export interface OrchestrationContext {
  userId: string;
  sessionId: string;
  availableCapabilities: ToolCapability[];
  previousMessages: any[];
  userPreferences?: any;
  agent?: any;
}

export interface OrchestrationResult {
  plan: ExecutionPlan;
  executedSteps: ExecutionStep[];
  finalResponse: string;
  usedCapabilities: string[];
  executionTimeMs: number;
}
