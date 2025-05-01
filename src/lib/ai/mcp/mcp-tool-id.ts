export const createMCPToolId = (serverName: string, toolName: string) => {
  return `${serverName}_${toolName}`;
};

export const extractMCPToolId = (toolId: string) => {
  const [serverName, ...toolName] = toolId.split("_");
  return { serverName, toolName: toolName.join("_") };
};
