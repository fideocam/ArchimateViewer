import { connectionRoute, pointsToPath, type Bounds } from "./renderer";
import type { Point } from "./types";

interface DragState {
  id: string;
  originX: number;
  originY: number;
  nodes: Element[];
}

interface ConnectionDragState {
  id: string;
  originX: number;
  originY: number;
  bendpoints: Point[];
}

interface EndpointDragState {
  id: string;
  end: "source" | "target";
  bendpoints: Point[];
}

interface KinkDragState {
  id: string;
  index: number;
  originX: number;
  originY: number;
  bendpoints: Point[];
}

interface PendingLabel {
  kind: "node" | "connection";
  id: string;
  label: Element;
  originX: number;
  originY: number;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Canvas {
  private viewport: HTMLElement;
  private stage: HTMLElement;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private drag: DragState | null = null;
  private connectionDrag: ConnectionDragState | null = null;
  private endpointDrag: EndpointDragState | null = null;
  private kinkDrag: KinkDragState | null = null;
  private pendingLabel: PendingLabel | null = null;
  private editing = false;
  private navigable: boolean;
  private onNodeDragEnd?: (id: string, dx: number, dy: number) => void;
  private onConnectionDragEnd?: (id: string, bendpoints: Point[]) => void;
  private onConnectionRetarget?: (id: string, end: "source" | "target", nodeId: string) => void;
  private onLabelEdit?: (kind: "node" | "connection", id: string, value: string) => void;
  private onDelete?: (kind: "node" | "connection", id: string) => void;
  private selected: { kind: "node" | "connection"; id: string } | null = null;
  private onDestroy: Array<() => void> = [];

  constructor(
    viewport: HTMLElement,
    options: {
      navigable?: boolean;
      onNodeDragEnd?: (id: string, dx: number, dy: number) => void;
      onConnectionDragEnd?: (id: string, bendpoints: Point[]) => void;
      onConnectionRetarget?: (id: string, end: "source" | "target", nodeId: string) => void;
      onLabelEdit?: (kind: "node" | "connection", id: string, value: string) => void;
      onDelete?: (kind: "node" | "connection", id: string) => void;
    } = {}
  ) {
    this.viewport = viewport;
    this.navigable = options.navigable !== false;
    this.onNodeDragEnd = options.onNodeDragEnd;
    this.onConnectionDragEnd = options.onConnectionDragEnd;
    this.onConnectionRetarget = options.onConnectionRetarget;
    this.onLabelEdit = options.onLabelEdit;
    this.onDelete = options.onDelete;
    this.viewport.classList.add("av-viewport");
    this.stage = viewport.ownerDocument.createElement("div");
    this.stage.className = "av-stage";
    this.viewport.appendChild(this.stage);
    this.apply();
    this.bindPointer();
  }

  setSvg(svg: string) {
    const previous = readViewBox(this.getSvgElement());
    this.stage.innerHTML = svg;
    const next = readViewBox(this.getSvgElement());
    if (previous && next) {
      this.tx += (previous.x - next.x) * this.scale;
      this.ty += (previous.y - next.y) * this.scale;
      this.apply();
    }
    this.applySelection();
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
    const box = readViewBox(svg);
    const width = box?.w || Number(svg?.getAttribute("width")) || vw;
    const height = box?.h || Number(svg?.getAttribute("height")) || vh;
    const pad = 8;
    const scale = Math.min((vw - pad * 2) / width, (vh - pad * 2) / height, 1.5);
    this.scale = Math.max(0.15, scale);
    this.tx = (vw - width * this.scale) / 2;
    this.ty = (vh - height * this.scale) / 2;
    this.apply();
  }

  private apply() {
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }

  private bindPointer() {
    const onWheel = (event: WheelEvent) => {
      if (!this.navigable) {
        return;
      }
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
      if (this.editing || (event.target as Element | null)?.closest?.(".av-label-editor")) {
        return;
      }
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      const target = event.target as Element | null;
      const label = target?.closest?.(".av-label") ?? null;
      const kink = target?.closest?.(".av-connection-kink") ?? null;
      const endpoint = target?.closest?.(".av-connection-end") ?? null;
      if (event.button === 0 && kink) {
        const host = kink.closest(".av-connection");
        event.preventDefault();
        const id = host?.getAttribute("data-element-id") || "";
        this.select("connection", id);
        this.kinkDrag = {
          id,
          index: Number(kink.getAttribute("data-index")),
          originX: event.clientX,
          originY: event.clientY,
          bendpoints: parseBendpoints(host?.getAttribute("data-bendpoints") ?? null)
        };
        this.viewport.setPointerCapture?.(event.pointerId);
        this.viewport.classList.add("is-dragging");
        return;
      }
      const node = target?.closest?.(".av-node") ?? null;
      const connection = target?.closest?.(".av-connection") ?? null;
      if (event.button === 0 && endpoint) {
        const host = endpoint.closest(".av-connection");
        const end = endpoint.getAttribute("data-end") === "target" ? "target" : "source";
        this.select("connection", host?.getAttribute("data-element-id") || "");
        event.preventDefault();
        this.endpointDrag = {
          id: host?.getAttribute("data-element-id") || "",
          end,
          bendpoints: parseBendpoints(host?.getAttribute("data-bendpoints") ?? null)
        };
        this.viewport.setPointerCapture?.(event.pointerId);
        this.viewport.classList.add("is-dragging");
        this.previewEndpoint(this.endpointDrag, this.diagramPoint(event));
        return;
      }
      if (event.button === 0 && label && (node || connection)) {
        event.preventDefault();
        const host = node || connection;
        if (node) {
          this.clearSelection();
        } else if (connection) {
          this.select("connection", connection.getAttribute("data-element-id") || "");
        }
        this.pendingLabel = {
          kind: node ? "node" : "connection",
          id: host!.getAttribute("data-element-id") || "",
          label,
          originX: event.clientX,
          originY: event.clientY
        };
        this.viewport.setPointerCapture?.(event.pointerId);
        return;
      }
      if (event.button === 0 && node) {
        event.preventDefault();
        this.clearSelection();
        this.drag = {
          id: node.getAttribute("data-element-id") || "",
          originX: event.clientX,
          originY: event.clientY,
          nodes: this.nodesInDrag(node)
        };
        this.viewport.setPointerCapture?.(event.pointerId);
        this.viewport.classList.add("is-dragging");
        return;
      }
      if (event.button === 0 && connection) {
        event.preventDefault();
        this.select("connection", connection.getAttribute("data-element-id") || "");
        this.connectionDrag = {
          id: connection.getAttribute("data-element-id") || "",
          originX: event.clientX,
          originY: event.clientY,
          bendpoints: parseBendpoints(connection.getAttribute("data-bendpoints"))
        };
        this.viewport.setPointerCapture?.(event.pointerId);
        this.viewport.classList.add("is-dragging");
        return;
      }
      if (!this.navigable) {
        return;
      }
      this.clearSelection();
      this.panning = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.viewport.setPointerCapture?.(event.pointerId);
      this.viewport.classList.add("is-panning");
    };

    const onMove = (event: PointerEvent) => {
      if (this.pendingLabel && !this.drag && !this.connectionDrag && !this.endpointDrag && !this.kinkDrag) {
        const moved = Math.hypot(event.clientX - this.pendingLabel.originX, event.clientY - this.pendingLabel.originY);
        if (moved < 4) {
          return;
        }
        this.beginDragFromLabel();
      }
      if (this.drag) {
        const dx = (event.clientX - this.drag.originX) / this.scale;
        const dy = (event.clientY - this.drag.originY) / this.scale;
        for (const el of this.drag.nodes) {
          el.setAttribute("transform", `translate(${dx},${dy})`);
        }
        const boxes = this.redrawConnections(this.drag.nodes, dx, dy);
        this.includeBounds(boxes);
        return;
      }
      if (this.connectionDrag) {
        const dx = (event.clientX - this.connectionDrag.originX) / this.scale;
        const dy = (event.clientY - this.connectionDrag.originY) / this.scale;
        const points = this.previewConnection(this.connectionDrag, dx, dy);
        this.includeBounds(points.map((point) => ({ x: point.x, y: point.y, w: 0, h: 0 })));
        return;
      }
      if (this.kinkDrag) {
        const dx = (event.clientX - this.kinkDrag.originX) / this.scale;
        const dy = (event.clientY - this.kinkDrag.originY) / this.scale;
        const points = this.previewKink(this.kinkDrag, dx, dy);
        this.includeBounds(points.map((point) => ({ x: point.x, y: point.y, w: 0, h: 0 })));
        return;
      }
      if (this.endpointDrag) {
        const point = this.diagramPoint(event);
        const points = this.previewEndpoint(this.endpointDrag, point);
        this.includeBounds(points.map((item) => ({ x: item.x, y: item.y, w: 0, h: 0 })));
        return;
      }
      if (!this.panning) {
        return;
      }
      this.panBy(event.clientX - this.lastX, event.clientY - this.lastY);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    };

    const onUp = (event: PointerEvent) => {
      if (this.pendingLabel && !this.drag && !this.connectionDrag && !this.endpointDrag && !this.kinkDrag) {
        const pending = this.pendingLabel;
        this.pendingLabel = null;
        this.openLabelEditor(pending);
        return;
      }
      this.pendingLabel = null;
      if (this.drag) {
        const drag = this.drag;
        this.drag = null;
        this.viewport.classList.remove("is-dragging");
        const dx = (event.clientX - drag.originX) / this.scale;
        const dy = (event.clientY - drag.originY) / this.scale;
        if (drag.id && (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5)) {
          this.select("node", drag.id);
          this.onNodeDragEnd?.(drag.id, dx, dy);
        } else {
          for (const el of drag.nodes) {
            el.setAttribute("transform", "translate(0,0)");
          }
          this.redrawConnections(drag.nodes, 0, 0);
          if (drag.id) {
            this.select("node", drag.id);
          }
        }
        return;
      }
      if (this.connectionDrag) {
        const drag = this.connectionDrag;
        this.connectionDrag = null;
        this.viewport.classList.remove("is-dragging");
        const dx = (event.clientX - drag.originX) / this.scale;
        const dy = (event.clientY - drag.originY) / this.scale;
        if (drag.id && (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5)) {
          this.select("connection", drag.id);
          this.onConnectionDragEnd?.(drag.id, shiftedBendpoints(drag, dx, dy, this.connectionElement(drag.id)));
        } else {
          this.previewConnection(drag, 0, 0);
          if (drag.id) {
            this.select("connection", drag.id);
          }
        }
        return;
      }
      if (this.kinkDrag) {
        const drag = this.kinkDrag;
        this.kinkDrag = null;
        this.viewport.classList.remove("is-dragging");
        const dx = (event.clientX - drag.originX) / this.scale;
        const dy = (event.clientY - drag.originY) / this.scale;
        if (drag.id && (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5)) {
          this.select("connection", drag.id);
          this.onConnectionDragEnd?.(drag.id, movedKink(drag, dx, dy));
        } else {
          this.previewKink(drag, 0, 0);
          if (drag.id) {
            this.select("connection", drag.id);
          }
        }
        return;
      }
      if (this.endpointDrag) {
        const drag = this.endpointDrag;
        this.endpointDrag = null;
        this.viewport.classList.remove("is-dragging");
        this.clearDropTarget();
        const node = this.elementAt(this.diagramPoint(event));
        const nodeId = node?.getAttribute("data-element-id") || "";
        const conn = this.connectionElement(drag.id);
        const otherId = conn?.getAttribute(drag.end === "source" ? "data-target" : "data-source") || "";
        const currentId = conn?.getAttribute(drag.end === "source" ? "data-source" : "data-target") || "";
        if (drag.id && nodeId && nodeId !== otherId && nodeId !== currentId) {
          this.select("connection", drag.id);
          this.onConnectionRetarget?.(drag.id, drag.end, nodeId);
        } else {
          this.restoreConnection(drag.id);
          if (drag.id) {
            this.select("connection", drag.id);
          }
        }
        return;
      }
      this.panning = false;
      this.viewport.classList.remove("is-panning");
    };

    this.viewport.addEventListener("wheel", onWheel, { passive: false });
    this.viewport.addEventListener("pointerdown", onDown);
    this.viewport.addEventListener("pointermove", onMove);
    this.viewport.addEventListener("pointerup", onUp);
    this.viewport.addEventListener("pointercancel", onUp);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest?.("input, textarea, select, .av-label-editor")) {
        return;
      }
      if (this.editing || !this.selected?.id) {
        return;
      }
      event.preventDefault();
      const selected = this.selected;
      this.clearSelection();
      this.onDelete?.(selected.kind, selected.id);
    };
    this.viewport.ownerDocument.addEventListener("keydown", onKey);
    this.onDestroy.push(() => {
      this.viewport.removeEventListener("wheel", onWheel);
      this.viewport.removeEventListener("pointerdown", onDown);
      this.viewport.removeEventListener("pointermove", onMove);
      this.viewport.removeEventListener("pointerup", onUp);
      this.viewport.removeEventListener("pointercancel", onUp);
      this.viewport.ownerDocument.removeEventListener("keydown", onKey);
    });
  }

  private select(kind: "node" | "connection", id: string) {
    this.selected = { kind, id };
    this.applySelection();
  }

  private clearSelection() {
    this.selected = null;
    this.applySelection();
  }

  private applySelection() {
    const svg = this.getSvgElement();
    if (!svg) {
      return;
    }
    for (const el of Array.from(svg.querySelectorAll(".is-selected"))) {
      el.classList.remove("is-selected");
    }
    if (!this.selected?.id) {
      return;
    }
    const el =
      this.selected.kind === "node" ? this.nodeElement(this.selected.id) : this.connectionElement(this.selected.id);
    el?.classList.add("is-selected");
  }

  private nodesInDrag(root: Element): Element[] {
    const svg = this.getSvgElement();
    if (!svg) {
      return [root];
    }
    const selected = new Set<string>();
    const rootId = root.getAttribute("data-element-id");
    if (rootId) {
      selected.add(rootId);
    }
    const all = Array.from(svg.querySelectorAll(".av-node"));
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of all) {
        const parentId = node.getAttribute("data-parent-id");
        const nodeId = node.getAttribute("data-element-id");
        if (parentId && nodeId && selected.has(parentId) && !selected.has(nodeId)) {
          selected.add(nodeId);
          grew = true;
        }
      }
    }
    return all.filter((node) => selected.has(node.getAttribute("data-element-id") || ""));
  }

  private redrawConnections(nodes: Element[], dx: number, dy: number): Bounds[] {
    const svg = this.getSvgElement();
    const boxes = nodes.map((node) => boundsOf(node, dx, dy));
    if (!svg) {
      return boxes;
    }
    const moved = new Set(
      nodes.map((node) => node.getAttribute("data-element-id")).filter((id): id is string => Boolean(id))
    );
    const byId = new Map<string, Element>();
    svg.querySelectorAll(".av-node").forEach((node) => {
      const id = node.getAttribute("data-element-id");
      if (id) {
        byId.set(id, node);
      }
    });
    svg.querySelectorAll(".av-connection").forEach((conn) => {
      const sourceId = conn.getAttribute("data-source") || "";
      const targetId = conn.getAttribute("data-target") || "";
      if (!moved.has(sourceId) && !moved.has(targetId)) {
        return;
      }
      const source = byId.get(sourceId);
      const target = byId.get(targetId);
      if (!source || !target) {
        return;
      }
      const sourceMoved = moved.has(sourceId);
      const targetMoved = moved.has(targetId);
      let bendpoints = parseBendpoints(conn.getAttribute("data-bendpoints"));
      if (sourceMoved && targetMoved) {
        bendpoints = bendpoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
      }
      const points = connectionRoute(
        boundsOf(source, sourceMoved ? dx : 0, sourceMoved ? dy : 0),
        boundsOf(target, targetMoved ? dx : 0, targetMoved ? dy : 0),
        bendpoints
      );
      applyRoute(conn, points);
      for (const point of points) {
        boxes.push({ x: point.x, y: point.y, w: 0, h: 0 });
      }
    });
    return boxes;
  }

  private beginDragFromLabel() {
    const pending = this.pendingLabel;
    if (!pending) {
      return;
    }
    this.pendingLabel = null;
    const host = pending.label.closest(pending.kind === "node" ? ".av-node" : ".av-connection");
    if (!host) {
      return;
    }
    if (pending.kind === "node") {
      this.drag = {
        id: pending.id,
        originX: pending.originX,
        originY: pending.originY,
        nodes: this.nodesInDrag(host)
      };
    } else {
      this.connectionDrag = {
        id: pending.id,
        originX: pending.originX,
        originY: pending.originY,
        bendpoints: parseBendpoints(host.getAttribute("data-bendpoints"))
      };
    }
    this.viewport.classList.add("is-dragging");
  }

  private previewKink(drag: KinkDragState, dx: number, dy: number): Point[] {
    const conn = this.connectionElement(drag.id);
    if (!conn) {
      return [];
    }
    const bendpoints = movedKink(drag, dx, dy);
    const source = this.nodeElement(conn.getAttribute("data-source") || "");
    const target = this.nodeElement(conn.getAttribute("data-target") || "");
    if (!source || !target) {
      return bendpoints;
    }
    const route = connectionRoute(boundsOf(source, 0, 0), boundsOf(target, 0, 0), bendpoints);
    applyRoute(conn, route);
    return route;
  }

  private previewEndpoint(drag: EndpointDragState, point: Point): Point[] {
    const conn = this.connectionElement(drag.id);
    if (!conn) {
      return [];
    }
    const source = this.nodeElement(conn.getAttribute("data-source") || "");
    const target = this.nodeElement(conn.getAttribute("data-target") || "");
    if (!source || !target) {
      return [];
    }
    const cursor = { x: point.x, y: point.y, w: 0, h: 0 };
    const route =
      drag.end === "source"
        ? connectionRoute(cursor, boundsOf(target, 0, 0), drag.bendpoints)
        : connectionRoute(boundsOf(source, 0, 0), cursor, drag.bendpoints);
    applyRoute(conn, route);
    const node = this.elementAt(point);
    const nodeId = node?.getAttribute("data-element-id") || "";
    const otherId = conn.getAttribute(drag.end === "source" ? "data-target" : "data-source") || "";
    const currentId = conn.getAttribute(drag.end === "source" ? "data-source" : "data-target") || "";
    this.markDropTarget(nodeId && nodeId !== otherId && nodeId !== currentId ? node : null);
    return route;
  }

  private restoreConnection(id: string) {
    const conn = this.connectionElement(id);
    if (!conn) {
      return;
    }
    const source = this.nodeElement(conn.getAttribute("data-source") || "");
    const target = this.nodeElement(conn.getAttribute("data-target") || "");
    if (!source || !target) {
      return;
    }
    applyRoute(
      conn,
      connectionRoute(boundsOf(source, 0, 0), boundsOf(target, 0, 0), parseBendpoints(conn.getAttribute("data-bendpoints")))
    );
  }

  private diagramPoint(event: PointerEvent): Point {
    const rect = this.viewport.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    return {
      x: (event.clientX - (rect.left || 0) - this.tx) / this.scale,
      y: (event.clientY - (rect.top || 0) - this.ty) / this.scale
    };
  }

  private elementAt(point: Point): Element | null {
    const svg = this.getSvgElement();
    if (!svg) {
      return null;
    }
    let best: Element | null = null;
    let bestArea = Infinity;
    for (const node of Array.from(svg.querySelectorAll('.av-node[data-kind="element"]'))) {
      const box = boundsOf(node, 0, 0);
      if (point.x < box.x || point.y < box.y || point.x > box.x + box.w || point.y > box.y + box.h) {
        continue;
      }
      const area = box.w * box.h;
      if (area < bestArea) {
        best = node;
        bestArea = area;
      }
    }
    return best;
  }

  private markDropTarget(node: Element | null) {
    this.clearDropTarget();
    node?.classList.add("is-drop-target");
  }

  private clearDropTarget() {
    const svg = this.getSvgElement();
    if (!svg) {
      return;
    }
    for (const el of Array.from(svg.querySelectorAll(".is-drop-target"))) {
      el.classList.remove("is-drop-target");
    }
  }

  private previewConnection(drag: ConnectionDragState, dx: number, dy: number): Point[] {
    const conn = this.connectionElement(drag.id);
    if (!conn) {
      return [];
    }
    const points = shiftedBendpoints(drag, dx, dy, conn);
    const source = this.nodeElement(conn.getAttribute("data-source") || "");
    const target = this.nodeElement(conn.getAttribute("data-target") || "");
    if (!source || !target) {
      return points;
    }
    const route = connectionRoute(boundsOf(source, 0, 0), boundsOf(target, 0, 0), points);
    applyRoute(conn, route);
    return route;
  }

  private connectionElement(id: string): Element | null {
    return this.getSvgElement()?.querySelector(`.av-connection[data-element-id="${cssEscape(id)}"]`) ?? null;
  }

  private nodeElement(id: string): Element | null {
    return this.getSvgElement()?.querySelector(`.av-node[data-element-id="${cssEscape(id)}"]`) ?? null;
  }

  private includeBounds(boxes: Bounds[]) {
    const svg = this.getSvgElement();
    const vb = readViewBox(svg);
    if (!svg || !vb || !boxes.length) {
      return;
    }
    let minX = vb.x;
    let minY = vb.y;
    let maxX = vb.x + vb.w;
    let maxY = vb.y + vb.h;
    for (const box of boxes) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }
    if (minX === vb.x && minY === vb.y && maxX === vb.x + vb.w && maxY === vb.y + vb.h) {
      return;
    }
    const next = { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
    this.tx += (vb.x - next.x) * this.scale;
    this.ty += (vb.y - next.y) * this.scale;
    writeViewBox(svg, next);
    this.apply();
  }

  private openLabelEditor(pending: PendingLabel) {
    if (this.editing || !pending.id) {
      return;
    }
    this.editing = true;
    const doc = this.viewport.ownerDocument;
    const input = doc.createElement("input");
    input.className = "av-label-editor";
    input.type = "text";
    input.value = pending.label.textContent || "";
    const rect = pending.label.getBoundingClientRect();
    const host = this.viewport.getBoundingClientRect();
    const fontSize = Number(pending.label.getAttribute("font-size")) || 12;
    input.style.left = `${rect.left - host.left}px`;
    input.style.top = `${rect.top - host.top}px`;
    input.style.width = `${Math.max(rect.width + 24, 96)}px`;
    input.style.height = `${Math.max(rect.height, fontSize * this.scale + 6)}px`;
    input.style.fontSize = `${fontSize * this.scale}px`;
    this.viewport.appendChild(input);
    input.focus();
    input.select?.();
    let done = false;
    const finish = (save: boolean) => {
      if (done) {
        return;
      }
      done = true;
      const value = input.value;
      input.remove();
      this.editing = false;
      if (save) {
        this.onLabelEdit?.(pending.kind, pending.id, value);
      }
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }
}

function shiftedBendpoints(drag: ConnectionDragState, dx: number, dy: number, conn: Element | null): Point[] {
  const ends = connectionEnds(conn);
  if (drag.bendpoints.length === 0) {
    const mid = ends
      ? { x: (ends.start.x + ends.end.x) / 2, y: (ends.start.y + ends.end.y) / 2 }
      : { x: 0, y: 0 };
    return [{ x: mid.x + dx, y: mid.y + dy }];
  }
  if (drag.bendpoints.length === 1) {
    const existing = drag.bendpoints[0];
    const added = { x: existing.x + dx, y: existing.y + dy };
    return ends ? orderAlong(ends.start, [existing, added], ends.end) : [existing, added];
  }
  return drag.bendpoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function movedKink(drag: KinkDragState, dx: number, dy: number): Point[] {
  return drag.bendpoints.map((point, index) =>
    index === drag.index ? { x: point.x + dx, y: point.y + dy } : { x: point.x, y: point.y }
  );
}

function connectionEnds(conn: Element | null): { start: Point; end: Point } | null {
  if (!conn) {
    return null;
  }
  const svg = conn.closest("svg");
  const source = svg?.querySelector(`.av-node[data-element-id="${cssEscape(conn.getAttribute("data-source") || "")}"]`);
  const target = svg?.querySelector(`.av-node[data-element-id="${cssEscape(conn.getAttribute("data-target") || "")}"]`);
  if (!source || !target) {
    return null;
  }
  const ends = connectionRoute(boundsOf(source, 0, 0), boundsOf(target, 0, 0), []);
  return { start: ends[0], end: ends[ends.length - 1] };
}

function orderAlong(start: Point, points: Point[], end: Point): Point[] {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  return [...points].sort((a, b) => {
    const da = (a.x - start.x) * vx + (a.y - start.y) * vy;
    const db = (b.x - start.x) * vx + (b.y - start.y) * vy;
    return da - db;
  });
}

function applyRoute(conn: Element, points: Point[]) {
  const d = pointsToPath(points);
  conn.querySelectorAll("path").forEach((path) => path.setAttribute("d", d));
  const start = points[0];
  const end = points[points.length - 1];
  const sourceEnd = conn.querySelector('.av-connection-end[data-end="source"]');
  const targetEnd = conn.querySelector('.av-connection-end[data-end="target"]');
  if (sourceEnd && start) {
    sourceEnd.setAttribute("cx", String(start.x));
    sourceEnd.setAttribute("cy", String(start.y));
  }
  if (targetEnd && end) {
    targetEnd.setAttribute("cx", String(end.x));
    targetEnd.setAttribute("cy", String(end.y));
  }
  const kinks = Array.from(conn.querySelectorAll(".av-connection-kink"));
  kinks.forEach((kink, index) => {
    const point = points[index + 1];
    if (!point) {
      return;
    }
    kink.setAttribute("cx", String(point.x));
    kink.setAttribute("cy", String(point.y));
  });
  const mid = points[Math.floor(points.length / 2)];
  const label = conn.querySelector("text");
  if (label && mid) {
    label.setAttribute("x", String(mid.x));
    label.setAttribute("y", String(mid.y - 6));
  }
}

function readViewBox(svg: SVGElement | null): ViewBox | null {
  if (!svg) {
    return null;
  }
  const parts = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { x: 0, y: 0, w: width, h: height };
}

function writeViewBox(svg: SVGElement, box: ViewBox) {
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  svg.setAttribute("width", String(box.w));
  svg.setAttribute("height", String(box.h));
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function boundsOf(el: Element, dx: number, dy: number): Bounds {
  return {
    x: Number(el.getAttribute("data-x")) + dx,
    y: Number(el.getAttribute("data-y")) + dy,
    w: Number(el.getAttribute("data-w")),
    h: Number(el.getAttribute("data-h"))
  };
}

function parseBendpoints(value: string | null): Point[] {
  if (!value) {
    return [];
  }
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",");
      return { x: Number(x), y: Number(y) };
    });
}
