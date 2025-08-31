import { Node } from "@xyflow/react";
import { ChatModel } from "app-types/chat";
import { ObjectJsonSchema7, TipTapMentionJsonContent } from "app-types/util";
import { ConditionBranches } from "./condition";
import { JSONSchema7 } from "json-schema";

/**
 * Enum defining all available node types in the workflow system.
 * When adding a new node type:
 * 1. Add the new kind here
 * 2. Create corresponding NodeData type below
 * 3. Implement executor in node-executor.ts
 * 4. Add validation in node-validate.ts
 * 5. Create UI config component in components/workflow/node-config/
 */
export enum NodeKind {
  Input = "input", // Entry point of workflow - receives initial data
  LLM = "llm", // Large Language Model interaction node
  Condition = "condition", // Conditional branching node
  Note = "note", // Documentation/annotation node
  Tool = "tool", // MCP tool execution node
  Http = "http", // HTTP request node
  Template = "template", // Template processing node
  Code = "code", // Code execution node (future implementation)
  Output = "output", // Exit point of workflow - produces final result
  LoopStart = "loopStart", // Begin a foreach loop over a collection
  LoopEnd = "loopEnd", // End/aggregate a foreach loop
}

/**
 * Base interface for all workflow node data.
 * Every node must have these common properties.
 */
export type BaseWorkflowNodeDataData<
  T extends {
    kind: NodeKind;
  },
> = {
  id: string;
  name: string; // unique name within workflow
  description?: string;
  /**
   * Defines the output schema of this node.
   * Other nodes can reference fields from this schema as their inputs.
   * This enables data flow between connected nodes.
   */
  outputSchema: ObjectJsonSchema7;
} & T;

/**
 * Reference to a field from another node's output.
 * Used to create data dependencies between nodes.
 */
export type OutputSchemaSourceKey = {
  nodeId: string;
  path: string[];
};

/**
 * MCP (Model Context Protocol) tool definition.
 * Currently only supports MCP tools, but extensible for other tool types.
 */
type MCPTool = {
  type: "mcp-tool";
  serverId: string;
  serverName: string;
};

type DefaultTool = {
  type: "app-tool";
};

/**
 * Workflow tool key that defines available tools for Tool nodes.
 */
export type WorkflowToolKey = {
  id: string; // tool Name
  description: string;
  parameterSchema?: JSONSchema7; // Input schema for the tool
  returnSchema?: JSONSchema7; // Output schema for the tool
} & (MCPTool | DefaultTool);

// Node Data Types - Each node kind has its specific data structure

/**
 * Input node: Entry point of the workflow
 * Receives initial data and passes it to connected nodes
 */
export type InputNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Input;
}>;

/**
 * Output node: Exit point of the workflow
 * Collects data from previous nodes and produces final result
 */
export type OutputNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Output;
  outputData: {
    key: string;
    source?: OutputSchemaSourceKey;
  }[];
}>;

/**
 * Note node: For documentation and annotations
 * Does not affect workflow execution, used for documentation purposes
 */
export type NoteNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Note;
}>;

/**
 * Tool node: Executes external tools (primarily MCP tools)
 * Can optionally use LLM to generate tool parameters from a message
 */
export type ToolNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Tool;
  tool?: WorkflowToolKey;
  model?: ChatModel;
  message?: TipTapMentionJsonContent;
}>;

/**
 * LLM node: Interacts with Large Language Models
 * Supports multiple messages and can reference outputs from previous nodes
 */
export type LLMNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.LLM;
  model?: ChatModel;
  messages: {
    role: "system" | "assistant" | "user";
    content?: TipTapMentionJsonContent;
  }[];
}>;

/**
 * Condition node: Provides conditional branching in workflows
 * Evaluates conditions and routes execution to different paths
 */
export type ConditionNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Condition;
  branches: ConditionBranches; // if-elseIf-else structure for conditional logic
}>;

/**
 * HTTP request method type
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

/**
 * Simple value type that can be a literal string or reference to another node's output
 */
export type HttpValue = string | OutputSchemaSourceKey;

/**
 * HTTP node: Performs HTTP requests to external services
 * Supports all standard HTTP methods with configurable parameters
 */
export type HttpNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Http;
  url: HttpValue;
  method: HttpMethod;
  headers?: { key: string; value: HttpValue }[];
  query?: { key: string; value: HttpValue }[];
  body?: HttpValue;
  timeout?: number;
}>;

/**
 * Template node: Processes text templates with variable substitution
 * Supports different template engines for flexible content generation
 */
export type TemplateNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Template;
  template?: TipTapMentionJsonContent;
}>;

/**
 * Code node: Executes custom code in a sandboxed environment
 * Currently supports Python 3 via Pyodide on the server
 */
export type CodeNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.Code;
  language: "python" | "javascript";
  /**
   * Source code to execute
   */
  code: string;
  /**
   * Optional JSON parameters with mentions to previous node outputs.
   * At runtime, mentions are resolved to concrete values and provided to the code as `params`.
   */
  params?: TipTapMentionJsonContent;
  /**
   * Max execution time in ms (default 30000)
   */
  timeout?: number;
  /**
   * If true and possible, convert the returned result to CSV (comma-separated)
   */
  exportCsv?: boolean;
}>;

// Loop nodes
export type LoopStartNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.LoopStart;
  source?: OutputSchemaSourceKey; // array source to iterate
  endNodeId?: string; // optional paired end node
  variableName?: string; // item variable name (documentation only for now)
  concurrency?: number; // future use
}>;

export type LoopEndNodeData = BaseWorkflowNodeDataData<{
  kind: NodeKind.LoopEnd;
  startNodeId?: string; // paired start node
  collect?: OutputSchemaSourceKey; // what to collect for each iteration
}>;

/**
 * Union type of all possible node data types.
 * When adding a new node type, include it in this union.
 */
export type WorkflowNodeData =
  | InputNodeData
  | OutputNodeData
  | LLMNodeData
  | NoteNodeData
  | ToolNodeData
  | ConditionNodeData
  | HttpNodeData
  | TemplateNodeData
  | CodeNodeData
  | LoopStartNodeData
  | LoopEndNodeData;

/**
 * Runtime fields added during workflow execution
 */
export type NodeRuntimeField = {
  executionTimeMs?: number;
};

/**
 * UI representation of a workflow node with runtime information
 */
export type UINode<T extends WorkflowNodeData = any> = Node<{
  id: string;
  kind: NodeKind;
  name: string;
  description?: string;
  outputSchema: ObjectJsonSchema7;
} & Omit<T, "id" | "name" | "description" | "outputSchema">> & { data: T & { runtime?: { executionTimeMs?: number } } };

/**
 * Runtime history record for node execution tracking
 * Used for debugging and monitoring workflow execution
 */
export type NodeRuntimeHistory = {
  id: string;
  nodeId: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  kind: NodeKind;
  error?: string;
  status: "fail" | "running" | "success";
  result?: {
    input?: any; // Input data passed to the node
    output?: any; // Output data produced by the node
  };
};
