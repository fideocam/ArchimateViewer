import { Canvas } from "./canvas";
import { parseModel } from "./parser";
import { renderView } from "./renderer";
import type { ArchiMateModel, ImportResult, ViewerOptions } from "./types";

type Handler = (payload?: unknown) => void;

export class Viewer {
  protected container: HTMLElement | null = null;
  protected canvas: Canvas | undefined;
  protected model: ArchiMateModel | null = null;
  protected currentViewId: string | null = null;
  private listeners = new Map<string, Handler[]>();
  private hostStyle: HTMLStyleElement | null = null;

  constructor(options: ViewerOptions = {}) {
    if (options.container) {
      this.attachTo(options.container);
    }
    if (this.container && (options.width || options.height)) {
      if (options.width != null) {
        this.container.style.width = typeof options.width === "number" ? `${options.width}px` : options.width;
      }
      if (options.height != null) {
        this.container.style.height = typeof options.height === "number" ? `${options.height}px` : options.height;
      }
    }
  }

  attachTo(container: string | HTMLElement) {
    const el = typeof container === "string" ? document.querySelector<HTMLElement>(container) : container;
    if (!el) {
      throw new Error("ArchiMate viewer container not found");
    }
    this.detach();
    this.container = el;
    el.classList.add("av-root");
    this.ensureStyles();
    this.canvas = this.createCanvas(el);
  }

  detach() {
    this.canvas?.destroy();
    this.canvas = undefined;
    this.container = null;
  }

  destroy() {
    this.detach();
    this.listeners.clear();
    this.hostStyle?.remove();
    this.hostStyle = null;
  }

  async importXML(xml: string, viewId?: string): Promise<ImportResult> {
    if (!this.container || !this.canvas) {
      throw new Error("Viewer is not attached to a container");
    }
    this.emit("import.parse.start");
    const model = parseModel(xml);
    this.model = model;
    this.emit("import.parse.complete", { model });
    this.emit("import.render.start");
    const view = pickView(model, viewId);
    if (!view) {
      const error = new Error("ArchiMate model has no diagram views to render");
      this.emit("import.done", { error, warnings: model.warnings });
      throw error;
    }
    this.currentViewId = view.identifier;
    this.canvas.setSvg(renderView(view, model));
    this.emit("import.render.complete", { view });
    this.emit("import.done", { warnings: model.warnings });
    return { warnings: model.warnings };
  }

  async openView(viewId: string): Promise<void> {
    if (!this.model || !this.canvas) {
      throw new Error("No model imported");
    }
    const view = pickView(this.model, viewId);
    if (!view) {
      throw new Error(`Unknown ArchiMate view: ${viewId}`);
    }
    this.currentViewId = view.identifier;
    this.canvas.setSvg(renderView(view, this.model));
  }

  get(name: "canvas"): Canvas;
  get(name: "model"): ArchiMateModel;
  get(name: string): Canvas | ArchiMateModel {
    if (name === "canvas") {
      if (!this.canvas) {
        throw new Error("Viewer is not attached to a container");
      }
      return this.canvas;
    }
    if (name === "model") {
      if (!this.model) {
        throw new Error("No model imported");
      }
      return this.model;
    }
    throw new Error(`Unknown service: ${name}`);
  }

  on(event: string, handler: Handler) {
    const list = this.listeners.get(event) || [];
    list.push(handler);
    this.listeners.set(event, list);
    return this;
  }

  protected createCanvas(container: HTMLElement): Canvas {
    return new Canvas(container, { navigable: false });
  }

  private emit(event: string, payload?: unknown) {
    for (const handler of this.listeners.get(event) || []) {
      handler(payload);
    }
  }

  private ensureStyles() {
    if (this.hostStyle || typeof document === "undefined") {
      return;
    }
    this.hostStyle = document.createElement("style");
    this.hostStyle.setAttribute("data-archimate-viewer", "true");
    this.hostStyle.textContent = `
.av-root, .av-viewport { position: relative; width: 100%; height: 100%; overflow: hidden; touch-action: none; background: #f7f7f5; }
.av-stage { transform-origin: 0 0; position: absolute; top: 0; left: 0; }
.av-viewport.is-panning { cursor: grabbing; }
.av-viewport { cursor: grab; }
.av-diagram { display: block; font-family: "Segoe UI", Helvetica, Arial, sans-serif; }
.av-node { cursor: default; }
`;
    document.head.appendChild(this.hostStyle);
  }
}

function pickView(model: ArchiMateModel, viewId?: string) {
  if (viewId) {
    return model.views.find((view) => view.identifier === viewId);
  }
  return model.views[0];
}
