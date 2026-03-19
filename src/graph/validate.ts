/**
 * Workflow graph validation
 * Implements the 7-step validation pipeline from the spec
 */

import { tarjan, type AdjacencyList } from "./tarjan.js";
import type { Workflow, WorkflowStep } from "../config/schema.js";

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

export interface ValidatedWorkflow extends Workflow {
  readonly executionOrder: readonly (readonly string[])[];
}

type EdgeType = "forward" | "back";

interface Edge {
  readonly from: string;
  readonly to: string;
  readonly type: EdgeType;
}

/**
 * Step 1: Build adjacency list including both forward and back edges
 */
const buildAdjacencyList = (steps: readonly WorkflowStep[]): {
  readonly graph: AdjacencyList;
  readonly edges: readonly Edge[];
} => {
  const adjacency = new Map<string, string[]>();
  const allEdges: Edge[] = [];

  // Initialize all nodes
  steps.forEach((step) => {
    if (!adjacency.has(step.id)) {
      adjacency.set(step.id, []);
    }
  });

  // Add forward edges from depends_on
  steps.forEach((step) => {
    step.depends_on.forEach((dep) => {
      const neighbors = adjacency.get(dep) ?? [];
      if (!neighbors.includes(step.id)) {
        neighbors.push(step.id);
        adjacency.set(dep, neighbors);
        allEdges.push({ from: dep, to: step.id, type: "forward" });
      }
    });
  });

  // Add back edges from on_fail.route_to
  steps.forEach((step) => {
    if (step.on_fail) {
      const neighbors = adjacency.get(step.id) ?? [];
      if (!neighbors.includes(step.on_fail.route_to)) {
        neighbors.push(step.on_fail.route_to);
        adjacency.set(step.id, neighbors);
        allEdges.push({ from: step.id, to: step.on_fail.route_to, type: "back" });
      }
    }
  });

  return { graph: adjacency, edges: allEdges };
};

/**
 * Step 2: Dead step detection via BFS
 */
const findDeadSteps = (
  steps: readonly WorkflowStep[],
  graph: AdjacencyList
): readonly string[] => {
  const startNodes = steps.filter((s) => s.depends_on.length === 0).map((s) => s.id);
  
  if (startNodes.length === 0) {
    return steps.map((s) => s.id); // All steps are dead if no start nodes
  }

  const visited = new Set<string>();
  const queue = [...startNodes];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const neighbors = graph.get(current) ?? [];
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }

  return steps.filter((s) => !visited.has(s.id)).map((s) => s.id);
};

/**
 * Step 3 & 4: SCC analysis + bounded cycle validation
 */
const validateCycles = (
  steps: readonly WorkflowStep[],
  graph: AdjacencyList,
  edges: readonly Edge[]
): void => {
  const sccs = tarjan(graph);
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  // Find cycles (SCCs with more than one node)
  const cycles = sccs.filter((scc) => scc.length > 1);

  if (cycles.length === 0) {
    return; // No cycles, validation passes
  }

  // For each cycle, verify all back-edges within it have max_iterations
  cycles.forEach((scc) => {
    const sccSet = new Set(scc);

    // Find back-edges within this SCC
    const backEdgesInSCC = edges.filter(
      (edge) =>
        edge.type === "back" && sccSet.has(edge.from) && sccSet.has(edge.to)
    );

    backEdgesInSCC.forEach((edge) => {
      const step = stepMap.get(edge.from);
      if (!step?.on_fail?.max_iterations) {
        throw new WorkflowValidationError(
          `Cycle involving step '${edge.from}' has no max_iterations bound. All cycles must be bounded.`
        );
      }
    });
  });
};

/**
 * Step 5: Terminal reachability
 */
const validateTerminalReachability = (
  steps: readonly WorkflowStep[],
  graph: AdjacencyList
): void => {
  // Find terminal steps (steps with no outgoing edges)
  const terminalSteps = steps.filter((s) => {
    const neighbors = graph.get(s.id) ?? [];
    return neighbors.length === 0;
  });

  if (terminalSteps.length === 0) {
    throw new WorkflowValidationError("Workflow has no reachable terminal step.");
  }

  // Verify at least one terminal is reachable from each start node
  const startNodes = steps.filter((s) => s.depends_on.length === 0);

  startNodes.forEach((start) => {
    const visited = new Set<string>();
    const queue = [start.id];

    let foundTerminal = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);

      // Check if this is a terminal
      if (terminalSteps.some((t) => t.id === current)) {
        foundTerminal = true;
        break;
      }

      const neighbors = graph.get(current) ?? [];
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }

    if (!foundTerminal) {
      throw new WorkflowValidationError(
        `Start node '${start.id}' cannot reach any terminal step.`
      );
    }
  });
};

/**
 * Step 6: Condensation graph + topological sort
 * Returns execution order as tiers of parallel-executable steps
 */
const computeExecutionOrder = (
  steps: readonly WorkflowStep[],
  graph: AdjacencyList
): readonly (readonly string[])[] => {
  const sccs = tarjan(graph);
  
  // Build SCC membership map
  const nodeToSCC = new Map<string, number>();
  sccs.forEach((scc, index) => {
    scc.forEach((node) => {
      nodeToSCC.set(node, index);
    });
  });

  // Build condensation graph (DAG of SCCs)
  const condensation = new Map<number, Set<number>>();
  sccs.forEach((_, index) => {
    condensation.set(index, new Set());
  });

  steps.forEach((step) => {
    const fromSCC = nodeToSCC.get(step.id);
    step.depends_on.forEach((dep) => {
      const toSCC = nodeToSCC.get(dep);
      if (fromSCC !== undefined && toSCC !== undefined && fromSCC !== toSCC) {
        condensation.get(toSCC)?.add(fromSCC);
      }
    });
  });

  // Topological sort on condensation graph
  const inDegree = new Map<number, number>();
  sccs.forEach((_, index) => {
    inDegree.set(index, 0);
  });

  condensation.forEach((neighbors) => {
    neighbors.forEach((neighbor) => {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
    });
  });

  const tiers: string[][] = [];
  let remaining = new Set(sccs.map((_, i) => i));

  while (remaining.size > 0) {
    // Find SCCs with in-degree 0
    const tier = Array.from(remaining).filter((scc) => inDegree.get(scc) === 0);

    if (tier.length === 0) {
      // This shouldn't happen if graph is valid, but safeguard
      throw new WorkflowValidationError("Circular dependency detected in condensation graph.");
    }

    // Add all nodes from these SCCs to current tier
    const tierNodes = tier.flatMap((sccIndex) => Array.from(sccs[sccIndex] ?? []));
    tiers.push(tierNodes);

    // Remove these SCCs and update in-degrees
    tier.forEach((scc) => {
      remaining.delete(scc);
      const neighbors = condensation.get(scc) ?? new Set();
      neighbors.forEach((neighbor) => {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
      });
    });
  }

  return tiers;
};

/**
 * Main validation function
 * Runs all 6 steps of graph validation
 */
export const validateWorkflow = (workflow: Workflow): ValidatedWorkflow => {
  const { steps } = workflow;

  // Step 1: Build adjacency list
  const { graph, edges } = buildAdjacencyList(steps);

  // Step 2: Dead step detection
  const deadSteps = findDeadSteps(steps, graph);
  if (deadSteps.length > 0) {
    throw new WorkflowValidationError(
      `Step '${deadSteps[0]}' is unreachable from any start node.`
    );
  }

  // Steps 3 & 4: SCC analysis + bounded cycle validation
  validateCycles(steps, graph, edges);

  // Step 5: Terminal reachability
  validateTerminalReachability(steps, graph);

  // Step 6: Condensation topo-sort
  const executionOrder = computeExecutionOrder(steps, graph);

  return {
    ...workflow,
    executionOrder,
  };
};

/**
 * Step 7: Runtime skill capacity check
 * Verifies that each agent declares the skill required by its steps
 */
export const checkSkillCapacity = (
  workflow: ValidatedWorkflow,
  agents: ReadonlyMap<string, readonly string[]>
): void => {
  workflow.steps.forEach((step) => {
    const agentSkills = agents.get(step.agent);
    
    if (!agentSkills) {
      throw new WorkflowValidationError(
        `Agent '${step.agent}' referenced in step '${step.id}' is not loaded.`
      );
    }

    if (!agentSkills.includes(step.skill)) {
      throw new WorkflowValidationError(
        `Agent '${step.agent}' does not declare skill '${step.skill}' required by step '${step.id}'.`
      );
    }
  });
};
