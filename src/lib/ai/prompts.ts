import { MCPToolInfo } from "app-types/mcp";
import { Session } from "next-auth";
import { UserPreferences } from "app-types/user";
import { Project } from "app-types/chat";

export const CREATE_THREAD_TITLE_PROMPT = `\n
      - you will generate a short title based on the first message a user begins a conversation with
      - ensure it is not more than 80 characters long
      - the title should be a summary of the user's message
      - do not use quotes or colons`;

export const buildUserSystemPrompt = (
  session?: Session,
  userPreferences?: UserPreferences,
) => {
  let prompt = `
# User Information

- system time: ${new Date().toLocaleString()}
${session?.user?.name ? `- User Name: ${session?.user?.name}` : ""}
${session?.user?.email ? `- User Email: ${session?.user?.email}` : ""}
`;
  if (userPreferences?.profession) {
    prompt += `
- This user works as a ${userPreferences.profession}. When providing explanations:
  * Use relevant domain terminology they would be familiar with
  * Consider practical applications in their professional context
  * Acknowledge their professional perspective when appropriate
`;
  }

  if (userPreferences?.displayName) {
    prompt += `
- When addressing this user:
  * Maintain a ${userPreferences.displayName} communication style
  * This affects your tone, level of detail, and conversational approach
`;
  }

  if (userPreferences?.responseStyleExample) {
    prompt += `
- Pattern your responses after this style example:
  "${userPreferences.responseStyleExample}"
  * This example reflects the user's preferred explanation style
  * Use similar phrasing, complexity level, and approach to explanations
`;
  } else {
    prompt += `
- You are a friendly assistant! Keep your responses concise and helpful.
`;
  }

  return prompt.trim();
};

export const buildProjectInstructionsSystemPrompt = (
  instructions?: Project["instructions"] | null,
) => {
  if (!instructions) return undefined;
  return `
# Project Instructions

${instructions.systemPrompt}
`.trim();
};

export const SUMMARIZE_PROMPT = `\n
You are an expert AI assistant specialized in summarizing and extracting project requirements. 
Read the following chat history and generate a concise, professional system instruction for a new AI assistant continuing this project. 
This system message should clearly describe the project's context, goals, and any decisions or requirements discussed, in a way that guides future conversation. 
Focus on actionable directives and critical details only, omitting any irrelevant dialogue or filler. 
Ensure the tone is formal and precise. Base your summary strictly on the chat content provided, without adding new information.

(Paste the chat transcript below.)
`.trim();

export const generateExampleToolSchemaPrompt = (options: {
  toolInfo: MCPToolInfo;
  prompt?: string;
}) => `\n
You are given a tool with the following details:
- Tool Name: ${options.toolInfo.name}
- Tool Description: ${options.toolInfo.description}

${
  options.prompt ||
  `
Step 1: Create a realistic example question or scenario that a user might ask to use this tool.
Step 2: Based on that question, generate a valid JSON input object that matches the input schema of the tool.
`.trim()
}
`;
