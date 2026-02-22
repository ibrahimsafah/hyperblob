import type { HypergraphData } from '../../data/types';
import {
  createSlider,
  createButton,
  createInfoDisplay,
  createFileDropZone,
  createSectionHeader,
} from '../controls';

export function createDataTab(
  onLoadFile: (data: HypergraphData) => void,
  onGenerate: (nodeCount: number, heCount: number, maxSize: number) => void,
): { el: HTMLElement; updateDataInfo(data: HypergraphData): void } {
  const tab = document.createElement('div');
  tab.className = 'panel-tab-content';

  // -- Info section --
  tab.appendChild(createSectionHeader('Current Data'));

  const nodeInfo = createInfoDisplay('Nodes', '--');
  const edgeInfo = createInfoDisplay('Hyperedges', '--');
  const avgInfo = createInfoDisplay('Avg. Edge Size', '--');

  tab.appendChild(nodeInfo.el);
  tab.appendChild(edgeInfo.el);
  tab.appendChild(avgInfo.el);

  // -- Import section --
  tab.appendChild(createSectionHeader('Import HIF JSON'));

  const dropZone = createFileDropZone({
    label: 'HIF JSON File',
    accept: '.json',
    onFile: async (file: File) => {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        // Dynamic import — module built by another agent, may not exist yet
        const hifPath = '../../data/hif-loader';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hifLoader: any = await import(/* @vite-ignore */ hifPath);
        const parseHIF = hifLoader.parseHIF as (doc: unknown) => HypergraphData;
        const data = parseHIF(json);
        onLoadFile(data);
      } catch (err) {
        console.error('Failed to parse HIF file:', err);
      }
    },
  });
  tab.appendChild(dropZone);

  // -- Generate section --
  tab.appendChild(createSectionHeader('Generate Random'));

  let nodeCount = 500;
  let heCount = 100;
  let maxSize = 6;

  tab.appendChild(createSlider({
    label: 'Node Count',
    min: 100,
    max: 1000000,
    step: 1,
    value: nodeCount,
    onChange: (v) => { nodeCount = v; },
    logarithmic: true,
  }));

  tab.appendChild(createSlider({
    label: 'Hyperedge Count',
    min: 10,
    max: 100000,
    step: 1,
    value: heCount,
    onChange: (v) => { heCount = v; },
    logarithmic: true,
  }));

  tab.appendChild(createSlider({
    label: 'Max Edge Size',
    min: 2,
    max: 50,
    step: 1,
    value: maxSize,
    onChange: (v) => { maxSize = v; },
  }));

  tab.appendChild(createButton({
    label: 'Generate',
    variant: 'primary',
    onClick: () => onGenerate(nodeCount, heCount, maxSize),
  }));

  return {
    el: tab,
    updateDataInfo(data: HypergraphData) {
      nodeInfo.update(data.nodes.length.toLocaleString());
      edgeInfo.update(data.hyperedges.length.toLocaleString());

      if (data.hyperedges.length > 0) {
        const totalSize = data.hyperedges.reduce((sum, he) => sum + he.memberIndices.length, 0);
        const avg = totalSize / data.hyperedges.length;
        avgInfo.update(avg.toFixed(1));
      } else {
        avgInfo.update('--');
      }
    },
  };
}
