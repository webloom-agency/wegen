import type { ToolCapability, OrchestrationContext } from './types';
import { mcpClientsManager } from '../mcp/mcp-manager';
import { workflowRepository } from 'lib/db/repository';
import { APP_DEFAULT_TOOL_KIT } from '../tools/tool-kit';
import { AppDefaultToolkit } from '../tools';

export class CapabilityRegistry {
  private capabilities: Map<string, ToolCapability> = new Map();
  private lastUpdate: number = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  async getAvailableCapabilities(context: OrchestrationContext): Promise<ToolCapability[]> {
    const now = Date.now();
    if (now - this.lastUpdate > this.CACHE_TTL) {
      await this.refreshCapabilities(context);
      this.lastUpdate = now;
    }

    return Array.from(this.capabilities.values());
  }

  private async refreshCapabilities(context: OrchestrationContext): Promise<void> {
    this.capabilities.clear();

    // Load MCP capabilities
    await this.loadMCPCapabilities();

    // Load workflow capabilities
    await this.loadWorkflowCapabilities(context);

    // Load app default capabilities
    this.loadAppDefaultCapabilities();
  }

  private async loadMCPCapabilities(): Promise<void> {
    try {
      const mcpTools = await mcpClientsManager.tools();
      
      for (const [toolId, tool] of Object.entries(mcpTools)) {
        const capability: ToolCapability = {
          id: toolId,
          name: tool._originToolName,
          description: tool.description || 'MCP tool',
          type: 'mcp',
          category: this.categorizeMCPTool(tool._originToolName, tool._mcpServerName),
          serverId: tool._mcpServerId,
          parameters: tool.parameters,
          execute: tool.execute
        };
        
        this.capabilities.set(toolId, capability);
      }
    } catch (error) {
      console.error('Failed to load MCP capabilities:', error);
    }
  }

  private async loadWorkflowCapabilities(context: OrchestrationContext): Promise<void> {
    try {
      const workflows = await workflowRepository.selectExecuteAbility(context.userId);
      
      for (const workflow of workflows) {
        const capability: ToolCapability = {
          id: `workflow-${workflow.id}`,
          name: workflow.name,
          description: workflow.description || 'Custom workflow',
          type: 'workflow',
          category: this.categorizeWorkflow(workflow.name, workflow.description),
          workflowId: workflow.id,
          // Workflow execution will be handled by the orchestrator
        };
        
        this.capabilities.set(capability.id, capability);
      }
    } catch (error) {
      console.error('Failed to load workflow capabilities:', error);
    }
  }

  private loadAppDefaultCapabilities(): void {
    for (const [toolkit, tools] of Object.entries(APP_DEFAULT_TOOL_KIT)) {
      for (const [toolName, tool] of Object.entries(tools)) {
        const capability: ToolCapability = {
          id: `app-${toolName}`,
          name: toolName,
          description: (tool as any).description || 'App default tool',
          type: 'app-default',
          category: this.categorizeAppTool(toolkit as AppDefaultToolkit, toolName),
          execute: (tool as any).execute
        };
        
        this.capabilities.set(capability.id, capability);
      }
    }
  }

  private categorizeMCPTool(toolName: string, serverName: string): string {
    const name = toolName.toLowerCase();
    const server = serverName.toLowerCase();

    // Google services
    if (server.includes('google') || server.includes('gsc') || server.includes('ads')) {
      if (name.includes('ads') || server.includes('ads')) return 'google-ads';
      if (name.includes('console') || server.includes('gsc') || name.includes('search')) return 'google-search-console';
      if (name.includes('drive') || name.includes('workspace')) return 'google-workspace';
      return 'google-services';
    }

    // Analytics and tracking
    if (name.includes('analytics') || name.includes('tracking') || name.includes('fathom')) {
      return 'analytics';
    }

    // Social media
    if (name.includes('twitter') || name.includes('facebook') || name.includes('linkedin')) {
      return 'social-media';
    }

    // File operations
    if (name.includes('file') || name.includes('drive') || name.includes('storage')) {
      return 'file-operations';
    }

    // Default categorization
    return server || 'mcp-tools';
  }

  private categorizeWorkflow(name: string, description?: string): string {
    const text = `${name} ${description || ''}`.toLowerCase();

    if (text.includes('volume') && text.includes('recherche')) return 'volume-de-recherche';
    if (text.includes('seo') || text.includes('keyword')) return 'seo-analysis';
    if (text.includes('competitor') || text.includes('concurrence')) return 'competitor-analysis';
    if (text.includes('report') || text.includes('rapport')) return 'reporting';
    if (text.includes('audit')) return 'audit';
    if (text.includes('content') || text.includes('contenu')) return 'content-analysis';

    return 'custom-workflow';
  }

  private categorizeAppTool(toolkit: AppDefaultToolkit, toolName: string): string {
    switch (toolkit) {
      case AppDefaultToolkit.WebSearch:
        return 'web-search';
      case AppDefaultToolkit.Visualization:
        return 'visualization';
      case AppDefaultToolkit.Code:
        return 'code-execution';
      case AppDefaultToolkit.Http:
        return 'http-requests';
      case AppDefaultToolkit.Image:
        return 'seelab-text-to-image';
      default:
        return 'app-tools';
    }
  }

  getCapabilityById(id: string): ToolCapability | undefined {
    return this.capabilities.get(id);
  }

  getCapabilitiesByCategory(category: string): ToolCapability[] {
    return Array.from(this.capabilities.values()).filter(cap => 
      cap.category === category || cap.category.includes(category)
    );
  }
}
