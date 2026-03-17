import shaderCode from '../shaders/boundary-render.wgsl?raw';
const SEGMENTS = 128;
const FLOATS_PER_VERTEX = 6; // xy + rgba
const MAX_VERTICES = (SEGMENTS + 1) * 2; // triangle-strip ring
const BUFFER_SIZE = MAX_VERTICES * FLOATS_PER_VERTEX * 4;
/**
 * Renders a circular boundary ring around the graph.
 * Uses triangle-strip topology: alternating inner/outer vertices form a ring.
 */
export class BoundaryRenderer {
    gpu;
    camera;
    pipeline;
    bindGroup;
    cameraBuffer;
    vertexBuffer;
    vertexCount = 0;
    lastCameraVersion = -1;
    // Cached boundary state
    centerX = 0;
    centerY = 0;
    radius = 0;
    constructor(gpu, camera) {
        this.gpu = gpu;
        this.camera = camera;
        const { device, format } = gpu;
        // Camera uniform
        this.cameraBuffer = device.createBuffer({
            label: 'boundary-camera',
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Vertex buffer
        this.vertexBuffer = device.createBuffer({
            label: 'boundary-vertices',
            size: BUFFER_SIZE,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        // Shader
        const shaderModule = device.createShaderModule({
            label: 'boundary-shader',
            code: shaderCode,
        });
        // Bind group layout + pipeline
        const bgl = device.createBindGroupLayout({
            label: 'boundary-bgl',
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
            ],
        });
        const vertexBufferLayout = {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x4' },
            ],
        };
        this.pipeline = device.createRenderPipeline({
            label: 'boundary-pipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
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
            primitive: { topology: 'triangle-strip' },
        });
        this.bindGroup = device.createBindGroup({
            label: 'boundary-bind-group',
            layout: bgl,
            entries: [
                { binding: 0, resource: { buffer: this.cameraBuffer } },
            ],
        });
    }
    /**
     * Recompute boundary circle from current node positions.
     * Finds the bounding circle (centroid + max distance) and adds padding.
     */
    updateFromPositions(positions, nodeCount, nodeBaseSize) {
        if (nodeCount === 0) {
            this.vertexCount = 0;
            return;
        }
        // Compute centroid
        let cx = 0, cy = 0;
        for (let i = 0; i < nodeCount; i++) {
            cx += positions[i * 4];
            cy += positions[i * 4 + 1];
        }
        cx /= nodeCount;
        cy /= nodeCount;
        // Find max distance from centroid
        let maxDist = 0;
        for (let i = 0; i < nodeCount; i++) {
            const dx = positions[i * 4] - cx;
            const dy = positions[i * 4 + 1] - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDist)
                maxDist = dist;
        }
        // Add padding: node size + 15% margin
        const radius = maxDist + nodeBaseSize * 2 + maxDist * 0.15;
        // Skip rebuild if boundary hasn't changed significantly
        if (Math.abs(radius - this.radius) < 1 &&
            Math.abs(cx - this.centerX) < 1 &&
            Math.abs(cy - this.centerY) < 1) {
            return;
        }
        this.centerX = cx;
        this.centerY = cy;
        this.radius = radius;
        this.buildRing(cx, cy, radius);
    }
    buildRing(cx, cy, outerR) {
        // Ring width scales with radius but stays visually subtle
        const ringWidth = Math.max(outerR * 0.004, 0.5);
        const innerR = outerR - ringWidth;
        const color = [0.7, 0.7, 0.75, 0.25];
        const data = new Float32Array((SEGMENTS + 1) * 2 * FLOATS_PER_VERTEX);
        for (let i = 0; i <= SEGMENTS; i++) {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const base = i * 2 * FLOATS_PER_VERTEX;
            // Outer vertex
            data[base + 0] = cx + cos * outerR;
            data[base + 1] = cy + sin * outerR;
            data[base + 2] = color[0];
            data[base + 3] = color[1];
            data[base + 4] = color[2];
            data[base + 5] = color[3];
            // Inner vertex
            data[base + 6] = cx + cos * innerR;
            data[base + 7] = cy + sin * innerR;
            data[base + 8] = color[0];
            data[base + 9] = color[1];
            data[base + 10] = color[2];
            data[base + 11] = color[3];
        }
        this.gpu.device.queue.writeBuffer(this.vertexBuffer, 0, data);
        this.vertexCount = (SEGMENTS + 1) * 2;
    }
    render(renderPass) {
        if (this.vertexCount === 0)
            return;
        if (this.camera.version !== this.lastCameraVersion) {
            this.lastCameraVersion = this.camera.version;
            this.gpu.device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());
        }
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.draw(this.vertexCount);
    }
}
