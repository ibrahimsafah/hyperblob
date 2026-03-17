import type { HIFDocument, HypergraphData } from './types';
/**
 * Parse a HIF (Hypergraph Interchange Format) JSON document into our internal
 * HypergraphData representation.
 *
 * - Groups incidences by edge to build hyperedge membership lists
 * - Assigns stable numeric indices to string node IDs (insertion order)
 * - Assigns group based on first hyperedge membership (mod 16)
 * - Handles empty incidences, duplicate nodes in same edge, missing nodes/edges arrays
 */
export declare function parseHIF(doc: HIFDocument): HypergraphData;
