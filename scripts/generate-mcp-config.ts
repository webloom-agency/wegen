import { existsSync, writeFileSync } from "fs";
import { MCP_CONFIG_PATH } from "lib/const";

const DEFAULT_CONFIG = {
  custom: {
    command: "tsx",
    args: ["custom-mcp-server"],
  },
  playwright: {
    command: "npx",
    args: ["@playwright/mcp@latest"],
  },
};

try {
  if (!existsSync(MCP_CONFIG_PATH)) {
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log("✅ .mcp-config.json has been generated successfully");
  } else {
    console.log("🟡 .mcp-config.json already exists");
  }
} catch (error) {
  console.error("❌ Failed to generate .mcp-config.json:", error);
  process.exit(1);
}
