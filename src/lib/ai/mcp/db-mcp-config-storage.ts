import type { MCPServerConfig } from "app-types/mcp";
import type {
  MCPClientsManager,
  MCPConfigStorage,
} from "./create-mcp-clients-manager";
import { mcpRepository } from "lib/db/repository";
import logger from "logger";
import { createDebounce } from "lib/utils";

export function createDbBasedMCPConfigsStorage(): MCPConfigStorage {
  const debounce = createDebounce();
  let manager: MCPClientsManager;

  // Function to refresh clients when configs change
  const refreshClients = async () => {
    try {
      const servers = await mcpRepository.selectAllServers();

      // Get all current clients
      const currentClients = new Set(
        manager.getClients().map((c) => c.getInfo().name),
      );

      // Process new or updated clients
      for (const server of servers) {
        if (server.enabled) {
          if (currentClients.has(server.name)) {
            // Refresh existing client with potential config updates
            await manager.refreshClient(server.name, server.config);
          } else {
            // Add new client
            await manager.addClient(server.name, server.config);
          }
          currentClients.delete(server.name);
        }
      }

      // Remove clients that no longer exist in database or are disabled
      for (const clientName of currentClients) {
        await manager.removeClient(clientName);
      }
    } catch (error) {
      logger.error("Failed to refresh MCP clients from database:", error);
    }
  };

  return {
    async init(_manager: MCPClientsManager): Promise<void> {
      manager = _manager;

      // Initial load of configs
      await refreshClients();

      // Set up polling for changes in database environment
      // This is needed since we can't directly watch database changes
      // A 30 second interval is reasonable for most use cases
      setInterval(() => {
        debounce(refreshClients, 1000);
      }, 30000);
    },

    async loadAll(): Promise<Record<string, MCPServerConfig>> {
      try {
        const servers = await mcpRepository.selectAllServers();
        return Object.fromEntries(
          servers
            .filter((server) => server.enabled)
            .map((server) => [server.name, server.config]),
        );
      } catch (error) {
        logger.error("Failed to load MCP configs from database:", error);
        return {};
      }
    },

    async save(name: string, config: MCPServerConfig): Promise<void> {
      try {
        const existingServer = await mcpRepository.selectServerByName(name);

        if (existingServer) {
          await mcpRepository.updateServer(existingServer.id, { config });
        } else {
          await mcpRepository.insertServer({ name, config });
        }

        // Trigger a refresh to apply changes
        debounce(refreshClients, 1000);
      } catch (error) {
        logger.error(`Failed to save MCP config "${name}" to database:`, error);
        throw error;
      }
    },

    async delete(name: string): Promise<void> {
      try {
        const server = await mcpRepository.selectServerByName(name);
        if (server) {
          await mcpRepository.deleteServer(server.id);
        }

        // Trigger a refresh to apply changes
        debounce(refreshClients, 1000);
      } catch (error) {
        logger.error(
          `Failed to delete MCP config "${name}" from database:`,
          error,
        );
        throw error;
      }
    },

    async has(name: string): Promise<boolean> {
      try {
        // Note: If you want to use `existsServerWithName` directly,
        // this logic might need a slight adjustment depending on whether
        // `existsServerWithName` also considers the `enabled` flag.
        // For now, keeping the existing logic which checks `enabled`.
        const server = await mcpRepository.selectServerByName(name);
        return !!server && server.enabled;
      } catch (error) {
        logger.error(
          `Failed to check if MCP config "${name}" exists in database:`,
          error,
        );
        return false;
      }
    },
  };
}
