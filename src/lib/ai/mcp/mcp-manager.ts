import { createDbBasedMCPConfigsStorage } from "./db-mcp-config-storage";
import { createFileBasedMCPConfigsStorage } from "./fb-mcp-config-storage";
import {
  createMCPClientsManager,
  type MCPClientsManager,
} from "./create-mcp-clients-manager";

declare global {
  // eslint-disable-next-line no-var
  var __mcpClientsManager__: MCPClientsManager;
}

if (!globalThis.__mcpClientsManager__) {
  // Choose the appropriate storage implementation based on environment
  const storage =
    process.env.FILE_BASED_MCP_CONFIG === "true"
      ? createFileBasedMCPConfigsStorage()
      : createDbBasedMCPConfigsStorage();
  globalThis.__mcpClientsManager__ = createMCPClientsManager(storage);
}

export const initMCPManager = async () => {
  return globalThis.__mcpClientsManager__.init();
};

export const mcpClientsManager = globalThis.__mcpClientsManager__;
