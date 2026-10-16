import { Canvas } from "./canvas";
import { applyDeletion, planDeletion, removeFromXml, setIdentifierAttribute } from "./delete";
import { parseModel } from "./parser";
import { renderView } from "./renderer";
import { unnestElementBoxes } from "./unnest";
import type { ArchiMateModel, DiagramConnection, DiagramNode, ImportResult, Point, ViewerOptions } from "./types";

type Handler = (payload?: unknown) => void;

export class Viewer {
  protected container: HTMLElement | null = null;
  protected canvas: Canvas | undefined;
  protected model: ArchiMateModel | null = null;
  protected currentViewId: string | null = null;
  private listeners = new Map<string, Handler[]>();
  private hostStyle: HTMLStyleElement | null = null;
  private sourceXml = "";

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
    for (const diagram of model.views) {
      unnestElementBoxes(diagram, model);
    }
    this.model = model;
    this.sourceXml = xml;
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

  protected moveDiagramNode(id: string, dx: number, dy: number) {
    if (!this.model || !this.canvas || !this.currentViewId) {
      return;
    }
    const view = this.model.views.find((item) => item.identifier === this.currentViewId);
    const node = view && findDiagramNode(view.nodes, id);
    if (!view || !node) {
      return;
    }
    const moved = new Set<string>();
    collectNodeIds(node, moved);
    node.x += dx;
    node.y += dy;
    for (const conn of view.connections) {
      if (moved.has(conn.source) && moved.has(conn.target)) {
        for (const point of conn.bendpoints) {
          point.x += dx;
          point.y += dy;
        }
      }
    }
    this.canvas.setSvg(renderView(view, this.model));
  }

  protected canvasNavigable() {
    return false;
  }

  protected createCanvas(container: HTMLElement): Canvas {
    return new Canvas(container, {
      navigable: this.canvasNavigable(),
      onNodeDragEnd: (id, dx, dy) => this.moveDiagramNode(id, dx, dy),
      onConnectionDragEnd: (id, bendpoints) => this.moveConnection(id, bendpoints),
      onConnectionRetarget: (id, end, nodeId) => this.retargetConnection(id, end, nodeId),
      onLabelEdit: (kind, id, value) => this.editDiagramText(kind, id, value),
      onDelete: (kind, id) => this.deleteDiagramObject(kind, id)
    });
  }

  protected deleteDiagramObject(kind: "node" | "connection", id: string) {
    if (!this.model || !this.canvas) {
      return;
    }
    const plan = planDeletion(this.model, kind, id);
    if (!plan) {
      return;
    }
    applyDeletion(this.model, plan);
    if (this.sourceXml) {
      this.sourceXml = removeFromXml(this.sourceXml, [
        ...plan.rootNodeIds,
        ...plan.connectionIds,
        ...plan.elementIds,
        ...plan.relationshipIds
      ]);
    }
    const view = this.currentDiagram();
    if (view) {
      this.canvas.setSvg(renderView(view, this.model));
    }
    this.emit("change", { xml: this.sourceXml });
  }

  protected retargetConnection(id: string, end: "source" | "target", nodeId: string) {
    const view = this.currentDiagram();
    const connection = view?.connections.find((item) => item.identifier === id);
    const node = view && findDiagramNode(view.nodes, nodeId);
    if (!view || !connection || !node?.elementRef || !this.model || !this.canvas) {
      return;
    }
    const otherId = end === "source" ? connection.target : connection.source;
    if (otherId === nodeId || connection[end] === nodeId) {
      this.canvas.setSvg(renderView(view, this.model));
      return;
    }
    connection[end] = nodeId;
    const relationship = connection.relationshipRef
      ? this.model.relationships.get(connection.relationshipRef)
      : undefined;
    if (relationship) {
      relationship[end] = node.elementRef;
    }
    if (this.sourceXml) {
      this.sourceXml = setIdentifierAttribute(this.sourceXml, connection.identifier, end, nodeId);
      if (relationship && connection.relationshipRef) {
        this.sourceXml = setIdentifierAttribute(this.sourceXml, connection.relationshipRef, end, node.elementRef);
      }
    }
    this.canvas.setSvg(renderView(view, this.model));
    this.emit("change", { xml: this.sourceXml });
  }

  protected moveConnection(id: string, bendpoints: Point[]) {
    const view = this.currentDiagram();
    const connection = view?.connections.find((item) => item.identifier === id);
    if (!view || !connection || !this.canvas || !this.model) {
      return;
    }
    connection.bendpoints = bendpoints.map((point) => ({ x: point.x, y: point.y }));
    this.canvas.setSvg(renderView(view, this.model));
  }

  protected editDiagramText(kind: "node" | "connection", id: string, value: string) {
    const view = this.currentDiagram();
    if (!view || !this.model || !this.canvas) {
      return;
    }
    if (kind === "node") {
      const node = findDiagramNode(view.nodes, id);
      if (!node) {
        return;
      }
      if (node.elementRef) {
        const element = this.model.elements.get(node.elementRef);
        if (element && node.label == null) {
          element.name = value;
        }
      }
      if (!node.elementRef || node.label != null) {
        node.label = value;
      }
    } else {
      const connection = view.connections.find((item) => item.identifier === id);
      if (!connection) {
        return;
      }
      writeConnectionLabel(connection, this.model, value);
    }
    this.canvas.setSvg(renderView(view, this.model));
  }

  private currentDiagram() {
    if (!this.model || !this.currentViewId) {
      return undefined;
    }
    return this.model.views.find((item) => item.identifier === this.currentViewId);
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
.av-stage, .av-diagram { overflow: visible; }
.av-diagram { display: block; font-family: "Segoe UI", Helvetica, Arial, sans-serif; user-select: none; }
.av-node, .av-connection { cursor: grab; }
.av-connection-end, .av-connection-kink { cursor: crosshair; }
.av-connection-kink { visibility: hidden; pointer-events: none; }
.av-connection.is-selected .av-connection-kink { visibility: visible; pointer-events: auto; }
.av-node.is-drop-target > rect, .av-node.is-drop-target > path, .av-node.is-drop-target > ellipse, .av-node.is-drop-target > circle { stroke: #2e7d32; stroke-width: 2.5; }
.av-label { cursor: text; }
.av-node.is-selected > rect, .av-node.is-selected > path, .av-node.is-selected > ellipse, .av-node.is-selected > circle { stroke: #1565c0; stroke-width: 2.5; }
.av-connection.is-selected .av-connection-line { stroke: #1565c0; stroke-width: 3; }
.av-viewport.is-dragging, .av-viewport.is-dragging .av-node, .av-viewport.is-dragging .av-connection { cursor: grabbing; }
.av-label-editor { position: absolute; z-index: 5; box-sizing: border-box; margin: 0; padding: 0 4px; border: 1px solid #3a7; border-radius: 2px; background: #fff; color: #222; font-family: "Segoe UI", Helvetica, Arial, sans-serif; }
`;
    document.head.appendChild(this.hostStyle);
  }
}

function findDiagramNode(nodes: DiagramNode[], id: string): DiagramNode | undefined {
  for (const node of nodes) {
    if (node.identifier === id) {
      return node;
    }
    const found = findDiagramNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function collectNodeIds(node: DiagramNode, into: Set<string>) {
  into.add(node.identifier);
  for (const child of node.children) {
    collectNodeIds(child, into);
  }
}

function writeConnectionLabel(connection: DiagramConnection, model: ArchiMateModel, value: string) {
  if (connection.label != null) {
    connection.label = value;
    return;
  }
  const relationship = connection.relationshipRef ? model.relationships.get(connection.relationshipRef) : undefined;
  if (relationship) {
    relationship.name = value;
    return;
  }
  connection.label = value;
}

function pickView(model: ArchiMateModel, viewId?: string) {
  if (viewId) {
    return model.views.find((view) => view.identifier === viewId);
  }
  return model.views[0];
}
