import { createFileBasedMCPConfigsStorage } from "lib/ai/mcp/fb-mcp-config-storage";
import { createDbBasedMCPConfigsStorage } from "lib/ai/mcp/db-mcp-config-storage";
import {
  createMCPClientsManager,
  type MCPClientsManager,
} from "lib/ai/mcp/create-mcp-clients-manager";

// Check if we're on Vercel
const isVercel = Boolean(process.env.VERCEL);
declare global {
  // eslint-disable-next-line no-var
  var __mcpClientsManager__: MCPClientsManager;
}

if (!globalThis.__mcpClientsManager__) {
  // Choose the appropriate storage implementation based on environment
  const storage =
    isVercel || process.env.DOCKER === "1"
      ? createDbBasedMCPConfigsStorage()
      : createFileBasedMCPConfigsStorage();

  globalThis.__mcpClientsManager__ = createMCPClientsManager(storage);
}

export const initMCPManager = async () => {
  return globalThis.__mcpClientsManager__.init();
};

export const mcpClientsManager = globalThis.__mcpClientsManager__;
