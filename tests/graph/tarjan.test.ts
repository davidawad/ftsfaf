import { describe, it, expect } from "vitest";
import { tarjan, hasCycles, findCycles, type AdjacencyList } from "../../src/graph/tarjan.js";

describe("Tarjan's SCC Algorithm", () => {
  describe("tarjan", () => {
    it("finds single-node SCCs in an acyclic graph", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B", "C"]],
        ["B", ["D"]],
        ["C", ["D"]],
        ["D", []],
      ]);

      const sccs = tarjan(graph);
      
      // Each node should be in its own SCC
      expect(sccs).toHaveLength(4);
      expect(sccs.every((scc) => scc.length === 1)).toBe(true);
    });

    it("finds a simple cycle", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]],
      ]);

      const sccs = tarjan(graph);
      
      // Should find one SCC with all three nodes
      expect(sccs).toHaveLength(1);
      expect(sccs[0]).toHaveLength(3);
      expect(new Set(sccs[0])).toEqual(new Set(["A", "B", "C"]));
    });

    it("finds multiple SCCs in a complex graph", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]], // Cycle: A-B-C
        ["D", ["E"]],
        ["E", ["D"]], // Cycle: D-E
        ["F", []], // Isolated node
      ]);

      const sccs = tarjan(graph);
      
      expect(sccs).toHaveLength(3);
      
      // Find the cycles
      const cycles = sccs.filter((scc) => scc.length > 1);
      expect(cycles).toHaveLength(2);
      
      const singleNodes = sccs.filter((scc) => scc.length === 1);
      expect(singleNodes).toHaveLength(1);
    });

    it("handles self-loops", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["A"]], // Self-loop
        ["B", ["C"]],
        ["C", []],
      ]);

      const sccs = tarjan(graph);
      
      // A should be in its own SCC (a self-loop is a cycle of length 1)
      const aSCC = sccs.find((scc) => scc.includes("A"));
      expect(aSCC).toHaveLength(1);
    });

    it("handles complex workflow graph with back-edges", () => {
      // Simulate a workflow with retry logic
      const graph: AdjacencyList = new Map([
        ["plan", ["implement"]],
        ["implement", ["review"]],
        ["review", ["implement", "deploy"]], // Back-edge for retry + forward edge
        ["deploy", []],
      ]);

      const sccs = tarjan(graph);
      
      // implement and review form a cycle
      const cycle = sccs.find((scc) => scc.length > 1);
      expect(cycle).toBeDefined();
      expect(new Set(cycle)).toEqual(new Set(["implement", "review"]));
    });
  });

  describe("hasCycles", () => {
    it("returns false for acyclic graph", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", []],
      ]);

      expect(hasCycles(graph)).toBe(false);
    });

    it("returns true for graph with cycles", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]],
      ]);

      expect(hasCycles(graph)).toBe(true);
    });

    it("returns true for graph with back-edge", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A", "D"]], // Back-edge to A
        ["D", []],
      ]);

      expect(hasCycles(graph)).toBe(true);
    });
  });

  describe("findCycles", () => {
    it("returns empty array for acyclic graph", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", []],
      ]);

      expect(findCycles(graph)).toHaveLength(0);
    });

    it("returns only cycles from graph with mixed SCCs", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["A"]], // Cycle
        ["C", ["D"]],
        ["D", []], // No cycle
      ]);

      const cycles = findCycles(graph);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toHaveLength(2);
      expect(new Set(cycles[0])).toEqual(new Set(["A", "B"]));
    });

    it("returns all cycles in graph with multiple cycles", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]], // Cycle 1: A-B-C
        ["D", ["E"]],
        ["E", ["D"]], // Cycle 2: D-E
      ]);

      const cycles = findCycles(graph);
      expect(cycles).toHaveLength(2);
      
      // One cycle should have 3 nodes, another should have 2
      const sizes = cycles.map((c) => c.length).sort();
      expect(sizes).toEqual([2, 3]);
    });
  });

  describe("empty and edge cases", () => {
    it("handles empty graph", () => {
      const graph: AdjacencyList = new Map();
      
      expect(tarjan(graph)).toHaveLength(0);
      expect(hasCycles(graph)).toBe(false);
      expect(findCycles(graph)).toHaveLength(0);
    });

    it("handles single node with no edges", () => {
      const graph: AdjacencyList = new Map([["A", []]]);
      
      const sccs = tarjan(graph);
      expect(sccs).toHaveLength(1);
      expect(sccs[0]).toEqual(["A"]);
      expect(hasCycles(graph)).toBe(false);
    });

    it("handles disconnected components", () => {
      const graph: AdjacencyList = new Map([
        ["A", ["B"]],
        ["B", []],
        ["C", ["D"]],
        ["D", []],
      ]);

      const sccs = tarjan(graph);
      expect(sccs).toHaveLength(4);
      expect(hasCycles(graph)).toBe(false);
    });
  });
});
