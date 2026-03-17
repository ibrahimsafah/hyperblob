import type { Vec2 } from '../utils/math';
import type { HyperedgeData } from '../data/types';
export interface HullData {
    /** Hull polygon vertices (smoothed) */
    vertices: Vec2[];
    /** Centroid of the hull */
    centroid: Vec2;
    /** Index of the hyperedge this hull belongs to */
    hyperedgeIndex: number;
    /** Fan-triangulated triangles: [centroid, v0, v1, centroid, v1, v2, ...] */
    triangles: Vec2[];
}
export declare class HullCompute {
    /**
     * Compute hulls for all hyperedges.
     *  - 2 members → capsule (stadium)
     *  - 3+ members → padded convex hull + Chaikin smoothing
     */
    computeHulls(positions: Float32Array, hyperedges: HyperedgeData[], margin: number, smoothIterations?: number): HullData[];
}
