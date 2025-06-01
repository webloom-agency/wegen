import type { MCPServerConfig } from "app-types/mcp";
import type {
  MCPClientsManager,
  MCPConfigStorage,
} from "./create-mcp-clients-manager";
import { mcpRepository } from "lib/db/repository";
import defaultLogger from "logger";
import { createDebounce } from "lib/utils";
import equal from "fast-deep-equal";
import { colorize } from "consola/utils";

const logger = defaultLogger.withDefaults({
  message: colorize("gray", `MCP Config Storage: `),
});

export function createDbBasedMCPConfigsStorage(): MCPConfigStorage {
  let manager: MCPClientsManager;

  const debounce = createDebounce();

  // Initializes the manager with configs from the database
  async function init(_manager: MCPClientsManager): Promise<void> {
    manager = _manager;
  }

  async function checkAndRefreshClients() {
    try {
      logger.debug("Checking MCP clients Diff");
      const servers = await mcpRepository.selectAllServers();
      const dbConfigs = servers
        .map((server) => ({
          name: server.name,
          config: server.config,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const managerConfigs = await manager
        .getClients()
        .then((clients) =>
          clients.map((client) => {
            const info = client.getInfo();
            return {
              name: info.name,
              config: info.config,
            };
          }),
        )
        .then((configs) =>
          configs.sort((a, b) => a.name.localeCompare(b.name)),
        );

      let shouldRefresh = false;
      if (dbConfigs.length !== managerConfigs.length) {
        shouldRefresh = true;
      } else if (!equal(dbConfigs, managerConfigs)) {
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        const refreshPromises = dbConfigs.map(async ({ name, config }) => {
          const managerConfig = await manager
            .getClients()
            .then((clients) => clients.find((c) => c.getInfo().name === name))
            .then((c) => c?.getInfo());
          if (!managerConfig) {
            logger.debug(`Adding MCP client ${name}`);
            return manager.addClient(name, config);
          }
          if (!equal(managerConfig.config, config)) {
            logger.debug(`Refreshing MCP client ${name}`);
            return manager.refreshClient(name, config);
          }
        });
        const deletePromises = managerConfigs
          .filter((c) => {
            const dbConfig = dbConfigs.find((c2) => c2.name === c.name);
            return !dbConfig;
          })
          .map((c) => {
            logger.debug(`Removing MCP client ${c.name}`);
            return manager.removeClient(c.name);
          });
        await Promise.allSettled([...refreshPromises, ...deletePromises]);
      }
    } catch (error) {
      logger.error("Failed to check and refresh clients:", error);
    }
  }

  setInterval(() => debounce(checkAndRefreshClients, 5000), 60000).unref();

  return {
    init,
    async loadAll(): Promise<Record<string, MCPServerConfig>> {
      try {
        const servers = await mcpRepository.selectAllServers();
        return Object.fromEntries(
          servers.map((server) => [server.name, server.config]),
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
      } catch (error) {
        logger.error(
          `Failed to delete MCP config "${name}" from database:",`,
          error,
        );
        throw error;
      }
    },
    async has(name: string): Promise<boolean> {
      try {
        const server = await mcpRepository.selectServerByName(name);
        return !!server;
      } catch (error) {
        logger.error(
          `Failed to check MCP config "${name}" in database:`,
          error,
        );
        return false;
      }
    },
  };
}
