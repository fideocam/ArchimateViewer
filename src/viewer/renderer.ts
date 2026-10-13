import { dashArray, getElementNotation, getRelationshipNotation } from "./notation";
import type {
  ArchiMateModel,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  ElementNotation,
  MarkerKind,
  Point,
  RgbColor,
  VisualStyle
} from "./types";

interface AbsNode {
  node: DiagramNode;
  absX: number;
  absY: number;
  type: string;
  name: string;
  notation: ElementNotation;
}

const PAD = 48;

export function renderView(view: DiagramView, model: ArchiMateModel): string {
  const abs = flattenNodes(view.nodes, model, 0, 0);
  const byId = new Map(abs.map((item) => [item.node.identifier, item]));
  const bounds = contentBounds(abs, view.connections);
  const width = Math.max(bounds.maxX + PAD, 400);
  const height = Math.max(bounds.maxY + PAD, 300);

  const nodeSvg = abs.map((item) => renderNode(item)).join("");
  const connSvg = view.connections
    .map((conn) => renderConnection(conn, byId, model))
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" class="av-diagram" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-view-id="${esc(view.identifier)}">
  <defs>${markerDefs()}</defs>
  <rect class="av-backdrop" x="0" y="0" width="${width}" height="${height}" fill="#f7f7f5"/>
  <g class="av-nodes">${nodeSvg}</g>
  <g class="av-connections">${connSvg}</g>
</svg>`;
}

function flattenNodes(
  nodes: DiagramNode[],
  model: ArchiMateModel,
  ox: number,
  oy: number
): AbsNode[] {
  const out: AbsNode[] = [];
  for (const node of nodes) {
    const absX = ox + node.x;
    const absY = oy + node.y;
    const element = node.elementRef ? model.elements.get(node.elementRef) : undefined;
    const type =
      element?.type ||
      (node.xsiType === "Label" ? "Note" : node.xsiType === "Container" ? "Grouping" : node.xsiType);
    const name = node.label || element?.name || "";
    out.push({
      node,
      absX,
      absY,
      type,
      name,
      notation: getElementNotation(type === "Note" ? "Grouping" : type)
    });
    if (node.children.length) {
      out.push(...flattenNodes(node.children, model, absX, absY));
    }
  }
  return out;
}

function contentBounds(nodes: AbsNode[], connections: DiagramConnection[]) {
  let maxX = 0;
  let maxY = 0;
  for (const item of nodes) {
    maxX = Math.max(maxX, item.absX + item.node.w);
    maxY = Math.max(maxY, item.absY + item.node.h);
  }
  for (const conn of connections) {
    for (const bp of conn.bendpoints) {
      maxX = Math.max(maxX, bp.x);
      maxY = Math.max(maxY, bp.y);
    }
  }
  return { maxX, maxY };
}

function renderNode(item: AbsNode): string {
  const { node, absX, absY, type, name, notation } = item;
  const fill = color(node.style?.fillColor, notation.fill);
  const strokeColor = color(node.style?.lineColor, notation.stroke);
  const sw = node.style?.lineWidth || 1.25;
  const isNote = node.xsiType === "Label" && !node.elementRef;
  const isGroup = node.xsiType === "Container" && !node.elementRef;
  const nestedParent = node.children.length > 0;
  const topLabel = isGroup || nestedParent;
  const shape = isNote ? "note" : isGroup ? "dashed-rounded" : notation.shape;
  const dash = shape.startsWith("dashed") ? "5 4" : undefined;
  const body = shapeMarkup(shape, absX, absY, node.w, node.h, fill, strokeColor, sw, dash);
  const icon =
    isNote || isGroup || shape === "circle"
      ? ""
      : iconMarkup(notation.icon, absX + node.w - 20, absY + 6, strokeColor);
  const fontSize = node.style?.font?.size || (isGroup ? 11 : 12);
  const fontColor = color(node.style?.font?.color, "#222");
  const labelY = topLabel ? absY + 16 : absY + node.h / 2;
  const label = name
    ? textBlock(
        name,
        absX + 8,
        labelY,
        node.w - (topLabel ? 16 : 28),
        node.h - (topLabel ? 8 : 16),
        fontSize,
        fontColor,
        topLabel ? "start" : "middle"
      )
    : "";

  return `<g class="av-node" data-kind="${isNote ? "label" : isGroup ? "container" : "element"}" data-element-id="${esc(node.identifier)}" data-type="${esc(type)}" transform="translate(0,0)">
    ${body}${icon}${label}
  </g>`;
}

function shapeMarkup(
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  sw: number,
  dash?: string
): string {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}`;
  if (shape === "rounded" || shape === "dashed-rounded") {
    const r = Math.min(12, w / 6, h / 3);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${common}/>`;
  }
  if (shape === "folded" || shape === "note") {
    const f = Math.min(14, w / 5, h / 3);
    const path = `M ${x} ${y} H ${x + w - f} L ${x + w} ${y + f} V ${y + h} H ${x} Z`;
    const fold = `M ${x + w - f} ${y} V ${y + f} H ${x + w}`;
    const foldFill = shape === "note" ? "#fff6a8" : shade(fill, -18);
    return `<path d="${path}" ${common}/><path d="${fold}" fill="${foldFill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  if (shape === "bevel") {
    const c = Math.min(12, w / 6, h / 3);
    const d = `M ${x + c} ${y} H ${x + w - c} L ${x + w} ${y + c} V ${y + h - c} L ${x + w - c} ${y + h} H ${x + c} L ${x} ${y + h - c} V ${y + c} Z`;
    return `<path d="${d}" ${common}/>`;
  }
  if (shape === "ellipse") {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common}/>`;
  }
  if (shape === "circle") {
    const r = Math.min(w, h) / 2;
    const filled = fill === "#E8E8E8" ? "#111" : fill;
    return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.max(r, 5)}" ${common} fill="${filled}"/>`;
  }
  if (shape === "box3d") {
    const d = Math.min(12, w / 6, h / 4);
    const front = `M ${x} ${y + d} H ${x + w - d} V ${y + h} H ${x} Z`;
    const top = `M ${x} ${y + d} L ${x + d} ${y} H ${x + w} L ${x + w - d} ${y + d} Z`;
    const side = `M ${x + w - d} ${y + d} L ${x + w} ${y} V ${y + h - d} L ${x + w - d} ${y + h} Z`;
    return `<path d="${front}" ${common}/><path d="${top}" fill="${shade(fill, 16)}" stroke="${stroke}" stroke-width="${sw}"/><path d="${side}" fill="${shade(fill, -12)}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${common}/>`;
}

function iconMarkup(kind: string, x: number, y: number, stroke: string): string {
  if (kind === "none") {
    return "";
  }
  const s = `fill="none" stroke="${stroke}" stroke-width="1.2"`;
  const icons: Record<string, string> = {
    actor: `<circle cx="8" cy="4" r="2.2" ${s}/><path d="M8 6.5 V11 M5 8 H11 M5.5 14 L8 11 L10.5 14" ${s}/>`,
    role: `<circle cx="8" cy="5" r="2.2" ${s}/><path d="M3.5 13 C3.5 9.5 12.5 9.5 12.5 13" ${s}/>`,
    collaboration: `<circle cx="6" cy="8" r="3.2" ${s}/><circle cx="10" cy="8" r="3.2" ${s}/>`,
    interface: `<circle cx="12" cy="8" r="2.4" ${s}/><path d="M2 8 H9.5" ${s}/>`,
    process: `<path d="M2 8 H11 L8 5 M11 8 L8 11" ${s}/>`,
    function: `<rect x="3" y="4" width="10" height="8" rx="3" ${s}/>`,
    event: `<path d="M3 8 L6 4 H13 L10 8 L13 12 H6 Z" ${s}/>`,
    service: `<path d="M4 11 H12 C13.2 11 13.2 7 12 7 H4 C2.8 7 2.8 11 4 11 Z" ${s}/>`,
    object: `<path d="M4 4 H10 L13 7 V13 H4 Z M10 4 V7 H13" ${s}/>`,
    contract: `<path d="M4 4 H12 V13 H4 Z M4 8 H12" ${s}/>`,
    representation: `<path d="M4 5 Q8 2 12 5 V12 Q8 15 4 12 Z" ${s}/>`,
    product: `<rect x="3" y="4" width="10" height="9" ${s}/><path d="M3 7 H13" ${s}/>`,
    component: `<rect x="5" y="4" width="9" height="9" ${s}/><rect x="3" y="6" width="4" height="2" ${s}/><rect x="3" y="9" width="4" height="2" ${s}/>`,
    node: `<path d="M3 6 L8 3 L13 6 V13 L8 16 L3 13 Z M3 6 L8 9 L13 6 M8 9 V16" ${s}/>`,
    device: `<rect x="3" y="4" width="10" height="7" ${s}/><path d="M6 11 V13 H10 V11 M5 13 H11" ${s}/>`,
    software: `<rect x="3" y="4" width="10" height="9" rx="1" ${s}/><path d="M5 7 H11 M5 10 H11" ${s}/>`,
    path: `<path d="M2 6 H14 M2 10 H14" ${s}/>`,
    network: `<circle cx="4" cy="8" r="1.5" ${s}/><circle cx="12" cy="5" r="1.5" ${s}/><circle cx="12" cy="11" r="1.5" ${s}/><path d="M5.4 7.4 L10.6 5.6 M5.4 8.6 L10.6 10.4" ${s}/>`,
    artifact: `<path d="M5 3 H11 L14 6 V14 H5 Z M11 3 V6 H14" ${s}/>`,
    equipment: `<rect x="3" y="6" width="10" height="7" ${s}/><path d="M6 6 V4 H10 V6" ${s}/>`,
    facility: `<path d="M3 13 V7 L8 3 L13 7 V13 Z M7 13 V9 H9 V13" ${s}/>`,
    material: `<path d="M3 12 L5 5 H11 L13 12 Z" ${s}/>`,
    driver: `<circle cx="8" cy="8" r="5" ${s}/><path d="M8 5 V8 L10.5 10" ${s}/>`,
    assessment: `<circle cx="7" cy="7" r="3.2" ${s}/><path d="M9.4 9.4 L13 13" ${s}/>`,
    goal: `<circle cx="8" cy="8" r="5" ${s}/><circle cx="8" cy="8" r="2.2" ${s}/>`,
    outcome: `<circle cx="8" cy="8" r="5" ${s}/><path d="M8 3 L9.2 6.2 L12.5 6.5 L10 8.8 L10.7 12 L8 10.4 L5.3 12 L6 8.8 L3.5 6.5 L6.8 6.2 Z" ${s}/>`,
    principle: `<path d="M4 3 H12 V13 H4 Z M4 7 H12" ${s}/>`,
    requirement: `<path d="M3 4 H13 L11 13 H5 Z" ${s}/>`,
    constraint: `<path d="M3 4 H13 L11 13 H5 Z M5 8.5 H11" ${s}/>`,
    meaning: `<ellipse cx="8" cy="7" rx="5" ry="4" ${s}/><path d="M6 11 L5 14" ${s}/>`,
    value: `<ellipse cx="8" cy="8" rx="5.5" ry="4" ${s}/>`,
    plateau: `<rect x="3" y="5" width="10" height="7" ${s}/><path d="M3 8 H13" ${s}/>`,
    gap: `<path d="M4 4 H12 V13 H4 Z M6 8 H10" ${s}/>`,
    location: `<path d="M8 13 C8 13 4 8 4 6 A4 4 0 1 1 12 6 C12 8 8 13 8 13 Z" ${s}/><circle cx="8" cy="6" r="1.2" ${s}/>`,
    resource: `<rect x="3" y="5" width="10" height="7" ${s}/><path d="M6 5 V3 H10 V5" ${s}/>`,
    course: `<path d="M3 12 L8 4 L13 12" ${s}/>`
  };
  const inner = icons[kind] || icons.function;
  return `<g class="av-icon" transform="translate(${x},${y}) scale(0.9)">${inner}</g>`;
}

function textBlock(
  text: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  size: number,
  fill: string,
  anchor: "middle" | "start"
): string {
  const lines = wrap(text, maxW, size).slice(0, Math.max(1, Math.floor(maxH / (size + 2))));
  const startY =
    anchor === "start" ? y : y - ((lines.length - 1) * (size + 2)) / 2;
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : size + 2;
      return `<tspan x="${anchor === "middle" ? x + maxW / 2 - 4 : x}" dy="${dy}">${esc(line)}</tspan>`;
    })
    .join("");
  return `<text x="${anchor === "middle" ? x + maxW / 2 - 4 : x}" y="${startY}" text-anchor="${anchor}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${size}" fill="${fill}">${tspans}</text>`;
}

function wrap(text: string, maxW: number, size: number): string[] {
  const widthOf = (s: string) => s.length * size * 0.58;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [text];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (widthOf(next) > maxW && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function renderConnection(
  conn: DiagramConnection,
  nodes: Map<string, AbsNode>,
  model: ArchiMateModel
): string {
  const source = nodes.get(conn.source);
  const target = nodes.get(conn.target);
  if (!source || !target) {
    return "";
  }
  const rel = conn.relationshipRef ? model.relationships.get(conn.relationshipRef) : undefined;
  const type = rel?.type || "Association";
  const notation = getRelationshipNotation(type);
  const stroke = color(conn.style?.lineColor, "#222");
  const sw = conn.style?.lineWidth || 1.35;
  const dash = dashArray(notation.dash);
  const points = route(source, target, conn.bendpoints);
  const d = pointsToPath(points);
  const srcMarker = markerUrl(notation.sourceMarker, stroke, "start");
  const tgtMarker = markerUrl(notation.targetMarker, stroke, "end");
  const label = conn.label || rel?.name || "";
  const mid = points[Math.floor(points.length / 2)];
  const labelSvg = label
    ? `<text x="${mid.x}" y="${mid.y - 6}" text-anchor="middle" font-size="11" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${stroke}">${esc(label)}</text>`
    : "";
  return `<g class="av-connection" data-kind="relationship" data-element-id="${esc(conn.identifier)}" data-type="${esc(type)}">
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""} marker-start="${srcMarker}" marker-end="${tgtMarker}"/>
    ${labelSvg}
  </g>`;
}

function route(source: AbsNode, target: AbsNode, bendpoints: Point[]): Point[] {
  const sourceBox = boxOf(source);
  const targetBox = boxOf(target);
  if (!bendpoints.length) {
    const a = attach(sourceBox, center(targetBox));
    const b = attach(targetBox, center(sourceBox));
    return [a, b];
  }
  const first = bendpoints[0];
  const last = bendpoints[bendpoints.length - 1];
  return [attach(sourceBox, first), ...bendpoints, attach(targetBox, last)];
}

function boxOf(item: AbsNode) {
  return { x: item.absX, y: item.absY, w: item.node.w, h: item.node.h };
}

function center(box: { x: number; y: number; w: number; h: number }): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function attach(box: { x: number; y: number; w: number; h: number }, toward: Point): Point {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) {
    return { x: box.x + box.w, y: c.y };
  }
  const tx = dx === 0 ? Infinity : (box.w / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (box.h / 2) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function pointsToPath(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function markerDefs(): string {
  const kinds: MarkerKind[] = [
    "filled-diamond",
    "open-diamond",
    "filled-circle",
    "open-circle",
    "filled-arrow",
    "open-arrow",
    "open-triangle"
  ];
  return kinds
    .map((kind) => {
      const start = markerShape(kind, true);
      const end = markerShape(kind, false);
      return `${start}${end}`;
    })
    .join("");
}

function markerShape(kind: MarkerKind, start: boolean): string {
  const id = markerId(kind, start ? "start" : "end");
  const orient = "auto";
  if (kind === "filled-diamond" || kind === "open-diamond") {
    const fill = kind === "filled-diamond" ? "#222" : "white";
    return `<marker id="${id}" markerWidth="12" markerHeight="12" refX="${start ? 1 : 11}" refY="6" orient="${orient}" markerUnits="userSpaceOnUse"><path d="M1 6 L6 2 L11 6 L6 10 Z" fill="${fill}" stroke="#222" stroke-width="1"/></marker>`;
  }
  if (kind === "filled-circle" || kind === "open-circle") {
    const fill = kind === "filled-circle" ? "#222" : "white";
    return `<marker id="${id}" markerWidth="10" markerHeight="10" refX="${start ? 3 : 7}" refY="5" orient="${orient}" markerUnits="userSpaceOnUse"><circle cx="5" cy="5" r="3.2" fill="${fill}" stroke="#222" stroke-width="1"/></marker>`;
  }
  if (kind === "filled-arrow") {
    return `<marker id="${id}" markerWidth="12" markerHeight="10" refX="${start ? 1 : 11}" refY="5" orient="${orient}" markerUnits="userSpaceOnUse"><path d="M1 1 L11 5 L1 9 Z" fill="#222"/></marker>`;
  }
  if (kind === "open-arrow") {
    return `<marker id="${id}" markerWidth="12" markerHeight="10" refX="${start ? 1 : 10}" refY="5" orient="${orient}" markerUnits="userSpaceOnUse"><path d="M1 1 L10 5 L1 9" fill="none" stroke="#222" stroke-width="1.3"/></marker>`;
  }
  if (kind === "open-triangle") {
    return `<marker id="${id}" markerWidth="14" markerHeight="12" refX="${start ? 1 : 13}" refY="6" orient="${orient}" markerUnits="userSpaceOnUse"><path d="M1 1 L13 6 L1 11 Z" fill="white" stroke="#222" stroke-width="1.2"/></marker>`;
  }
  return "";
}

function markerUrl(kind: MarkerKind, _stroke: string, end: "start" | "end"): string {
  if (kind === "none") {
    return "";
  }
  return `url(#${markerId(kind, end)})`;
}

function markerId(kind: MarkerKind, end: "start" | "end"): string {
  return `av-${kind}-${end}`;
}

function color(value: RgbColor | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  if (value.a != null && value.a < 100) {
    const a = Math.max(0, Math.min(1, value.a / 100));
    return `rgba(${value.r},${value.g},${value.b},${a})`;
  }
  return `rgb(${value.r},${value.g},${value.b})`;
}

function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    return hex;
  }
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
