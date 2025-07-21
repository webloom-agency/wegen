import type {
  MCPServerConfig,
  McpServerInsert,
  McpServerSelect,
  VercelAIMcpTool,
} from "app-types/mcp";
import { createMCPClient, type MCPClient } from "./create-mcp-client";
import { Locker } from "lib/utils";
import { safe } from "ts-safe";
import { McpServerSchema } from "lib/db/pg/schema.pg";
import { createMCPToolId } from "./mcp-tool-id";
import logger from "logger";
/**
 * Interface for storage of MCP server configurations.
 * Implementations should handle persistent storage of server configs.
 *
 * IMPORTANT: When implementing this interface, be aware that:
 * - Storage can be modified externally (e.g., file edited manually)
 * - Concurrent modifications may occur from multiple processes
 * - Implementations should either handle these scenarios or document limitations
 */
export interface MCPConfigStorage {
  init(manager: MCPClientsManager): Promise<void>;
  loadAll(): Promise<McpServerSelect[]>;
  save(server: McpServerInsert): Promise<McpServerSelect>;
  delete(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
  get(id: string): Promise<McpServerSelect | null>;
}

export class MCPClientsManager {
  protected clients = new Map<
    string,
    {
      client: MCPClient;
      name: string;
    }
  >();
  private initializedLock = new Locker();
  private initialized = false;

  // Optional storage for persistent configurations
  constructor(
    private storage?: MCPConfigStorage,
    private autoDisconnectSeconds: number = 60 * 30, // 30 minutes
  ) {
    process.on("SIGINT", this.cleanup.bind(this));
    process.on("SIGTERM", this.cleanup.bind(this));
  }

  async init() {
    logger.info("Initializing MCP clients manager");
    if (this.initializedLock.isLocked) return this.initializedLock.wait();
    return safe(() => this.initializedLock.lock())
      .ifOk(() => this.cleanup())
      .ifOk(async () => {
        if (this.storage) {
          await this.storage.init(this);
          const configs = await this.storage.loadAll();
          await Promise.allSettled(
            configs.map(({ id, name, config }) =>
              this.addClient(id, name, config),
            ),
          );
        }
      })
      .watch(() => {
        this.initializedLock.unlock();
        this.initialized = true;
      })
      .unwrap();
  }

  /**
   * Returns all tools from all clients as a flat object
   */
  async tools(): Promise<Record<string, VercelAIMcpTool>> {
    if (!this.initialized) {
      logger.info("tools: not initialized, initializing");
      await this.init();
    } else await this.initializedLock.wait();

    return Object.fromEntries(
      Array.from(this.clients.entries())
        .filter(([_, { client }]) => client.getInfo().toolInfo.length > 0)
        .flatMap(([id, { client }]) =>
          Object.entries(client.tools).map(([name, tool]) => [
            createMCPToolId(client.getInfo().name, name),
            {
              ...tool,
              _originToolName: name,
              __$ref__: "mcp",
              _mcpServerName: client.getInfo().name,
              _mcpServerId: id,
            },
          ]),
        ),
    );
  }
  /**
   * Creates and adds a new client instance to memory only (no storage persistence)
   */
  async addClient(id: string, name: string, serverConfig: MCPServerConfig) {
    if (this.clients.has(id)) {
      const prevClient = this.clients.get(id)!;
      void prevClient.client.disconnect();
    }
    const client = createMCPClient(name, serverConfig, {
      autoDisconnectSeconds: this.autoDisconnectSeconds,
    });
    this.clients.set(id, { client, name });
    return client.connect();
  }

  /**
   * Persists a new client configuration to storage and adds the client instance to memory
   */
  async persistClient(server: typeof McpServerSchema.$inferInsert) {
    let id = server.name;
    if (this.storage) {
      const entity = await this.storage.save(server);
      id = entity.id;
    }
    return this.addClient(id, server.name, server.config);
  }

  /**
   * Removes a client by name, disposing resources and removing from storage
   */
  async removeClient(id: string) {
    if (this.storage) {
      if (await this.storage.has(id)) {
        await this.storage.delete(id);
      }
    }
    const client = this.clients.get(id);
    this.clients.delete(id);
    if (client) {
      void client.client.disconnect();
    }
  }

  /**
   * Refreshes an existing client with a new configuration or its existing config
   */
  async refreshClient(id: string) {
    const prevClient = this.clients.get(id);
    if (!prevClient) {
      throw new Error(`Client ${id} not found`);
    }
    const currentConfig = prevClient.client.getInfo().config;
    if (this.storage) {
      const server = await this.storage.get(id);
      if (!server) {
        throw new Error(`Client ${id} not found`);
      }
      return this.addClient(id, server.name, server.config);
    }
    return this.addClient(id, prevClient.name, currentConfig);
  }

  cleanup() {
    const clients = Array.from(this.clients.values());
    this.clients.clear();
    void Promise.allSettled(clients.map(({ client }) => client.disconnect()));
  }

  async getClients() {
    await this.initializedLock.wait();
    return Array.from(this.clients.entries()).map(([id, { client }]) => ({
      id,
      client: client,
    }));
  }
  async getClient(id: string) {
    await this.initializedLock.wait();
    const client = this.clients.get(id);
    if (!client && !this.initialized) {
      await this.init();
    }
    return this.clients.get(id);
  }
}

export function createMCPClientsManager(
  storage?: MCPConfigStorage,
  autoDisconnectSeconds: number = 60 * 30, // 30 minutes
): MCPClientsManager {
  return new MCPClientsManager(storage, autoDisconnectSeconds);
}
