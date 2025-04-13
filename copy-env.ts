import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { consola } from "consola";

// Get current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Copy .env.example to .env if .env doesn't exist
 */
function copyEnvFile() {
  const envPath = path.join(__dirname, ".env");
  const envExamplePath = path.join(__dirname, ".env.example");

  if (!fs.existsSync(envPath)) {
    try {
      consola.warn(".env file not found. Copying from .env.example...");
      fs.copyFileSync(envExamplePath, envPath);
      consola.success(".env file has been created.");
      consola.warn(
        "Important: You may need to edit the .env file to set your API keys.",
      );
      return true;
    } catch (error) {
      consola.error("Error occurred while creating .env file.");
      console.error(error);
      return false;
    }
  } else {
    consola.info(".env file already exists. Skipping...");
    return true;
  }
}

// Execute copy operation
const result = copyEnvFile();
process.exit(result ? 0 : 1);
