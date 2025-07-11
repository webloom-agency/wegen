import { JSONSchema7 } from "json-schema";
import { tool as createTool } from "ai";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";

export const jsExecutionSchema: JSONSchema7 = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description:
        "JavaScript code to execute. Use console.log() to output results and console.error() for errors. Can include calculations, data processing, API calls, and logic operations. Avoid DOM manipulation, file system access, or server-side operations. IMPORTANT: Use proper line breaks (\\n) between statements for better code readability and formatting.",
    },
    input: {
      type: "object",
      description:
        "Input data passed as variables to your code. Each property becomes a variable you can use directly. Example: {name: 'Alice', age: 25} makes 'name' and 'age' variables available in your code.",
      properties: {},
      additionalProperties: true,
      default: {},
    },
    timeout: {
      type: "number",
      description:
        "Execution timeout in milliseconds to prevent infinite loops",
      default: 5000,
      minimum: 100,
      maximum: 30000,
    },
  },
  required: ["code"],
};

export const jsExecutionTool = createTool({
  description: `Execute JavaScript code for data calculations and processing only.

IMPORTANT: This is NOT for building apps, UI components, or websites. Use only for:
- Mathematical calculations
- Data processing and analysis  
- Simple computations
- Testing simple functions (vanilla JS only, no external modules)

LIMITATIONS: Browser Web Worker environment - no import/require, no DOM, no React/frameworks.
Use console.log(),console.error() to output results.

CODE FORMATTING: Always use proper line breaks (\\n) between statements for better readability. Format your code clearly with appropriate spacing.

USAGE: When using this tool, you don't need to show the full code to the user beforehand. Just use the tool directly - the code will be visible in the tool execution.

Example: Calculate sum of numbers
{
  input: {numbers: [1,2,3]},
  code: "const sum = numbers.reduce((a, b) => a + b, 0);\nconsole.log('Total:', sum);"
}`,
  parameters: jsonSchemaToZod(jsExecutionSchema),
});
