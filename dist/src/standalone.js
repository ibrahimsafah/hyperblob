import { HyperblobEngine } from './lib';
import { parseCSV } from './data/csv-parser';
import { tabularToHypergraph } from './data/tabular-to-hypergraph';
let engine = null;
let csv = null;
// ── Bootstrap ──
async function main() {
    const canvas = document.getElementById('gpu-canvas');
    if (!canvas)
        throw new Error('Canvas not found');
    try {
        engine = await HyperblobEngine.create(canvas, { tooltip: true });
        engine.start();
        buildPanel();
    }
    catch (err) {
        console.error('Init failed:', err);
        const overlay = document.getElementById('error-overlay');
        if (overlay)
            overlay.classList.add('visible');
    }
}
// ── Panel UI ──
function buildPanel() {
    const panel = document.getElementById('panel');
    panel.innerHTML = '';
    const title = el('div', 'sa-title', 'Hyperblob');
    panel.appendChild(title);
    const scroll = el('div', 'sa-scroll');
    panel.appendChild(scroll);
    // Data source section
    scroll.appendChild(sectionHeader('Load Data'));
    const dropZone = el('div', 'sa-drop-zone');
    const dropLabel = el('div', 'sa-drop-label', 'Drop CSV here or click to upload');
    const dropHint = el('div', 'sa-drop-hint', 'Comma-separated with a header row');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.tsv,.txt';
    fileInput.className = 'sa-file-input';
    dropZone.append(dropLabel, dropHint, fileInput);
    scroll.appendChild(dropZone);
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer?.files[0];
        if (file)
            readFile(file);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files?.[0])
            readFile(fileInput.files[0]);
    });
    // Paste area
    const pasteArea = document.createElement('textarea');
    pasteArea.className = 'sa-paste';
    pasteArea.placeholder = 'Or paste CSV data here...';
    pasteArea.rows = 4;
    scroll.appendChild(pasteArea);
    const pasteBtn = el('button', 'sa-btn sa-btn-default', 'Parse pasted data');
    pasteBtn.addEventListener('click', () => {
        if (pasteArea.value.trim()) {
            loadCSV(pasteArea.value);
        }
    });
    scroll.appendChild(pasteBtn);
    // Column mapper (hidden until data loads)
    const mapperSection = el('div', 'sa-mapper-section');
    mapperSection.style.display = 'none';
    scroll.appendChild(mapperSection);
    // Controls (hidden until data loads)
    const ctrlSection = el('div', 'sa-ctrl-section');
    ctrlSection.style.display = 'none';
    scroll.appendChild(ctrlSection);
    // Stash references
    panel.__mapper = mapperSection;
    panel.__ctrls = ctrlSection;
}
function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            loadCSV(reader.result);
        }
    };
    reader.readAsText(file);
}
function loadCSV(text) {
    csv = parseCSV(text);
    if (csv.headers.length === 0 || csv.rows.length === 0) {
        alert('No data found. Ensure CSV has a header row and at least one data row.');
        return;
    }
    buildMapper();
}
// ── Column Mapper ──
function buildMapper() {
    if (!csv)
        return;
    const panel = document.getElementById('panel');
    const section = panel.__mapper;
    const ctrlSection = panel.__ctrls;
    section.innerHTML = '';
    section.style.display = '';
    section.appendChild(sectionHeader(`Columns (${csv.headers.length} cols, ${csv.rows.length} rows)`));
    // Node ID selector
    const nodeRow = el('div', 'sa-field');
    const nodeLabel = el('label', 'sa-label', 'Node ID column');
    const nodeSelect = document.createElement('select');
    nodeSelect.className = 'sa-select';
    for (let i = 0; i < csv.headers.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = csv.headers[i];
        nodeSelect.appendChild(opt);
    }
    nodeRow.append(nodeLabel, nodeSelect);
    section.appendChild(nodeRow);
    // Hyperedge column toggles
    section.appendChild(sectionHeader('Hyperedge columns'));
    const hint = el('div', 'sa-hint', 'Each unique value in a selected column becomes a hyperedge grouping its rows.');
    section.appendChild(hint);
    const checkboxes = [];
    for (let i = 0; i < csv.headers.length; i++) {
        const row = el('div', 'sa-check-row');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `col-${i}`;
        cb.dataset.col = String(i);
        const lbl = document.createElement('label');
        lbl.htmlFor = `col-${i}`;
        lbl.className = 'sa-check-label';
        // Show sample unique values
        const unique = new Set(csv.rows.map(r => r[i]).filter(Boolean));
        const sample = Array.from(unique).slice(0, 3).join(', ');
        const more = unique.size > 3 ? ` +${unique.size - 3}` : '';
        lbl.textContent = `${csv.headers[i]}`;
        const sampleSpan = el('span', 'sa-sample', `${unique.size} unique: ${sample}${more}`);
        row.append(cb, lbl, sampleSpan);
        section.appendChild(row);
        checkboxes.push(cb);
    }
    // Visualize button
    const vizBtn = el('button', 'sa-btn sa-btn-primary', 'Visualize');
    vizBtn.addEventListener('click', () => {
        const nodeCol = parseInt(nodeSelect.value);
        const edgeCols = checkboxes
            .filter(cb => cb.checked)
            .map(cb => parseInt(cb.dataset.col))
            .filter(c => c !== nodeCol);
        if (edgeCols.length === 0) {
            alert('Select at least one hyperedge column (different from the node column).');
            return;
        }
        const mapping = { nodeColumn: nodeCol, edgeColumns: edgeCols };
        const data = tabularToHypergraph(csv, mapping);
        visualize(data, ctrlSection);
    });
    section.appendChild(vizBtn);
}
// ── Visualize ──
async function visualize(data, ctrlSection) {
    if (!engine)
        return;
    engine.setData(data);
    await engine.converge();
    // Show controls
    ctrlSection.innerHTML = '';
    ctrlSection.style.display = '';
    ctrlSection.appendChild(sectionHeader(`Graph: ${data.nodes.length} nodes, ${data.hyperedges.length} edges`));
    const btnRow = el('div', 'sa-btn-row');
    const convergeBtn = el('button', 'sa-btn sa-btn-default', 'Re-converge');
    convergeBtn.addEventListener('click', () => engine.converge());
    const resetBtn = el('button', 'sa-btn sa-btn-danger', 'Reset layout');
    resetBtn.addEventListener('click', () => {
        engine.resetSimulation();
    });
    const fitBtn = el('button', 'sa-btn sa-btn-default', 'Fit to screen');
    fitBtn.addEventListener('click', () => engine.fitToScreen());
    btnRow.append(convergeBtn, resetBtn, fitBtn);
    ctrlSection.appendChild(btnRow);
    // Hull mode toggle
    const modeRow = el('div', 'sa-field');
    const modeLabel = el('label', 'sa-label', 'Hull mode');
    const modeSelect = document.createElement('select');
    modeSelect.className = 'sa-select';
    for (const mode of ['metaball', 'convex']) {
        const opt = document.createElement('option');
        opt.value = mode;
        opt.textContent = mode;
        if (mode === engine.renderParams.hullMode)
            opt.selected = true;
        modeSelect.appendChild(opt);
    }
    modeSelect.addEventListener('change', () => {
        engine.renderParams.hullMode = modeSelect.value;
    });
    modeRow.append(modeLabel, modeSelect);
    ctrlSection.appendChild(modeRow);
}
// ── DOM Helpers ──
function el(tag, className, text) {
    const e = document.createElement(tag);
    e.className = className;
    if (text)
        e.textContent = text;
    return e;
}
function sectionHeader(text) {
    return el('div', 'sa-section-header', text);
}
main();
