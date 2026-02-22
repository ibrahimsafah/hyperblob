import type { Camera } from '../../render/camera';
import { createButton, createInfoDisplay, createSectionHeader } from '../controls';

export function createCameraTab(
  camera: Camera,
  onFitToScreen: () => void,
): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'panel-tab-content';

  // -- Info section --
  tab.appendChild(createSectionHeader('View Info'));

  const zoomInfo = createInfoDisplay('Zoom', camera.zoom.toFixed(3));
  const centerXInfo = createInfoDisplay('Center X', camera.center[0].toFixed(1));
  const centerYInfo = createInfoDisplay('Center Y', camera.center[1].toFixed(1));

  tab.appendChild(zoomInfo.el);
  tab.appendChild(centerXInfo.el);
  tab.appendChild(centerYInfo.el);

  // Update periodically
  setInterval(() => {
    zoomInfo.update(camera.zoom.toFixed(3));
    centerXInfo.update(camera.center[0].toFixed(1));
    centerYInfo.update(camera.center[1].toFixed(1));
  }, 150);

  // -- Actions section --
  tab.appendChild(createSectionHeader('Actions'));

  const btnRow = document.createElement('div');
  btnRow.className = 'ctrl-btn-row';

  btnRow.appendChild(createButton({
    label: 'Fit to Screen',
    variant: 'primary',
    onClick: onFitToScreen,
  }));

  btnRow.appendChild(createButton({
    label: 'Reset Zoom',
    variant: 'default',
    onClick: () => {
      camera.center[0] = 0;
      camera.center[1] = 0;
      camera.zoomAt(
        camera.getViewportWidth() / 2,
        camera.getViewportHeight() / 2,
        1.0 / camera.zoom,
      );
    },
  }));

  tab.appendChild(btnRow);

  // -- Export section --
  tab.appendChild(createSectionHeader('Export'));

  tab.appendChild(createButton({
    label: 'Export as PNG',
    variant: 'default',
    onClick: () => {
      const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hypergraph.png';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    },
  }));

  return tab;
}
