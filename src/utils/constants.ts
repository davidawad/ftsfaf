/**
 * Application Constants
 */

import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Base path for persistent data storage
 * Database and other persistent files are stored here
 */
export const DATA_PATH = path.resolve(
  path.join(__dirname, "..", "..", "data")
);

/**
 * Database file path
 */
export const DATABASE_PATH = path.join(DATA_PATH, "ftsfaf.sqlite");

/**
 * Base path for agent sandboxes
 * All agent runtime files are created under this directory
 * Uses absolute path to work correctly regardless of process.cwd()
 */
export const SANDBOX_BASE_PATH = path.resolve(
  path.join(__dirname, "..", "..", "tmp")
);

/**
 * Base path for workflow outputs
 * Symlinks to workflow output files are created in this directory
 */
export const OUTPUTS_PATH = path.resolve(
  path.join(__dirname, "..", "..", "outputs")
);

/**
 * Dashboard server port
 */
export const DASHBOARD_PORT = 9482;
