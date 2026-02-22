export interface LODState {
  showEdges: boolean;
  edgeSampleRate: number;
  showHulls: boolean;
  showLabels: boolean;
  nodeMinSize: number;
}

export class LODController {
  update(zoom: number, _nodeCount: number): LODState {
    // Edges: hide at extreme zoom-out, sample at medium, full at close range
    let showEdges = true;
    let edgeSampleRate = 1.0;
    if (zoom < 0.01) {
      showEdges = false;
      edgeSampleRate = 0;
    } else if (zoom < 0.1) {
      edgeSampleRate = 0.1;
    }

    // Hulls: hide at extreme zoom-out
    const showHulls = zoom >= 0.02;

    // Labels: only at high zoom
    const showLabels = zoom > 5;

    // Node size: shrink at extreme zoom-out for clarity
    let nodeMinSize = 1.0;
    if (zoom < 0.01) {
      nodeMinSize = 0.5;
    } else if (zoom < 0.05) {
      nodeMinSize = 0.75;
    }

    return {
      showEdges,
      edgeSampleRate,
      showHulls,
      showLabels,
      nodeMinSize,
    };
  }
}
