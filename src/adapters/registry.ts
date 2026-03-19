/**
 * Adapter Registry
 * Maps agent types to their corresponding adapters
 */

import type { AgentAdapter } from "./base.js";

export class AdapterRegistry {
  private adapters = new Map<string, AgentAdapter>();

  /**
   * Register an adapter for an agent type
   */
  register(agentType: string, adapter: AgentAdapter): void {
    if (this.adapters.has(agentType)) {
      throw new Error(`Adapter already registered for agent type: ${agentType}`);
    }
    this.adapters.set(agentType, adapter);
  }

  /**
   * Get adapter for an agent type
   */
  get(agentType: string): AgentAdapter | undefined {
    return this.adapters.get(agentType);
  }

  /**
   * Check if adapter exists for agent type
   */
  has(agentType: string): boolean {
    return this.adapters.has(agentType);
  }

  /**
   * Get all registered agent types
   */
  getAgentTypes(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all adapters
   */
  getAll(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }
}

/**
 * Global adapter registry instance
 */
export const adapterRegistry = new AdapterRegistry();
