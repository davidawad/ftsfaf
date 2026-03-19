/**
 * Tarjan's Strongly Connected Components Algorithm
 * Pure functional implementation for cycle detection in workflow graphs
 */

export type AdjacencyList = ReadonlyMap<string, readonly string[]>;

export type SCC = readonly string[];

export interface TarjanState {
  readonly index: number;
  readonly stack: readonly string[];
  readonly indices: ReadonlyMap<string, number>;
  readonly lowlinks: ReadonlyMap<string, number>;
  readonly onStack: ReadonlySet<string>;
  readonly sccs: readonly SCC[];
}

const initialState: TarjanState = {
  index: 0,
  stack: [],
  indices: new Map(),
  lowlinks: new Map(),
  onStack: new Set(),
  sccs: [],
};

/**
 * Run Tarjan's algorithm on a directed graph
 * Returns list of strongly connected components (SCCs)
 * Each SCC is a list of node IDs
 */
export const tarjan = (graph: AdjacencyList): readonly SCC[] => {
  const nodes = Array.from(graph.keys());
  
  const finalState = nodes.reduce((state, node) => {
    if (!state.indices.has(node)) {
      return strongConnect(node, graph, state);
    }
    return state;
  }, initialState);

  return finalState.sccs;
};

const strongConnect = (
  node: string,
  graph: AdjacencyList,
  state: TarjanState
): TarjanState => {
  // Set the depth index for this node
  const newIndices = new Map(state.indices);
  const newLowlinks = new Map(state.lowlinks);
  newIndices.set(node, state.index);
  newLowlinks.set(node, state.index);

  const newStack = [...state.stack, node];
  const newOnStack = new Set(state.onStack);
  newOnStack.add(node);

  const currentIndex = state.index + 1;

  // Process neighbors
  const neighbors = graph.get(node) ?? [];
  const afterNeighbors = neighbors.reduce<TarjanState>(
    (accState, neighbor) => {
      if (!accState.indices.has(neighbor)) {
        // Neighbor hasn't been visited, recurse
        const afterRecurse = strongConnect(neighbor, graph, accState);
        const updatedLowlinks = new Map(afterRecurse.lowlinks);
        const neighborLowlink = afterRecurse.lowlinks.get(neighbor);
        const nodeLowlink = afterRecurse.lowlinks.get(node);
        
        if (neighborLowlink !== undefined && nodeLowlink !== undefined) {
          updatedLowlinks.set(node, Math.min(nodeLowlink, neighborLowlink));
        }

        return {
          ...afterRecurse,
          lowlinks: updatedLowlinks,
        };
      } else if (accState.onStack.has(neighbor)) {
        // Neighbor is on stack, part of current SCC
        const updatedLowlinks = new Map(accState.lowlinks);
        const neighborIndex = accState.indices.get(neighbor);
        const nodeLowlink = accState.lowlinks.get(node);
        
        if (neighborIndex !== undefined && nodeLowlink !== undefined) {
          updatedLowlinks.set(node, Math.min(nodeLowlink, neighborIndex));
        }

        return {
          ...accState,
          lowlinks: updatedLowlinks,
        };
      }
      
      return accState;
    },
    {
      ...state,
      index: currentIndex,
      stack: newStack,
      onStack: newOnStack,
      indices: newIndices,
      lowlinks: newLowlinks,
    }
  );

  // If node is a root node, pop the stack and generate an SCC
  const nodeIndex = afterNeighbors.indices.get(node);
  const nodeLowlink = afterNeighbors.lowlinks.get(node);

  if (nodeIndex === nodeLowlink) {
    const scc: string[] = [];
    const stackCopy = [...afterNeighbors.stack];
    const onStackCopy = new Set(afterNeighbors.onStack);
    
    // Pop from stack until we find the current node
    // eslint-disable-next-line functional/no-loop-statement
    while (stackCopy.length > 0) {
      const w = stackCopy.pop();
      if (w === undefined) {
        break;
      }
      onStackCopy.delete(w);
      scc.push(w);
      if (w === node) {
        break;
      }
    }

    return {
      ...afterNeighbors,
      stack: stackCopy,
      onStack: onStackCopy,
      sccs: [...afterNeighbors.sccs, scc],
    };
  }

  return afterNeighbors;
};

/**
 * Check if a graph has cycles
 * A graph has cycles if any SCC contains more than one node
 */
export const hasCycles = (graph: AdjacencyList): boolean => {
  const sccs = tarjan(graph);
  return sccs.some((scc) => scc.length > 1);
};

/**
 * Find all cycles in a graph
 * Returns only SCCs with more than one node
 */
export const findCycles = (graph: AdjacencyList): readonly SCC[] => {
  const sccs = tarjan(graph);
  return sccs.filter((scc) => scc.length > 1);
};
