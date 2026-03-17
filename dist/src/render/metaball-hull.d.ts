import type { Vec2 } from '../utils/math';
/** Squared distance from point (px,py) to nearest point on segment (ax,ay)→(bx,by) */
export declare function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number;
/** Prim's MST on a set of 2D points. Returns index pairs. */
export declare function computeMST(points: Vec2[]): [number, number][];
