export async function initWebGPU(canvas) {
    if (!navigator.gpu) {
        throw new Error('WebGPU not supported');
    }
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
    });
    if (!adapter) {
        throw new Error('No WebGPU adapter found');
    }
    // Request generous limits for large graphs
    const requiredLimits = {};
    const want = (key, value) => {
        const supported = adapter.limits[key];
        requiredLimits[key] = Math.min(value, supported);
    };
    want('maxStorageBufferBindingSize', 256 * 1024 * 1024); // 256MB
    want('maxBufferSize', 256 * 1024 * 1024);
    want('maxComputeWorkgroupSizeX', 256);
    want('maxComputeInvocationsPerWorkgroup', 256);
    want('maxStorageBuffersPerShaderStage', 8);
    // Feature detection: timestamp-query, subgroups
    const requiredFeatures = [];
    const supportsTimestampQuery = adapter.features.has('timestamp-query');
    if (supportsTimestampQuery) {
        requiredFeatures.push('timestamp-query');
    }
    if (adapter.features.has('subgroups')) {
        requiredFeatures.push('subgroups');
    }
    const device = await adapter.requestDevice({ requiredLimits, requiredFeatures });
    device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message);
        if (info.reason !== 'destroyed') {
            // Could auto-reinitialize here
            console.warn('Attempting recovery would go here');
        }
    });
    const context = canvas.getContext('webgpu');
    if (!context) {
        throw new Error('Failed to get WebGPU canvas context');
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
    });
    return { device, context, format, canvas, supportsTimestampQuery, features: device.features };
}
