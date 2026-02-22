/**
 * metaball-contour.c — Reference C implementation of WASM metaball contour extraction
 *
 * NOTE: This is a readable reference. The actual WASM is compiled from metaball-contour.wat
 * using wat2wasm (Apple's clang lacks the wasm32 backend).
 *
 * Compile (if clang has wasm32 target):
 *   clang --target=wasm32 -nostdlib -O2 \
 *     -Wl,--no-entry -Wl,--export-all \
 *     -o metaball-contour.wasm metaball-contour.c
 */

#include <math.h>

/* ── Helpers ── */

static float dist_to_segment_sq(
    float px, float py,
    float ax, float ay,
    float bx, float by
) {
    float dx = bx - ax;
    float dy = by - ay;
    float lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12f) {
        float ex = px - ax, ey = py - ay;
        return ex * ex + ey * ey;
    }
    float t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0.0f) t = 0.0f;
    if (t > 1.0f) t = 1.0f;
    float nearX = ax + t * dx;
    float nearY = ay + t * dy;
    float ex = px - nearX, ey = py - nearY;
    return ex * ex + ey * ey;
}

static float lerp1d(float v0, float v1, float threshold) {
    float d = v1 - v0;
    if (fabsf(d) < 1e-10f) return 0.5f;
    return (threshold - v0) / d;
}

/* ── Edge table for marching squares ──
 * Edges: 0=top, 1=right, 2=bottom, 3=left
 * Each case maps to 0-2 edge pairs.
 */
static const int EDGE_TABLE[16][2][2] = {
    /* 0:  0000 */ {{-1,-1},{-1,-1}},
    /* 1:  0001 */ {{ 3, 2},{-1,-1}},
    /* 2:  0010 */ {{ 2, 1},{-1,-1}},
    /* 3:  0011 */ {{ 3, 1},{-1,-1}},
    /* 4:  0100 */ {{ 1, 0},{-1,-1}},
    /* 5:  0101 */ {{ 3, 0},{ 1, 2}},  /* saddle - disambiguated */
    /* 6:  0110 */ {{ 2, 0},{-1,-1}},
    /* 7:  0111 */ {{ 3, 0},{-1,-1}},
    /* 8:  1000 */ {{ 0, 3},{-1,-1}},
    /* 9:  1001 */ {{ 0, 2},{-1,-1}},
    /* 10: 1010 */ {{ 0, 1},{ 2, 3}},  /* saddle - disambiguated */
    /* 11: 1011 */ {{ 0, 1},{-1,-1}},
    /* 12: 1100 */ {{ 1, 3},{-1,-1}},
    /* 13: 1101 */ {{ 1, 2},{-1,-1}},
    /* 14: 1110 */ {{ 2, 3},{-1,-1}},
    /* 15: 1111 */ {{-1,-1},{-1,-1}},
};

static const int NUM_PAIRS[16] = {
    0, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0
};

/* ── Exported functions ── */

__attribute__((export_name("add_bridge_field")))
void add_bridge_field(
    float* grid_values,
    int cols, int rows,
    float origin_x, float origin_y, float cell_size,
    float* mst_edges,     /* flat [ax, ay, bx, by, ...] */
    int num_mst_edges,
    float base_sigma
) {
    float baseSigma = fmaxf(base_sigma, cell_size * 2.5f);

    for (int i = 0; i < num_mst_edges; i++) {
        float ax = mst_edges[i * 4 + 0];
        float ay = mst_edges[i * 4 + 1];
        float bx = mst_edges[i * 4 + 2];
        float by = mst_edges[i * 4 + 3];

        float edx = bx - ax, edy = by - ay;
        float edgeLen = sqrtf(edx * edx + edy * edy);
        float bridgeSigma = fmaxf(baseSigma, edgeLen * 0.12f);
        float invTwoSigmaSq = 1.0f / (2.0f * bridgeSigma * bridgeSigma);
        float cutoff = 3.0f * bridgeSigma;
        float cutoffSq = cutoff * cutoff;

        float segMinX = fminf(ax, bx) - cutoff;
        float segMaxX = fmaxf(ax, bx) + cutoff;
        float segMinY = fminf(ay, by) - cutoff;
        float segMaxY = fmaxf(ay, by) + cutoff;

        int rMin = (int)floorf((segMinY - origin_y) / cell_size);
        if (rMin < 0) rMin = 0;
        int rMax = (int)ceilf((segMaxY - origin_y) / cell_size);
        if (rMax > rows - 1) rMax = rows - 1;
        int cMin = (int)floorf((segMinX - origin_x) / cell_size);
        if (cMin < 0) cMin = 0;
        int cMax = (int)ceilf((segMaxX - origin_x) / cell_size);
        if (cMax > cols - 1) cMax = cols - 1;

        for (int r = rMin; r <= rMax; r++) {
            float py = origin_y + r * cell_size;
            for (int c = cMin; c <= cMax; c++) {
                float px = origin_x + c * cell_size;
                float dSq = dist_to_segment_sq(px, py, ax, ay, bx, by);
                if (dSq < cutoffSq) {
                    float val = expf(-dSq * invTwoSigmaSq);
                    grid_values[r * cols + c] += val;
                }
            }
        }
    }
}

static void get_edge_point(
    float* grid_values, int cols,
    float origin_x, float origin_y, float cell_size,
    int r, int c, int edge, float threshold,
    float* out_x, float* out_y
) {
    float tl = grid_values[r * cols + c];
    float tr = grid_values[r * cols + c + 1];
    float bl = grid_values[(r + 1) * cols + c];
    float br = grid_values[(r + 1) * cols + c + 1];

    float x0 = origin_x + c * cell_size;
    float y0 = origin_y + r * cell_size;
    float x1 = x0 + cell_size;
    float y1 = y0 + cell_size;

    float t;
    switch (edge) {
        case 0: /* top: tl -> tr */
            t = lerp1d(tl, tr, threshold);
            *out_x = x0 + t * cell_size;
            *out_y = y0;
            break;
        case 1: /* right: tr -> br */
            t = lerp1d(tr, br, threshold);
            *out_x = x1;
            *out_y = y0 + t * cell_size;
            break;
        case 2: /* bottom: bl -> br */
            t = lerp1d(bl, br, threshold);
            *out_x = x0 + t * cell_size;
            *out_y = y1;
            break;
        case 3: /* left: tl -> bl */
            t = lerp1d(tl, bl, threshold);
            *out_x = x0;
            *out_y = y0 + t * cell_size;
            break;
    }
}

__attribute__((export_name("marching_squares")))
int marching_squares(
    float* grid_values,
    int cols, int rows,
    float origin_x, float origin_y, float cell_size,
    float threshold,
    float* segments_out    /* output: flat [x0, y0, x1, y1, ...] */
) {
    int seg_count = 0;

    for (int r = 0; r < rows - 1; r++) {
        for (int c = 0; c < cols - 1; c++) {
            int tl = grid_values[r * cols + c] >= threshold ? 1 : 0;
            int tr = grid_values[r * cols + c + 1] >= threshold ? 1 : 0;
            int br = grid_values[(r + 1) * cols + c + 1] >= threshold ? 1 : 0;
            int bl = grid_values[(r + 1) * cols + c] >= threshold ? 1 : 0;

            int caseIndex = (tl << 3) | (tr << 2) | (br << 1) | bl;
            if (caseIndex == 0 || caseIndex == 15) continue;

            int pairs[2][2];
            int numPairs = NUM_PAIRS[caseIndex];

            /* Copy default edge pairs */
            pairs[0][0] = EDGE_TABLE[caseIndex][0][0];
            pairs[0][1] = EDGE_TABLE[caseIndex][0][1];
            pairs[1][0] = EDGE_TABLE[caseIndex][1][0];
            pairs[1][1] = EDGE_TABLE[caseIndex][1][1];

            /* Saddle disambiguation */
            if (caseIndex == 5 || caseIndex == 10) {
                float center = (grid_values[r*cols+c] + grid_values[r*cols+c+1] +
                                grid_values[(r+1)*cols+c+1] + grid_values[(r+1)*cols+c]) / 4.0f;
                if (caseIndex == 5) {
                    if (center >= threshold) {
                        pairs[0][0]=3; pairs[0][1]=2; pairs[1][0]=1; pairs[1][1]=0;
                    } else {
                        pairs[0][0]=3; pairs[0][1]=0; pairs[1][0]=1; pairs[1][1]=2;
                    }
                } else { /* case 10 */
                    if (center >= threshold) {
                        pairs[0][0]=0; pairs[0][1]=3; pairs[1][0]=2; pairs[1][1]=1;
                    } else {
                        pairs[0][0]=0; pairs[0][1]=1; pairs[1][0]=2; pairs[1][1]=3;
                    }
                }
            }

            for (int p = 0; p < numPairs; p++) {
                float x0, y0, x1, y1;
                get_edge_point(grid_values, cols, origin_x, origin_y, cell_size,
                               r, c, pairs[p][0], threshold, &x0, &y0);
                get_edge_point(grid_values, cols, origin_x, origin_y, cell_size,
                               r, c, pairs[p][1], threshold, &x1, &y1);
                segments_out[seg_count * 4 + 0] = x0;
                segments_out[seg_count * 4 + 1] = y0;
                segments_out[seg_count * 4 + 2] = x1;
                segments_out[seg_count * 4 + 3] = y1;
                seg_count++;
            }
        }
    }

    return seg_count;
}
