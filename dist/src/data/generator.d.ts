import type { HypergraphData } from './types';
/**
 * Generate a random hypergraph for stress testing.
 *
 * - Random hyperedge sizes between 2 and maxEdgeSize
 * - Every node appears in at least one hyperedge
 * - Group assigned based on first hyperedge membership (mod 16)
 */
export declare function generateRandomHypergraph(nodeCount: number, edgeCount: number, maxEdgeSize: number): HypergraphData;
