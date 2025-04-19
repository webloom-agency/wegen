import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import logger from "logger";
import { colorize } from "consola/utils";

const VERSION = "0.0.3";

const CACHE_PATH = join(process.cwd(), "node_modules/.mcp-chatbot-cache");

const flagPath = join(CACHE_PATH, VERSION);

const flagCheck = () => {
  if (existsSync(flagPath)) {
    return true;
  }
  return false;
};

const flagGenerate = () => {
  if (!existsSync(flagPath)) {
    mkdirSync(flagPath, { recursive: true });
  }
};

// Get command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === "generate") {
  flagGenerate();
} else {
  if (!flagCheck()) {
    logger.warn(
      `${colorize("cyan", "🔄 UPDATE REQUIRED")} - ${colorize("yellow", `Version ${VERSION}`)}:\n\nPlease run the following commands for proper operation:\n\n${colorize("green", "pnpm initial")}`,
    );
  }
}
