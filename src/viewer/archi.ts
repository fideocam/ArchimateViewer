import type {
  ArchiMateElement,
  ArchiMateModel,
  ArchiMateRelationship,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  Point,
  RgbColor,
  VisualStyle
} from "./types";
import { normalizeRelationshipType } from "./notation";
import { attr, childrenNamed, childrenOf, firstChildNamed, localName, xsiType } from "./xml";

/** Namespace used by the native Archi (archimatetool.com) `.archimate` file format. */
export const ARCHI_NS = "http://www.archimatetool.com/archimate";

const DEFAULT_W = 120;
const DEFAULT_H = 55;

/** Archi stores access relationship direction as an integer. Absent means Write (0). */
const ARCHI_ACCESS: Record<string, string> = {
  "0": "Write",
  "1": "Read",
  "2": "Access",
  "3": "ReadWrite"
};

/** Diagram model types that hold ArchiMate content. Sketch and Canvas models are skipped. */
const DIAGRAM_TYPES = new Set(["ArchimateDiagramModel", "DiagramModel"]);

interface RawBendpoint {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isArchiModel(el: Element): boolean {
  if (localName(el) !== "model") {
    return false;
  }
  if ((el.namespaceURI || "").startsWith(ARCHI_NS)) {
    return true;
  }
  return Array.from(el.attributes).some((a) => a.name.startsWith("xmlns") && a.value.startsWith(ARCHI_NS));
}

export function parseArchiModel(root: Element): ArchiMateModel {
  const warnings: string[] = [];
  const elements = new Map<string, ArchiMateElement>();
  const relationships = new Map<string, ArchiMateRelationship>();
  const diagramEls: Element[] = [];

  const walkFolder = (folder: Element) => {
    for (const child of childrenOf(folder)) {
      const name = localName(child);
      if (name === "folder") {
        walkFolder(child);
      } else if (name === "element") {
        classify(child);
      }
    }
  };

  const classify = (el: Element) => {
    const type = xsiType(el);
    const identifier = attr(el, "id");
    if (DIAGRAM_TYPES.has(type)) {
      diagramEls.push(el);
      return;
    }
    if (type === "SketchModel" || type === "CanvasModel") {
      return;
    }
    if (!identifier) {
      warnings.push("Skipped element without id");
      return;
    }
    const source = attr(el, "source");
    const target = attr(el, "target");
    if (type.endsWith("Relationship") || (source && target)) {
      if (!source || !target) {
        warnings.push(`Skipped relationship ${identifier} missing source/target`);
        return;
      }
      const kind = normalizeRelationshipType(type || "AssociationRelationship");
      relationships.set(identifier, {
        identifier,
        type: kind,
        name: attr(el, "name") || "",
        source,
        target,
        accessType: kind === "Access" ? ARCHI_ACCESS[attr(el, "accessType") || "0"] || "Write" : undefined,
        modifier: attr(el, "strength"),
        isDirected: attr(el, "directed") === "true",
        documentation: documentationOf(el)
      });
      return;
    }
    elements.set(identifier, {
      identifier,
      type: elementType(el, type),
      name: attr(el, "name") || "",
      documentation: documentationOf(el)
    });
  };

  walkFolder(root);

  const viewNames = new Map(diagramEls.map((el) => [attr(el, "id") || "", attr(el, "name") || ""]));
  const views = diagramEls
    .map((el, index) => parseDiagram(el, index, viewNames, warnings))
    .filter((view) => view.nodes.length > 0);

  return {
    identifier: attr(root, "id") || "model",
    name: attr(root, "name") || "ArchiMate Model",
    documentation: textChild(root, "purpose") || undefined,
    elements,
    relationships,
    views,
    warnings,
    format: "archi"
  };
}

function elementType(el: Element, type: string): string {
  if (type === "Junction") {
    return attr(el, "type") === "or" ? "OrJunction" : "AndJunction";
  }
  return type || "Element";
}

function parseDiagram(
  el: Element,
  index: number,
  viewNames: Map<string, string>,
  warnings: string[]
): DiagramView {
  const absolute = new Map<string, Box>();
  const rawConnections: { conn: DiagramConnection; raw: RawBendpoint[] }[] = [];

  const parseChild = (childEl: Element, ox: number, oy: number): DiagramNode => {
    const type = xsiType(childEl);
    const identifier = attr(childEl, "id") || `node-${Math.random().toString(36).slice(2)}`;
    if (!attr(childEl, "id")) {
      warnings.push("Diagram node was missing an id");
    }
    const bounds = readBounds(childEl);
    const absX = ox + bounds.x;
    const absY = oy + bounds.y;
    absolute.set(identifier, { x: absX, y: absY, w: bounds.w, h: bounds.h });

    for (const connEl of childrenNamed(childEl, "sourceConnection")) {
      rawConnections.push(parseConnection(connEl, warnings));
    }

    const node: DiagramNode = {
      identifier,
      xsiType: nodeType(type),
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      style: parseStyle(childEl),
      children: childrenNamed(childEl, "child").map((kid) => parseChild(kid, absX, absY))
    };
    const elementRef = attr(childEl, "archimateElement");
    if (elementRef) {
      node.elementRef = elementRef;
    }
    if (type === "Group") {
      node.label = attr(childEl, "name") || "";
    } else if (type === "Note") {
      node.label = textChild(childEl, "content") || attr(childEl, "content") || "";
    } else if (type === "DiagramModelReference") {
      node.viewRef = attr(childEl, "model");
      node.label = (node.viewRef && viewNames.get(node.viewRef)) || attr(childEl, "name") || "View";
    }
    return node;
  };

  const nodes = childrenNamed(el, "child").map((child) => parseChild(child, 0, 0));

  const connections = rawConnections.map(({ conn, raw }) => {
    conn.bendpoints = resolveBendpoints(raw, absolute.get(conn.source), absolute.get(conn.target));
    return conn;
  });

  return {
    identifier: attr(el, "id") || `view-${index + 1}`,
    name: attr(el, "name") || `View ${index + 1}`,
    documentation: documentationOf(el),
    viewRefs: [],
    nodes,
    connections
  };
}

function nodeType(archiType: string): string {
  if (archiType === "Group") {
    return "Container";
  }
  if (archiType === "Note") {
    return "Label";
  }
  if (archiType === "DiagramObject") {
    return "Element";
  }
  return archiType || "Element";
}

function parseConnection(el: Element, warnings: string[]): { conn: DiagramConnection; raw: RawBendpoint[] } {
  const identifier = attr(el, "id") || `conn-${Math.random().toString(36).slice(2)}`;
  if (!attr(el, "id")) {
    warnings.push("Diagram connection was missing an id");
  }
  const relationshipRef = attr(el, "archimateRelationship");
  const conn: DiagramConnection = {
    identifier,
    xsiType: relationshipRef ? "Relationship" : "Line",
    source: attr(el, "source") || "",
    target: attr(el, "target") || "",
    style: parseStyle(el),
    bendpoints: []
  };
  if (relationshipRef) {
    conn.relationshipRef = relationshipRef;
  }
  const name = attr(el, "name");
  if (name && !relationshipRef) {
    conn.label = name;
  }
  const raw = childrenNamed(el, "bendpoint").map((bp) => ({
    startX: num(bp, "startX"),
    startY: num(bp, "startY"),
    endX: num(bp, "endX"),
    endY: num(bp, "endY")
  }));
  return { conn, raw };
}

/**
 * Archi stores bendpoints relative to the source and target centres (GEF RelativeBendpoint).
 * The absolute location is a weighted blend of the two offsets.
 */
function resolveBendpoints(raw: RawBendpoint[], source: Box | undefined, target: Box | undefined): Point[] {
  if (!raw.length) {
    return [];
  }
  const sc = source ? centre(source) : undefined;
  const tc = target ? centre(target) : undefined;
  if (!sc && !tc) {
    return [];
  }
  return raw.map((bp, i) => {
    const weight = (i + 1) / (raw.length + 1);
    const a = sc ? { x: sc.x + bp.startX, y: sc.y + bp.startY } : undefined;
    const b = tc ? { x: tc.x + bp.endX, y: tc.y + bp.endY } : undefined;
    if (a && b) {
      return {
        x: Math.round(a.x * (1 - weight) + b.x * weight),
        y: Math.round(a.y * (1 - weight) + b.y * weight)
      };
    }
    const only = (a || b) as Point;
    return { x: Math.round(only.x), y: Math.round(only.y) };
  });
}

function centre(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function readBounds(el: Element): Box {
  const bounds = firstChildNamed(el, "bounds");
  const w = bounds ? num(bounds, "width", -1) : -1;
  const h = bounds ? num(bounds, "height", -1) : -1;
  return {
    x: bounds ? num(bounds, "x") : 0,
    y: bounds ? num(bounds, "y") : 0,
    w: w > 0 ? w : DEFAULT_W,
    h: h > 0 ? h : DEFAULT_H
  };
}

function parseStyle(el: Element): VisualStyle | undefined {
  const style: VisualStyle = {};
  const fill = hexColor(attr(el, "fillColor"));
  if (fill) {
    const alpha = attr(el, "alpha");
    if (alpha != null && Number(alpha) < 255) {
      fill.a = Math.round((Number(alpha) / 255) * 100);
    }
    style.fillColor = fill;
  }
  const line = hexColor(attr(el, "lineColor"));
  if (line) {
    style.lineColor = line;
  }
  const lineWidth = attr(el, "lineWidth");
  if (lineWidth) {
    style.lineWidth = Number(lineWidth);
  }
  const fontColor = hexColor(attr(el, "fontColor"));
  const font = parseSwtFont(attr(el, "font"));
  if (fontColor || font) {
    style.font = { ...font, color: fontColor };
  }
  return Object.keys(style).length ? style : undefined;
}

/** SWT FontData string: `1|Segoe UI|9.0|1|WINDOWS|...` (version|name|height pt|style bits|...). */
function parseSwtFont(value: string | undefined): { name?: string; size?: number; style?: string } | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.split("|");
  const name = parts[1] || undefined;
  const pt = Number(parts[2]);
  const bits = Number(parts[3]);
  const styles: string[] = [];
  if (bits & 1) styles.push("bold");
  if (bits & 2) styles.push("italic");
  return {
    name,
    size: Number.isFinite(pt) && pt > 0 ? Math.round(pt * (4 / 3)) : undefined,
    style: styles.length ? styles.join(" ") : undefined
  };
}

function hexColor(value: string | undefined): RgbColor | undefined {
  const m = value && /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!m) {
    return undefined;
  }
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function documentationOf(el: Element): string | undefined {
  return textChild(el, "documentation") || attr(el, "documentation") || undefined;
}

function textChild(el: Element, name: string): string {
  const child = firstChildNamed(el, name);
  return child ? (child.textContent || "").trim() : "";
}

function num(el: Element, name: string, fallback = 0): number {
  const raw = attr(el, name);
  if (raw == null) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
