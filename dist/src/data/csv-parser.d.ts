export interface ParsedCSV {
    headers: string[];
    rows: string[][];
}
export declare function parseCSV(text: string): ParsedCSV;
