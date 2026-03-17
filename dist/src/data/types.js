// ── HIF (Hypergraph Interchange Format) types ──
export function defaultSimulationParams() {
    return {
        repulsionStrength: -300,
        attractionStrength: 0.03,
        linkDistance: 50,
        centerStrength: 0.015,
        velocityDecay: 0.6,
        energy: 1.0,
        idleEnergy: 0.02,
        coolingRate: 0.0228, // ~300 iterations to stopThreshold
        stopThreshold: 0.001,
        theta: 0.9,
        running: true,
    };
}
export function defaultRenderParams() {
    return {
        nodeBaseSize: 10,
        edgeOpacity: 0.15,
        hullAlpha: 0.25,
        hullOutline: false,
        hullMargin: 3,
        hullSmoothing: 4,
        hullMode: 'metaball',
        hullMetaballThreshold: 0.5,
        nodeDarkMode: true,
        backgroundColor: [0.97, 0.97, 0.98, 1.0],
    };
}
