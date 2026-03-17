export declare function createSlider(opts: {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
    logarithmic?: boolean;
    tooltip?: string;
}): HTMLElement;
export declare function createToggle(opts: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
}): HTMLElement;
export declare function createButton(opts: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
}): HTMLElement;
export declare function createInfoDisplay(label: string, value: string): {
    el: HTMLElement;
    update(value: string): void;
};
export declare function createFileDropZone(opts: {
    label: string;
    accept: string;
    onFile: (file: File) => void;
}): HTMLElement;
export declare function createColorPresets(opts: {
    label: string;
    onChange: (color: [number, number, number, number]) => void;
}): HTMLElement;
export declare function createSelect(opts: {
    label: string;
    options: {
        value: string;
        label: string;
    }[];
    value: string;
    onChange: (value: string) => void;
}): HTMLElement;
export declare function createSectionHeader(text: string): HTMLElement;
