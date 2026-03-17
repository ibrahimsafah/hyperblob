// GPU timestamp profiler — per-stage compute pass timing
// No-ops when timestamp-query feature is unavailable (zero overhead)
const MAX_QUERIES = 64;
const LOG_INTERVAL = 60; // frames between console logs
export class GPUProfiler {
    enabled;
    querySet = null;
    resolveBuffer = null;
    readbackBuffer = null;
    // Per-frame state
    queryIndex = 0;
    stages = [];
    // Readback state
    mapping = false;
    latestTimings = null;
    frameCount = 0;
    constructor(device, supportsTimestampQuery) {
        this.enabled = supportsTimestampQuery;
        if (!this.enabled)
            return;
        this.querySet = device.createQuerySet({
            type: 'timestamp',
            count: MAX_QUERIES,
        });
        this.resolveBuffer = device.createBuffer({
            label: 'profiler-resolve',
            size: MAX_QUERIES * 8, // u64 per query
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });
        this.readbackBuffer = device.createBuffer({
            label: 'profiler-readback',
            size: MAX_QUERIES * 8,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
    }
    beginFrame() {
        if (!this.enabled)
            return;
        this.queryIndex = 0;
        this.stages.length = 0;
    }
    timestampWrites(stage) {
        if (!this.enabled || !this.querySet)
            return undefined;
        if (this.queryIndex + 2 > MAX_QUERIES)
            return undefined;
        const begin = this.queryIndex;
        const end = this.queryIndex + 1;
        this.queryIndex += 2;
        this.stages.push(stage);
        return {
            querySet: this.querySet,
            beginningOfPassWriteIndex: begin,
            endOfPassWriteIndex: end,
        };
    }
    resolve(encoder) {
        if (!this.enabled || !this.querySet || !this.resolveBuffer || !this.readbackBuffer)
            return;
        if (this.queryIndex === 0)
            return;
        encoder.resolveQuerySet(this.querySet, 0, this.queryIndex, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readbackBuffer, 0, this.queryIndex * 8);
    }
    async readback() {
        if (!this.enabled || !this.readbackBuffer || this.mapping)
            return null;
        if (this.queryIndex === 0)
            return null;
        const stageCount = this.stages.length;
        const stagesCopy = this.stages.slice();
        this.mapping = true;
        try {
            await this.readbackBuffer.mapAsync(GPUMapMode.READ, 0, stageCount * 2 * 8);
            const data = new BigUint64Array(this.readbackBuffer.getMappedRange(0, stageCount * 2 * 8));
            // Sum by stage label
            const stageMap = new Map();
            for (let i = 0; i < stageCount; i++) {
                const begin = data[i * 2];
                const end = data[i * 2 + 1];
                const ns = Number(end - begin);
                const stage = stagesCopy[i];
                stageMap.set(stage, (stageMap.get(stage) ?? 0) + ns);
            }
            this.readbackBuffer.unmap();
            const timings = [];
            for (const [stage, ns] of stageMap) {
                timings.push({ stage, ms: ns / 1_000_000 });
            }
            this.latestTimings = timings;
            // Periodic logging
            this.frameCount++;
            if (this.frameCount % LOG_INTERVAL === 0) {
                const parts = timings.map(t => `${t.stage}: ${t.ms.toFixed(3)}ms`);
                console.log(`[GPUProfiler] ${parts.join(' | ')}`);
            }
            return timings;
        }
        catch {
            // mapAsync can fail if device is lost or buffer is already mapped
            return null;
        }
        finally {
            this.mapping = false;
        }
    }
    getLatestTimings() {
        return this.latestTimings;
    }
    destroy() {
        this.querySet?.destroy();
        this.resolveBuffer?.destroy();
        this.readbackBuffer?.destroy();
        this.querySet = null;
        this.resolveBuffer = null;
        this.readbackBuffer = null;
    }
}
