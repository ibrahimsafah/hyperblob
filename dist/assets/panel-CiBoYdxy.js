function u(e){const t=document.createElement("div");t.className="ctrl-slider",e.tooltip&&(t.title=e.tooltip);const n=document.createElement("div");n.className="ctrl-slider-header";const o=document.createElement("span");o.className="ctrl-label",o.textContent=e.label;const a=document.createElement("span");a.className="ctrl-value",n.appendChild(o),n.appendChild(a);const l=document.createElement("input");if(l.type="range",l.className="ctrl-range",e.logarithmic){const c=Math.log10(Math.max(e.min,1)),d=Math.log10(e.max);l.min="0",l.max="1000",l.step="1";const p=r=>{const i=Math.log10(Math.max(r,1));return Math.round((i-c)/(d-c)*1e3)},h=r=>{const i=c+r/1e3*(d-c);return Math.round(Math.pow(10,i))};l.value=String(p(e.value)),a.textContent=k(e.value),l.addEventListener("input",()=>{const r=h(Number(l.value));a.textContent=k(r),e.onChange(r)})}else l.min=String(e.min),l.max=String(e.max),l.step=String(e.step),l.value=String(e.value),a.textContent=y(e.value,e.step),l.addEventListener("input",()=>{const c=Number(l.value);a.textContent=y(c,e.step),e.onChange(c)});return t.appendChild(n),t.appendChild(l),t}function v(e){const t=document.createElement("div");t.className="ctrl-toggle";const n=document.createElement("span");n.className="ctrl-label",n.textContent=e.label;const o=document.createElement("button");o.className="ctrl-toggle-btn",o.setAttribute("role","switch"),o.setAttribute("aria-checked",String(e.value));const a=document.createElement("span");a.className="ctrl-toggle-knob",o.appendChild(a);const l=d=>{o.setAttribute("aria-checked",String(d)),o.classList.toggle("active",d)};l(e.value);let c=e.value;return o.addEventListener("click",()=>{c=!c,l(c),e.onChange(c)}),t.appendChild(n),t.appendChild(o),t}function x(e){const t=document.createElement("button");return t.className=`ctrl-btn ctrl-btn-${e.variant??"default"}`,t.textContent=e.label,t.addEventListener("click",e.onClick),t}function C(e,t){const n=document.createElement("div");n.className="ctrl-info";const o=document.createElement("span");o.className="ctrl-label",o.textContent=e;const a=document.createElement("span");return a.className="ctrl-info-value",a.textContent=t,n.appendChild(o),n.appendChild(a),{el:n,update(l){a.textContent=l}}}function w(e){const t=document.createElement("div");t.className="ctrl-drop-zone";const n=document.createElement("div");n.className="ctrl-drop-label",n.textContent=e.label;const o=document.createElement("div");o.className="ctrl-drop-hint",o.textContent="Drag & drop or click to browse";const a=document.createElement("input");return a.type="file",a.accept=e.accept,a.className="ctrl-drop-input",a.addEventListener("change",()=>{a.files&&a.files.length>0&&(e.onFile(a.files[0]),a.value="")}),t.addEventListener("click",()=>a.click()),t.addEventListener("dragover",l=>{l.preventDefault(),t.classList.add("dragover")}),t.addEventListener("dragleave",()=>{t.classList.remove("dragover")}),t.addEventListener("drop",l=>{if(l.preventDefault(),t.classList.remove("dragover"),l.dataTransfer?.files&&l.dataTransfer.files.length>0){const c=l.dataTransfer.files[0];c.name.endsWith(".json")&&e.onFile(c)}}),t.appendChild(n),t.appendChild(o),t.appendChild(a),t}function N(e){const t=document.createElement("div");t.className="ctrl-color-presets";const n=document.createElement("span");n.className="ctrl-label",n.textContent=e.label;const o=[{name:"Light",color:[.97,.97,.98,1],hex:"#f7f7fa"},{name:"Dark",color:[.04,.04,.06,1],hex:"#0a0a0f"},{name:"Midnight",color:[.06,.06,.12,1],hex:"#0f0f1f"},{name:"Ocean",color:[.04,.08,.14,1],hex:"#0a1424"}],a=document.createElement("div");a.className="ctrl-color-swatches";for(const l of o){const c=document.createElement("button");c.className="ctrl-color-swatch",c.style.backgroundColor=l.hex,c.title=l.name,c.addEventListener("click",()=>{a.querySelectorAll(".ctrl-color-swatch").forEach(d=>d.classList.remove("active")),c.classList.add("active"),e.onChange(l.color)}),a.appendChild(c)}return a.children[0]?.classList.add("active"),t.appendChild(n),t.appendChild(a),t}function S(e){const t=document.createElement("div");t.className="ctrl-select";const n=document.createElement("span");n.className="ctrl-label",n.textContent=e.label;const o=document.createElement("select");o.className="ctrl-select-input";for(const a of e.options){const l=document.createElement("option");l.value=a.value,l.textContent=a.label,a.value===e.value&&(l.selected=!0),o.appendChild(l)}return o.addEventListener("change",()=>{e.onChange(o.value)}),t.appendChild(n),t.appendChild(o),t}function g(e){const t=document.createElement("div");return t.className="ctrl-section-header",t.textContent=e,t}function y(e,t){if(t>=1)return String(Math.round(e));const n=Math.max(0,-Math.floor(Math.log10(t)));return e.toFixed(n)}function k(e){return e>=1e6?(e/1e6).toFixed(1)+"M":e>=1e3?(e/1e3).toFixed(1)+"K":String(e)}function L(e,t,n){const o=document.createElement("div");o.className="panel-tab-content",o.appendChild(g("Playback"));const a=document.createElement("div");a.className="ctrl-btn-row";const l=x({label:e.running?"Pause":"Play",variant:"primary",onClick:()=>{e.running=!e.running,l.textContent=e.running?"Pause":"Play",t(e.running)}}),c=x({label:"Reset",variant:"danger",onClick:()=>{e.running=!0,l.textContent="Pause",n()}});a.appendChild(l),a.appendChild(c),o.appendChild(a);const d=document.createElement("div");d.className="ctrl-alpha-bar";const p=document.createElement("span");p.className="ctrl-label",p.textContent="Energy";const h=document.createElement("div");h.className="ctrl-alpha-track";const r=document.createElement("div");r.className="ctrl-alpha-fill",r.style.width=`${(e.energy*100).toFixed(0)}%`;const i=document.createElement("span");i.className="ctrl-value",i.textContent=e.energy.toFixed(3),h.appendChild(r);const b=document.createElement("div");b.className="ctrl-slider-header",b.appendChild(p),b.appendChild(i),d.appendChild(b),d.appendChild(h),o.appendChild(d);const m=setInterval(()=>{r.style.width=`${Math.min(100,e.energy*100).toFixed(0)}%`,i.textContent=e.energy.toFixed(3)},100),f=()=>{clearInterval(m)};return o.appendChild(g("Forces")),o.appendChild(u({label:"Repulsion",min:-1e3,max:0,step:10,value:e.repulsionStrength,onChange:s=>{e.repulsionStrength=s},tooltip:"Negative charge between nodes — pushes them apart. Stronger = more spread out."})),o.appendChild(u({label:"Attraction",min:0,max:.2,step:.005,value:e.attractionStrength,onChange:s=>{e.attractionStrength=s},tooltip:"Spring force pulling hyperedge members toward their shared center."})),o.appendChild(u({label:"Link Distance",min:10,max:200,step:5,value:e.linkDistance,onChange:s=>{e.linkDistance=s},tooltip:"Ideal distance between connected nodes. Springs rest at this length."})),o.appendChild(u({label:"Center Gravity",min:0,max:.1,step:.002,value:e.centerStrength,onChange:s=>{e.centerStrength=s},tooltip:"Gentle pull toward the center of the viewport. Prevents drift."})),o.appendChild(u({label:"Velocity Decay",min:0,max:1,step:.05,value:e.velocityDecay,onChange:s=>{e.velocityDecay=s},tooltip:"Friction — 0 = frozen, 1 = no damping. Controls how quickly nodes slow down."})),o.appendChild(u({label:"Theta (BH)",min:.3,max:2,step:.1,value:e.theta,onChange:s=>{e.theta=s},tooltip:"Barnes-Hut accuracy. Lower = more accurate forces but slower. 0.9 is a good balance."})),o.appendChild(u({label:"Cooling Rate",min:0,max:.1,step:.001,value:e.coolingRate,onChange:s=>{e.coolingRate=s},tooltip:"How fast the simulation cools down. Higher = settles faster but may miss optimal layout."})),o.appendChild(u({label:"Idle Energy",min:0,max:.1,step:.005,value:e.idleEnergy,onChange:s=>{e.idleEnergy=s,e.energy<s&&(e.energy=s,e.running=!0)},tooltip:"Minimum energy the simulation settles to. Higher = nodes keep jiggling slightly."})),{el:o,dispose:f}}function F(e){const t=document.createElement("div");return t.className="panel-tab-content",t.appendChild(g("Nodes")),t.appendChild(u({label:"Node Size",min:1,max:30,step:.5,value:e.nodeBaseSize,onChange:n=>{e.nodeBaseSize=n},tooltip:"Radius of each node circle in pixels."})),t.appendChild(v({label:"Dark Nodes",value:e.nodeDarkMode,onChange:n=>{e.nodeDarkMode=n}})),t.appendChild(g("Edges")),t.appendChild(u({label:"Edge Opacity",min:0,max:1,step:.05,value:e.edgeOpacity,onChange:n=>{e.edgeOpacity=n},tooltip:"Opacity of hyperedge lines connecting member nodes to their shared center."})),t.appendChild(g("Hulls")),t.appendChild(S({label:"Hull Mode",options:[{value:"convex",label:"Convex"},{value:"metaball",label:"Metaball"}],value:e.hullMode,onChange:n=>{e.hullMode=n}})),t.appendChild(u({label:"Blob Threshold",min:.1,max:1.5,step:.05,value:e.hullMetaballThreshold,onChange:n=>{e.hullMetaballThreshold=n},tooltip:"Field value cutoff for metaball blobs. Lower = larger blobs, higher = tighter around nodes."})),t.appendChild(u({label:"Hull Alpha",min:0,max:.8,step:.01,value:e.hullAlpha,onChange:n=>{e.hullAlpha=n},tooltip:"Transparency of hull/blob fills. 0 = invisible, 0.8 = nearly opaque."})),t.appendChild(u({label:"Hull Margin",min:0,max:80,step:1,value:e.hullMargin,onChange:n=>{e.hullMargin=n},tooltip:"Padding around nodes for hull computation. In metaball mode, controls the Gaussian sigma."})),t.appendChild(u({label:"Hull Smoothing",min:0,max:5,step:1,value:e.hullSmoothing,onChange:n=>{e.hullSmoothing=n},tooltip:"Chaikin smoothing iterations for convex hull outlines. Only affects convex mode."})),t.appendChild(v({label:"Hull Outline",value:e.hullOutline,onChange:n=>{e.hullOutline=n}})),t.appendChild(g("Background")),t.appendChild(N({label:"Background Color",onChange:n=>{e.backgroundColor[0]=n[0],e.backgroundColor[1]=n[1],e.backgroundColor[2]=n[2],e.backgroundColor[3]=n[3]}})),t}function T(e,t){const n=document.createElement("div");n.className="panel-tab-content",n.appendChild(g("Current Data"));const o=C("Nodes","--"),a=C("Hyperedges","--"),l=C("Avg. Edge Size","--");n.appendChild(o.el),n.appendChild(a.el),n.appendChild(l.el),n.appendChild(g("Import HIF JSON"));const c=w({label:"HIF JSON File",accept:".json",onFile:async r=>{try{const i=await r.text(),b=JSON.parse(i),s=(await import("../../data/hif-loader")).parseHIF,E=s(b);e(E)}catch(i){console.error("Failed to parse HIF file:",i)}}});n.appendChild(c),n.appendChild(g("Generate Random"));let d=500,p=100,h=6;return n.appendChild(u({label:"Node Count",min:100,max:1e6,step:1,value:d,onChange:r=>{d=r},logarithmic:!0})),n.appendChild(u({label:"Hyperedge Count",min:10,max:1e5,step:1,value:p,onChange:r=>{p=r},logarithmic:!0})),n.appendChild(u({label:"Max Edge Size",min:2,max:50,step:1,value:h,onChange:r=>{h=r}})),n.appendChild(x({label:"Generate",variant:"primary",onClick:()=>t(d,p,h)})),{el:n,updateDataInfo(r){if(o.update(r.nodes.length.toLocaleString()),a.update(r.hyperedges.length.toLocaleString()),r.hyperedges.length>0){const b=r.hyperedges.reduce((m,f)=>m+f.memberIndices.length,0)/r.hyperedges.length;l.update(b.toFixed(1))}else l.update("--")}}}function M(e,t){const n=document.createElement("div");n.className="panel-tab-content",n.appendChild(g("View Info"));const o=C("Zoom",e.zoom.toFixed(3)),a=C("Center X",e.center[0].toFixed(1)),l=C("Center Y",e.center[1].toFixed(1));n.appendChild(o.el),n.appendChild(a.el),n.appendChild(l.el);const c=setInterval(()=>{o.update(e.zoom.toFixed(3)),a.update(e.center[0].toFixed(1)),l.update(e.center[1].toFixed(1))},150),d=()=>{clearInterval(c)};n.appendChild(g("Actions"));const p=document.createElement("div");return p.className="ctrl-btn-row",p.appendChild(x({label:"Fit to Screen",variant:"primary",onClick:t})),p.appendChild(x({label:"Reset Zoom",variant:"default",onClick:()=>{e.center[0]=0,e.center[1]=0,e.zoomAt(e.getViewportWidth()/2,e.getViewportHeight()/2,1/e.zoom)}})),n.appendChild(p),n.appendChild(g("Export")),n.appendChild(x({label:"Export as PNG",variant:"default",onClick:()=>{const h=document.getElementById("gpu-canvas");h&&h.toBlob(r=>{if(!r)return;const i=URL.createObjectURL(r),b=document.createElement("a");b.href=i,b.download="hypergraph.png",b.click(),URL.revokeObjectURL(i)},"image/png")}})),{el:n,dispose:d}}class I{container;dataTabHandle=null;disposers=[];constructor(t,n){this.container=t,this.injectStyles(),this.build(n)}build(t){this.disposeTabTimers(),this.container.innerHTML="";const n=document.createElement("div");n.className="panel-title",n.textContent="Hyperblob",this.container.appendChild(n);const o=L(t.simParams,t.onSimulationToggle,t.onSimulationReset);this.disposers.push(o.dispose);const a=F(t.renderParams),l=T(t.onLoadFile,t.onGenerate);this.dataTabHandle=l;const c=M(t.camera,t.onFitToScreen);this.disposers.push(c.dispose);const d=[{label:"Simulation",content:o.el,defaultOpen:!0},{label:"Rendering",content:a,defaultOpen:!0},{label:"Data",content:l.el,defaultOpen:!1},{label:"Camera",content:c.el,defaultOpen:!1}],p=document.createElement("div");p.className="panel-sections";for(const h of d){const r=document.createElement("div");r.className="panel-section",h.defaultOpen&&r.classList.add("open");const i=document.createElement("div");i.className="panel-section-header";const b=document.createElement("span");b.className="panel-section-label",b.textContent=h.label;const m=document.createElement("span");m.className="panel-section-chevron",m.textContent="▶",i.appendChild(b),i.appendChild(m);const f=document.createElement("div");f.className="panel-section-body",f.appendChild(h.content),i.addEventListener("click",()=>{r.classList.toggle("open")}),r.appendChild(i),r.appendChild(f),p.appendChild(r)}this.container.appendChild(p)}updateDataInfo(t){this.dataTabHandle?.updateDataInfo(t)}dispose(){this.disposeTabTimers(),this.container.innerHTML="",this.dataTabHandle=null}disposeTabTimers(){for(const t of this.disposers)t();this.disposers=[]}injectStyles(){if(document.getElementById("panel-styles"))return;const t=document.createElement("style");t.id="panel-styles",t.textContent=z,document.head.appendChild(t)}}const z=`
/* ── Panel ── */
#panel {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  user-select: none;
  display: flex;
  flex-direction: column;
}

.panel-title {
  padding: 14px 16px 10px;
  font-size: 13px;
  font-weight: 600;
  color: #2a2a3e;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #e0e0e5;
}

/* ── Accordion Sections ── */
.panel-sections {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

.panel-section {
  border-bottom: 1px solid #e0e0e5;
}

.panel-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.panel-section-header:hover {
  background: #f0f0f5;
}

.panel-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #555570;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.panel-section.open .panel-section-label {
  color: #2a2a3e;
}

.panel-section-chevron {
  font-size: 8px;
  color: #999;
  transition: transform 0.25s ease;
}

.panel-section.open .panel-section-chevron {
  transform: rotate(90deg);
}

.panel-section-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.panel-section.open .panel-section-body {
  max-height: 600px;
}

.panel-section-body > * {
  padding: 0 14px 12px;
}

/* ── Section Header ── */
.ctrl-section-header {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888898;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e0e0e5;
}

.panel-section-body .ctrl-section-header:first-child {
  margin-top: 4px;
}

/* ── Slider ── */
.ctrl-slider {
  margin-bottom: 10px;
}

.ctrl-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.ctrl-label {
  color: #555570;
  font-size: 11px;
}

.ctrl-value {
  color: #333348;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ctrl-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: #e0e0e8;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.ctrl-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #5577cc;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: pointer;
  transition: background 0.15s;
}

.ctrl-range::-webkit-slider-thumb:hover {
  background: #6688dd;
}

.ctrl-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #5577cc;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: pointer;
}

/* ── Select ── */
.ctrl-select {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ctrl-select-input {
  font-family: inherit;
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid #d0d0d8;
  border-radius: 4px;
  background: #f8f8fa;
  color: #333348;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.ctrl-select-input:hover {
  border-color: #b0b0c0;
}

.ctrl-select-input:focus {
  border-color: #5577cc;
}

/* ── Toggle ── */
.ctrl-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ctrl-toggle-btn {
  position: relative;
  width: 36px;
  height: 20px;
  background: #d8d8e0;
  border: 1px solid #c0c0cc;
  border-radius: 10px;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s, border-color 0.2s;
}

.ctrl-toggle-btn.active {
  background: #5577cc;
  border-color: #5577cc;
}

.ctrl-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #999;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.ctrl-toggle-btn.active .ctrl-toggle-knob {
  transform: translateX(16px);
  background: #ffffff;
}

/* ── Button ── */
.ctrl-btn {
  padding: 7px 14px;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.ctrl-btn-default {
  background: #f0f0f5;
  color: #555570;
}

.ctrl-btn-default:hover {
  background: #e8e8f0;
  border-color: #b0b0c0;
  color: #333348;
}

.ctrl-btn-primary {
  background: #5577cc;
  border-color: #4466bb;
  color: #ffffff;
}

.ctrl-btn-primary:hover {
  background: #4466bb;
  border-color: #3355aa;
}

.ctrl-btn-danger {
  background: #fff0f0;
  border-color: #ffaaaa;
  color: #cc3333;
}

.ctrl-btn-danger:hover {
  background: #ffe0e0;
  border-color: #ff8888;
}

.ctrl-btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ctrl-btn-row .ctrl-btn {
  flex: 1;
}

/* ── Info Display ── */
.ctrl-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  margin-bottom: 4px;
}

.ctrl-info-value {
  color: #333348;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ── File Drop Zone ── */
.ctrl-drop-zone {
  border: 1px dashed #d0d0d8;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 12px;
}

.ctrl-drop-zone:hover,
.ctrl-drop-zone.dragover {
  border-color: #5577cc;
  background: rgba(85, 119, 204, 0.05);
}

.ctrl-drop-label {
  color: #555570;
  font-size: 12px;
  margin-bottom: 4px;
}

.ctrl-drop-hint {
  color: #888898;
  font-size: 10px;
}

.ctrl-drop-input {
  display: none;
}

/* ── Color Presets ── */
.ctrl-color-presets {
  margin-bottom: 10px;
}

.ctrl-color-presets .ctrl-label {
  display: block;
  margin-bottom: 6px;
}

.ctrl-color-swatches {
  display: flex;
  gap: 6px;
}

.ctrl-color-swatch {
  width: 32px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid #d0d0d8;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  padding: 0;
}

.ctrl-color-swatch:hover {
  border-color: #8888aa;
  transform: scale(1.08);
}

.ctrl-color-swatch.active {
  border-color: #5577cc;
}

/* ── Alpha Bar ── */
.ctrl-alpha-bar {
  margin-bottom: 12px;
}

.ctrl-alpha-track {
  width: 100%;
  height: 4px;
  background: #e0e0e8;
  border-radius: 2px;
  overflow: hidden;
}

.ctrl-alpha-fill {
  height: 100%;
  background: linear-gradient(90deg, #5577cc, #33aa77);
  border-radius: 2px;
  transition: width 0.15s;
}

/* ── Scrollbar ── */
.panel-sections::-webkit-scrollbar {
  width: 6px;
}

.panel-sections::-webkit-scrollbar-track {
  background: transparent;
}

.panel-sections::-webkit-scrollbar-thumb {
  background: #d0d0d8;
  border-radius: 3px;
}

.panel-sections::-webkit-scrollbar-thumb:hover {
  background: #b0b0c0;
}
`;export{I as Panel};
