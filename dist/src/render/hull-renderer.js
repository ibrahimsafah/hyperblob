// Hull renderer — renders semi-transparent hull polygons for hyperedges
// Convex mode: fan-triangulated geometry computed by HullCompute
// Metaball mode: screen-space fragment shader via MetaballRenderer
// Recomputes periodically (not every frame) for performance
import { HullCompute } from './hull-compute';
import { MetaballRenderer } from './metaball-renderer';
import { getPaletteColor } from '../utils/color';
import hullShaderCode from '../shaders/hull-render.wgsl?raw';
// Vertex layout: [x, y, r, g, b, a] per vertex = 6 floats = 24 bytes
const FLOATS_PER_VERTEX = 6;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;
export class HullRenderer {
    gpu;
    buffers;
    camera;
    pipeline = null;
    outlinePipeline = null;
    bindGroup = null;
    cameraBuffer = null;
    hullCompute = new HullCompute();
    metaballRenderer = null;
    hypergraphData = null;
    // Hull vertex buffers (pre-allocated, grown as needed)
    fillVertexBuffer = null;
    fillBufferCapacity = 0; // in bytes
    fillVertexCount = 0;
    outlineVertexBuffer = null;
    outlineBufferCapacity = 0; // in bytes
    outlineVertexCount = 0;
    // Edge visibility filter (null = show all)
    visibleEdges = null;
    // Dimmed edges (render at reduced alpha)
    dimmedEdgeSet = null;
    // Cached hull polygons for hit testing (convex mode only)
    lastHulls = [];
    // Recompute throttling
    frameCounter = 0;
    recomputeInterval = 10;
    needsRecompute = true;
    lastCameraVersion = -1;
    constructor(gpu, buffers, camera) {
        this.gpu = gpu;
        this.buffers = buffers;
        this.camera = camera;
        this.initPipelines();
    }
    initPipelines() {
        const { device, format } = this.gpu;
        const shaderModule = device.createShaderModule({
            label: 'hull-render-shader',
            code: hullShaderCode,
        });
        const bindGroupLayout = device.createBindGroupLayout({
            label: 'hull-bind-group-layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
            ],
        });
        const pipelineLayout = device.createPipelineLayout({
            label: 'hull-pipeline-layout',
            bindGroupLayouts: [bindGroupLayout],
        });
        const vertexBufferLayout = {
            arrayStride: BYTES_PER_VERTEX,
            attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
                { shaderLocation: 1, offset: 8, format: 'float32x4' }, // color
            ],
        };
        // Fill pipeline (triangles with alpha blending)
        this.pipeline = device.createRenderPipeline({
            label: 'hull-fill-pipeline',
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [vertexBufferLayout],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                        format,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }],
            },
            primitive: { topology: 'triangle-list' },
        });
        // Outline pipeline (line-strip with alpha blending)
        this.outlinePipeline = device.createRenderPipeline({
            label: 'hull-outline-pipeline',
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [vertexBufferLayout],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                        format,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }],
            },
            primitive: { topology: 'line-list' },
        });
        // Create camera uniform buffer for hull rendering
        this.cameraBuffer = this.buffers.createBuffer('hull-camera-uniform', 64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'hull-camera-uniform');
        this.updateBindGroup();
    }
    updateBindGroup() {
        if (!this.pipeline || !this.cameraBuffer)
            return;
        this.bindGroup = this.gpu.device.createBindGroup({
            label: 'hull-bind-group',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.cameraBuffer } },
            ],
        });
    }
    setData(data) {
        this.hypergraphData = data;
        this.visibleEdges = null;
        this.needsRecompute = true;
        this.frameCounter = 0;
        // Invalidate metaball renderer bind group (buffers may have changed)
        this.metaballRenderer?.invalidateBindGroup();
    }
    setVisibleEdges(visibleEdges) {
        this.visibleEdges = visibleEdges;
        this.forceRecompute();
    }
    /** Set dimmed edges — dimmed hulls render at reduced alpha. Pass null to clear. */
    setDimmedEdges(dimmedSet) {
        this.dimmedEdgeSet = dimmedSet;
        this.forceRecompute();
    }
    /** Synchronous convex-hull recompute using CPU-side positions (no GPU readback). */
    recomputeHullsSync(positions, renderParams) {
        if (!this.hypergraphData)
            return;
        const edges = this.visibleEdges !== null
            ? this.hypergraphData.hyperedges.filter(he => this.visibleEdges.has(he.index))
            : this.hypergraphData.hyperedges;
        const hulls = this.hullCompute.computeHulls(positions, edges, renderParams.hullMargin, renderParams.hullSmoothing);
        this.lastHulls = hulls;
        this.buildFillVertices(hulls, renderParams.hullAlpha);
        if (renderParams.hullOutline) {
            this.buildOutlineVertices(hulls);
        }
        else {
            this.outlineVertexCount = 0;
        }
        this.needsRecompute = false;
    }
    /** Synchronous metaball instance update — fragment shader evaluates field per-pixel. */
    recomputeMetaballs(positions, renderParams) {
        if (!this.hypergraphData)
            return;
        this.metaballRenderer ??= new MetaballRenderer(this.gpu, this.buffers, this.camera);
        const edges = this.visibleEdges !== null
            ? this.hypergraphData.hyperedges.filter(he => this.visibleEdges.has(he.index))
            : this.hypergraphData.hyperedges;
        const sigma = Math.max(renderParams.hullMargin, 5);
        this.metaballRenderer.updateInstances(positions, edges, sigma, renderParams.hullMetaballThreshold, renderParams.hullAlpha, this.dimmedEdgeSet);
        this.needsRecompute = false;
    }
    buildFillVertices(hulls, alpha) {
        // Count total triangle vertices
        let totalVertices = 0;
        for (const hull of hulls) {
            totalVertices += hull.triangles.length;
        }
        if (totalVertices === 0) {
            this.fillVertexCount = 0;
            return;
        }
        const data = new Float32Array(totalVertices * FLOATS_PER_VERTEX);
        let offset = 0;
        for (const hull of hulls) {
            const color = getPaletteColor(hull.hyperedgeIndex);
            // Dimmed edges render at 8% of normal alpha (matching BSM's SVG behavior)
            const isDimmed = this.dimmedEdgeSet !== null && this.dimmedEdgeSet.has(hull.hyperedgeIndex);
            const hullAlpha = isDimmed ? alpha * 0.08 : alpha;
            for (const vertex of hull.triangles) {
                data[offset++] = vertex[0]; // x
                data[offset++] = vertex[1]; // y
                data[offset++] = color[0]; // r
                data[offset++] = color[1]; // g
                data[offset++] = color[2]; // b
                data[offset++] = hullAlpha; // a
            }
        }
        this.fillVertexCount = totalVertices;
        // Grow buffer only when capacity is exceeded (amortized 2× growth)
        if (data.byteLength > this.fillBufferCapacity) {
            if (this.fillVertexBuffer)
                this.fillVertexBuffer.destroy();
            this.fillBufferCapacity = data.byteLength * 2;
            this.fillVertexBuffer = this.gpu.device.createBuffer({
                label: 'hull-fill-vertices',
                size: this.fillBufferCapacity,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        this.gpu.device.queue.writeBuffer(this.fillVertexBuffer, 0, data);
    }
    buildOutlineVertices(hulls) {
        // Count total outline line segments (each hull edge = 2 vertices for line-list)
        let totalVertices = 0;
        for (const hull of hulls) {
            totalVertices += hull.vertices.length * 2; // line-list: 2 verts per segment
        }
        if (totalVertices === 0) {
            this.outlineVertexCount = 0;
            return;
        }
        const data = new Float32Array(totalVertices * FLOATS_PER_VERTEX);
        let offset = 0;
        const outlineAlpha = 0.5;
        for (const hull of hulls) {
            const color = getPaletteColor(hull.hyperedgeIndex);
            const isDimmed = this.dimmedEdgeSet !== null && this.dimmedEdgeSet.has(hull.hyperedgeIndex);
            const hullOutlineAlpha = isDimmed ? outlineAlpha * 0.15 : outlineAlpha;
            const n = hull.vertices.length;
            for (let i = 0; i < n; i++) {
                const next = (i + 1) % n;
                // Start vertex of line segment
                data[offset++] = hull.vertices[i][0];
                data[offset++] = hull.vertices[i][1];
                data[offset++] = color[0];
                data[offset++] = color[1];
                data[offset++] = color[2];
                data[offset++] = hullOutlineAlpha;
                // End vertex of line segment
                data[offset++] = hull.vertices[next][0];
                data[offset++] = hull.vertices[next][1];
                data[offset++] = color[0];
                data[offset++] = color[1];
                data[offset++] = color[2];
                data[offset++] = hullOutlineAlpha;
            }
        }
        this.outlineVertexCount = totalVertices;
        // Grow buffer only when capacity is exceeded (amortized 2× growth)
        if (data.byteLength > this.outlineBufferCapacity) {
            if (this.outlineVertexBuffer)
                this.outlineVertexBuffer.destroy();
            this.outlineBufferCapacity = data.byteLength * 2;
            this.outlineVertexBuffer = this.gpu.device.createBuffer({
                label: 'hull-outline-vertices',
                size: this.outlineBufferCapacity,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        this.gpu.device.queue.writeBuffer(this.outlineVertexBuffer, 0, data);
    }
    forceRecompute() {
        this.needsRecompute = true;
    }
    /** Point-in-polygon hit test against cached hulls (ray-casting algorithm).
     *  Tests in reverse order so the topmost (last-rendered) hull wins. */
    hitTest(worldX, worldY, hullMode = 'convex') {
        // Metaball mode: delegate to field evaluation
        if (hullMode === 'metaball' && this.metaballRenderer) {
            return this.metaballRenderer.hitTest(worldX, worldY);
        }
        // Convex mode: point-in-polygon
        for (let h = this.lastHulls.length - 1; h >= 0; h--) {
            const verts = this.lastHulls[h].vertices;
            const n = verts.length;
            if (n < 3)
                continue;
            let inside = false;
            for (let i = 0, j = n - 1; i < n; j = i++) {
                const xi = verts[i][0], yi = verts[i][1];
                const xj = verts[j][0], yj = verts[j][1];
                if ((yi > worldY) !== (yj > worldY) &&
                    worldX < (xj - xi) * (worldY - yi) / (yj - yi) + xi) {
                    inside = !inside;
                }
            }
            if (inside)
                return this.lastHulls[h].hyperedgeIndex;
        }
        return null;
    }
    render(renderPass, renderParams, positions) {
        if (!this.hypergraphData)
            return;
        const isMetaball = renderParams.hullMode === 'metaball';
        // Throttled recompute
        this.frameCounter++;
        if (positions && (this.needsRecompute || this.frameCounter >= this.recomputeInterval)) {
            this.frameCounter = 0;
            if (isMetaball) {
                this.recomputeMetaballs(positions, renderParams);
            }
            else {
                this.recomputeHullsSync(positions, renderParams);
            }
        }
        if (isMetaball) {
            // Metaball mode: delegate to fragment shader renderer
            this.metaballRenderer?.render(renderPass);
        }
        else {
            // Convex mode: draw pre-computed hull geometry
            if (!this.pipeline || !this.bindGroup || !this.cameraBuffer)
                return;
            // Update camera uniform (only when camera has changed)
            if (this.camera.version !== this.lastCameraVersion) {
                this.lastCameraVersion = this.camera.version;
                this.gpu.device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());
            }
            // Draw filled hulls
            if (this.fillVertexCount > 0 && this.fillVertexBuffer) {
                renderPass.setPipeline(this.pipeline);
                renderPass.setBindGroup(0, this.bindGroup);
                renderPass.setVertexBuffer(0, this.fillVertexBuffer);
                renderPass.draw(this.fillVertexCount);
            }
            // Draw hull outlines
            if (renderParams.hullOutline && this.outlineVertexCount > 0 && this.outlineVertexBuffer && this.outlinePipeline) {
                renderPass.setPipeline(this.outlinePipeline);
                renderPass.setBindGroup(0, this.bindGroup);
                renderPass.setVertexBuffer(0, this.outlineVertexBuffer);
                renderPass.draw(this.outlineVertexCount);
            }
        }
    }
}
