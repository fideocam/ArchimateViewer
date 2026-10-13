export class Canvas {
  private viewport: HTMLElement;
  private stage: HTMLElement;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private navigable: boolean;
  private onDestroy: Array<() => void> = [];

  constructor(viewport: HTMLElement, options: { navigable?: boolean } = {}) {
    this.viewport = viewport;
    this.navigable = options.navigable !== false;
    this.viewport.classList.add("av-viewport");
    this.stage = viewport.ownerDocument.createElement("div");
    this.stage.className = "av-stage";
    this.viewport.appendChild(this.stage);
    this.apply();
    if (this.navigable) {
      this.bindNavigation();
    }
  }

  setSvg(svg: string) {
    this.stage.innerHTML = svg;
  }

  getSvgElement(): SVGElement | null {
    return this.stage.querySelector("svg");
  }

  zoom(level: number | "fit-viewport") {
    if (level === "fit-viewport") {
      this.fit();
      return;
    }
    this.scale = Math.max(0.1, Math.min(6, level));
    this.apply();
  }

  getZoom(): number {
    return this.scale;
  }

  panBy(dx: number, dy: number) {
    this.tx += dx;
    this.ty += dy;
    this.apply();
  }

  destroy() {
    for (const fn of this.onDestroy) {
      fn();
    }
    this.onDestroy = [];
    this.stage.remove();
  }

  private fit() {
    const svg = this.getSvgElement();
    const vw = this.viewport.clientWidth || 800;
    const vh = this.viewport.clientHeight || 600;
    const width = Number(svg?.getAttribute("width")) || svg?.getBoundingClientRect().width || vw;
    const height = Number(svg?.getAttribute("height")) || svg?.getBoundingClientRect().height || vh;
    const scale = Math.min(vw / width, vh / height, 1.5) * 0.96;
    this.scale = Math.max(0.15, scale);
    this.tx = (vw - width * this.scale) / 2;
    this.ty = (vh - height * this.scale) / 2;
    this.apply();
  }

  private apply() {
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }

  private bindNavigation() {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const next = Math.max(0.1, Math.min(6, this.scale * factor));
      const k = next / this.scale;
      this.tx = cx - (cx - this.tx) * k;
      this.ty = cy - (cy - this.ty) * k;
      this.scale = next;
      this.apply();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      const target = event.target as Element | null;
      if (event.button === 0 && target?.closest(".av-node")) {
        return;
      }
      this.panning = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.viewport.setPointerCapture?.(event.pointerId);
      this.viewport.classList.add("is-panning");
    };

    const onMove = (event: PointerEvent) => {
      if (!this.panning) {
        return;
      }
      this.panBy(event.clientX - this.lastX, event.clientY - this.lastY);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    };

    const onUp = () => {
      this.panning = false;
      this.viewport.classList.remove("is-panning");
    };

    this.viewport.addEventListener("wheel", onWheel, { passive: false });
    this.viewport.addEventListener("pointerdown", onDown);
    this.viewport.addEventListener("pointermove", onMove);
    this.viewport.addEventListener("pointerup", onUp);
    this.viewport.addEventListener("pointercancel", onUp);
    this.onDestroy.push(() => {
      this.viewport.removeEventListener("wheel", onWheel);
      this.viewport.removeEventListener("pointerdown", onDown);
      this.viewport.removeEventListener("pointermove", onMove);
      this.viewport.removeEventListener("pointerup", onUp);
      this.viewport.removeEventListener("pointercancel", onUp);
    });
  }
}
