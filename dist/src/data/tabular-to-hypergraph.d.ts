import type { HypergraphData } from './types';
import type { ParsedCSV } from './csv-parser';
export interface ColumnMapping {
    nodeColumn: number;
    edgeColumns: number[];
}
/**
 * Convert tabular CSV data + column role assignments into a HypergraphData.
 *
 * - The nodeColumn determines node identity (each unique value = one node)
 * - Each edgeColumn creates hyperedges: every unique value in that column
 *   becomes a hyperedge containing all nodes from rows with that value
 * - Singleton hyperedges (size < 2) are dropped
 */
export declare function tabularToHypergraph(csv: ParsedCSV, mapping: ColumnMapping): HypergraphData;
