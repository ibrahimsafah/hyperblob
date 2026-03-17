import type { Camera } from '../../render/camera';
export declare function createCameraTab(camera: Camera, onFitToScreen: () => void): {
    el: HTMLElement;
    dispose: () => void;
};
