import { createSlider, createToggle, createColorPresets, createSectionHeader, createSelect } from '../controls';
export function createRenderingTab(renderParams) {
    const tab = document.createElement('div');
    tab.className = 'panel-tab-content';
    // -- Nodes section --
    tab.appendChild(createSectionHeader('Nodes'));
    tab.appendChild(createSlider({
        label: 'Node Size',
        min: 1,
        max: 30,
        step: 0.5,
        value: renderParams.nodeBaseSize,
        onChange: (v) => { renderParams.nodeBaseSize = v; },
        tooltip: 'Radius of each node circle in pixels.',
    }));
    tab.appendChild(createToggle({
        label: 'Dark Nodes',
        value: renderParams.nodeDarkMode,
        onChange: (v) => { renderParams.nodeDarkMode = v; },
    }));
    // -- Edges section --
    tab.appendChild(createSectionHeader('Edges'));
    tab.appendChild(createSlider({
        label: 'Edge Opacity',
        min: 0,
        max: 1,
        step: 0.05,
        value: renderParams.edgeOpacity,
        onChange: (v) => { renderParams.edgeOpacity = v; },
        tooltip: 'Opacity of hyperedge lines connecting member nodes to their shared center.',
    }));
    // -- Hulls section --
    tab.appendChild(createSectionHeader('Hulls'));
    tab.appendChild(createSelect({
        label: 'Hull Mode',
        options: [
            { value: 'convex', label: 'Convex' },
            { value: 'metaball', label: 'Metaball' },
        ],
        value: renderParams.hullMode,
        onChange: (v) => { renderParams.hullMode = v; },
    }));
    tab.appendChild(createSlider({
        label: 'Blob Threshold',
        min: 0.1,
        max: 1.5,
        step: 0.05,
        value: renderParams.hullMetaballThreshold,
        onChange: (v) => { renderParams.hullMetaballThreshold = v; },
        tooltip: 'Field value cutoff for metaball blobs. Lower = larger blobs, higher = tighter around nodes.',
    }));
    tab.appendChild(createSlider({
        label: 'Hull Alpha',
        min: 0,
        max: 0.8,
        step: 0.01,
        value: renderParams.hullAlpha,
        onChange: (v) => { renderParams.hullAlpha = v; },
        tooltip: 'Transparency of hull/blob fills. 0 = invisible, 0.8 = nearly opaque.',
    }));
    tab.appendChild(createSlider({
        label: 'Hull Margin',
        min: 0,
        max: 80,
        step: 1,
        value: renderParams.hullMargin,
        onChange: (v) => { renderParams.hullMargin = v; },
        tooltip: 'Padding around nodes for hull computation. In metaball mode, controls the Gaussian sigma.',
    }));
    tab.appendChild(createSlider({
        label: 'Hull Smoothing',
        min: 0,
        max: 5,
        step: 1,
        value: renderParams.hullSmoothing,
        onChange: (v) => { renderParams.hullSmoothing = v; },
        tooltip: 'Chaikin smoothing iterations for convex hull outlines. Only affects convex mode.',
    }));
    tab.appendChild(createToggle({
        label: 'Hull Outline',
        value: renderParams.hullOutline,
        onChange: (v) => { renderParams.hullOutline = v; },
    }));
    // -- Background section --
    tab.appendChild(createSectionHeader('Background'));
    tab.appendChild(createColorPresets({
        label: 'Background Color',
        onChange: (color) => {
            renderParams.backgroundColor[0] = color[0];
            renderParams.backgroundColor[1] = color[1];
            renderParams.backgroundColor[2] = color[2];
            renderParams.backgroundColor[3] = color[3];
        },
    }));
    return tab;
}
