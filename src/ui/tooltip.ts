// Lightweight HTML tooltip for hyperedge hover info
// Positioned near cursor, shows edge name + member nodes

export class Tooltip {
  private el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hg-tooltip';
    this.el.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 100;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #d0d0d8;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #1a1a2e;
      line-height: 1.5;
      max-width: 280px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    `;
    parent.appendChild(this.el);
  }

  show(x: number, y: number, label: string, members: string[]): void {
    const memberText = members.length <= 5
      ? members.join(', ')
      : members.slice(0, 3).join(', ') + `, +${members.length - 3} more`;

    this.el.innerHTML =
      `<div style="font-weight:600;margin-bottom:2px">${label}</div>` +
      `<div style="color:#666680">${memberText}</div>`;

    this.el.style.display = 'block';
    this.position(x, y);
  }

  showNode(x: number, y: number, nodeLabel: string, edges: string[]): void {
    const edgeText = edges.length === 0
      ? '<span style="color:#999">no edges</span>'
      : edges.length <= 5
        ? edges.join(', ')
        : edges.slice(0, 4).join(', ') + `, +${edges.length - 4} more`;

    this.el.innerHTML =
      `<div style="font-weight:600;margin-bottom:2px">${nodeLabel}</div>` +
      `<div style="color:#666680">${edgeText}</div>`;

    this.el.style.display = 'block';
    this.position(x, y);
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private position(x: number, y: number): void {
    const parent = this.el.parentElement!;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const ew = this.el.offsetWidth;
    const eh = this.el.offsetHeight;

    // Offset from cursor; flip if near edge
    let left = x + 12;
    let top = y + 12;
    if (left + ew > pw) left = x - ew - 8;
    if (top + eh > ph) top = y - eh - 8;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  dispose(): void {
    this.el.remove();
  }
}
