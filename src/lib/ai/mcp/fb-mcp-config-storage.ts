import type { MCPServerConfig } from "app-types/mcp";
import type {
  MCPClientsManager,
  MCPConfigStorage,
} from "./create-mcp-clients-manager";
import { dirname } from "path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import chokidar, { type FSWatcher } from "chokidar";
import equal from "fast-deep-equal";
import { createDebounce } from "lib/utils";
import logger from "logger";
import { MCP_CONFIG_PATH } from "lib/ai/mcp/config-path";

export function createFileBasedMCPConfigsStorage(
  path?: string,
): MCPConfigStorage {
  const configPath = path || MCP_CONFIG_PATH;

  // Detect Vercel environment
  const isVercel = Boolean(process.env.VERCEL);

  // Complete no-op implementation for Vercel
  if (isVercel) {
    return {
      init: async () => {},
      loadAll: async () => ({}),
      save: async () => {},
      delete: async () => {},
      has: async () => false,
    };
  }

  // Normal file-based implementation for non-Vercel environments
  const configs: Map<string, MCPServerConfig> = new Map();
  let watcher: FSWatcher | null = null;
  const debounce = createDebounce();

  async function saveToFile(): Promise<void> {
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(Object.fromEntries(configs), null, 2),
      "utf-8",
    );
  }

  async function init(manager: MCPClientsManager): Promise<void> {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }

    try {
      const configText = await readFile(configPath, { encoding: "utf-8" });
      const config = JSON.parse(configText ?? "{}");
      configs.clear();
      Object.entries(config).forEach(([name, serverConfig]) => {
        configs.set(name, serverConfig as MCPServerConfig);
      });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        await saveToFile();
      } else if (err instanceof SyntaxError) {
        throw new Error(
          `Config file ${configPath} has invalid JSON: ${err.message}`,
        );
      } else {
        throw err;
      }
    }

    watcher = chokidar.watch(configPath, {
      persistent: true,
      awaitWriteFinish: true,
      ignoreInitial: true,
    });

    watcher.on("change", () =>
      debounce(async () => {
        try {
          const configText = await readFile(configPath, {
            encoding: "utf-8",
          });
          if (
            equal(JSON.parse(configText ?? "{}"), Object.fromEntries(configs))
          ) {
            return;
          }

          await manager.cleanup();
          await manager.init();
        } catch (err) {
          logger.error("Error detecting config file change:", err);
        }
      }, 1000),
    );
  }

  return {
    init,
    async loadAll(): Promise<Record<string, MCPServerConfig>> {
      return Object.fromEntries(configs);
    },
    async save(name: string, config: MCPServerConfig): Promise<void> {
      configs.set(name, config);
      await saveToFile();
    },
    async delete(name: string): Promise<void> {
      configs.delete(name);
      await saveToFile();
    },
    async has(name: string): Promise<boolean> {
      return configs.has(name);
    },
  };
}
