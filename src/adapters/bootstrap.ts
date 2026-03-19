/**
 * Adapter Bootstrap
 * Auto-registers all available adapters
 */

import { adapterRegistry } from "./registry.js";
import { createNullClawAdapter } from "./nullclaw/adapter.js";
import { createZeroClawAdapter } from "./zeroclaw/adapter.js";
import { createPicoClawAdapter } from "./picoclaw/adapter.js";
import { createOpenHandsAdapter } from "./openhands/adapter.js";
import { logger } from "../utils/logger.js";

/**
 * Register all available adapters
 */
export function bootstrapAdapters(): void {
  logger.debug("Bootstrapping adapters");
  
  // Register openclaw - DISABLED due to type errors
  // adapterRegistry.register("openclaw", createOpenClawAdapter());
  
  // Register nullclaw
  adapterRegistry.register("nullclaw", createNullClawAdapter());
  
  // Register zeroclaw
  adapterRegistry.register("zeroclaw", createZeroClawAdapter());
  
  // Register picoclaw
  adapterRegistry.register("picoclaw", createPicoClawAdapter());

  // Register openhands (Docker-based SWE agent)
  adapterRegistry.register("openhands", createOpenHandsAdapter());
  
  logger.info(
    { adapters: adapterRegistry.getAgentTypes() },
    "Adapters registered"
  );
}
