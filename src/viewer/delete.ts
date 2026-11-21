import type { ArchiMateModel, DiagramNode, DiagramView } from "./types";

export interface DeletionPlan {
  rootNodeIds: string[];
  nodeIds: string[];
  connectionIds: string[];
  elementIds: string[];
  relationshipIds: string[];
}

export function planDeletion(
  model: ArchiMateModel,
  kind: "node" | "connection",
  id: string
): DeletionPlan | null {
  const nodeIds = new Set<string>();
  const rootNodeIds = new Set<string>();
  const connectionIds = new Set<string>();

  if (kind === "node") {
    const node = findNodeInViews(model.views, id);
    if (!node) {
      return null;
    }
    rootNodeIds.add(id);
    collectNodeIds(node, nodeIds);
  } else if (!model.views.some((view) => view.connections.some((conn) => conn.identifier === id))) {
    return null;
  } else {
    connectionIds.add(id);
  }

  for (const view of model.views) {
    for (const conn of view.connections) {
      if (nodeIds.has(conn.source) || nodeIds.has(conn.target)) {
        connectionIds.add(conn.identifier);
      }
    }
  }

  const elementIds = new Set<string>();
  for (const view of model.views) {
    walkNodes(view.nodes, (node) => {
      if (nodeIds.has(node.identifier) && node.elementRef) {
        elementIds.add(node.elementRef);
      }
    });
  }
  for (const view of model.views) {
    walkNodes(view.nodes, (node) => {
      if (!nodeIds.has(node.identifier) && node.elementRef) {
        elementIds.delete(node.elementRef);
      }
    });
  }
  for (const rel of model.relationships.values()) {
    elementIds.delete(rel.source);
    elementIds.delete(rel.target);
  }

  const relationshipIds = new Set<string>();
  if (kind === "connection") {
    for (const view of model.views) {
      for (const conn of view.connections) {
        if (connectionIds.has(conn.identifier) && conn.relationshipRef) {
          relationshipIds.add(conn.relationshipRef);
        }
      }
    }
    for (const view of model.views) {
      for (const conn of view.connections) {
        if (!connectionIds.has(conn.identifier) && conn.relationshipRef) {
          relationshipIds.delete(conn.relationshipRef);
        }
      }
    }
  } else {
    for (const [relId, rel] of model.relationships) {
      if (elementIds.has(rel.source) || elementIds.has(rel.target)) {
        relationshipIds.add(relId);
      }
    }
  }
  for (const view of model.views) {
    for (const conn of view.connections) {
      if (conn.relationshipRef && relationshipIds.has(conn.relationshipRef)) {
        connectionIds.add(conn.identifier);
      }
    }
  }

  return {
    rootNodeIds: [...rootNodeIds],
    nodeIds: [...nodeIds],
    connectionIds: [...connectionIds],
    elementIds: [...elementIds],
    relationshipIds: [...relationshipIds]
  };
}

export function applyDeletion(model: ArchiMateModel, plan: DeletionPlan) {
  const nodes = new Set(plan.nodeIds);
  const connections = new Set(plan.connectionIds);
  const elements = new Set(plan.elementIds);
  const relationships = new Set(plan.relationshipIds);
  for (const view of model.views) {
    view.nodes = pruneNodes(view.nodes, nodes);
    view.connections = view.connections.filter((conn) => !connections.has(conn.identifier));
  }
  for (const id of elements) {
    model.elements.delete(id);
  }
  for (const id of relationships) {
    model.relationships.delete(id);
  }
}

export function setIdentifierAttribute(
  xml: string,
  identifier: string,
  attribute: string,
  value: string
): string {
  const at = idAttributeIndex(xml, identifier);
  if (at < 0) {
    return xml;
  }
  const tagStart = xml.lastIndexOf("<", at);
  const tagEnd = xml.indexOf(">", at);
  if (tagStart < 0 || tagEnd < 0) {
    return xml;
  }
  const tag = xml.slice(tagStart, tagEnd);
  const next = tag.replace(new RegExp(`(\\s${attribute}=)(["'])[^"']*\\2`), `$1"${escapeXmlAttr(value)}"`);
  if (next === tag) {
    return xml;
  }
  return xml.slice(0, tagStart) + next + xml.slice(tagEnd);
}

/**
 * Re-point one end of an Archi diagram connection. Archi nests each `sourceConnection` inside its
 * source `child` and lists incoming connection ids in the target's `targetConnections` attribute,
 * so both have to follow the new end for Archi to reopen the file.
 */
export function retargetArchiConnection(
  xml: string,
  connectionId: string,
  end: "source" | "target",
  oldNodeId: string,
  newNodeId: string
): string {
  let out = setIdentifierAttribute(xml, connectionId, end, newNodeId);
  if (end === "target") {
    out = editTargetConnections(out, oldNodeId, (ids) => ids.filter((id) => id !== connectionId));
    return editTargetConnections(out, newNodeId, (ids) => (ids.includes(connectionId) ? ids : [...ids, connectionId]));
  }
  const span = elementSpan(out, connectionId);
  if (!span) {
    return out;
  }
  const fragment = out.slice(span.start, span.end);
  out = removeSpans(out, [connectionId]);
  return appendInside(out, newNodeId, fragment) ?? xml;
}

/**
 * Move an Archi diagram `child` (with everything nested in it) into another container — a Group
 * `child` or the diagram element itself — and rewrite its `<bounds>` to the node's new geometry,
 * which must already be relative to that container.
 */
export function moveArchiChild(
  xml: string,
  node: { identifier: string; x: number; y: number; w: number; h: number },
  containerId: string
): string {
  const span = elementSpan(xml, node.identifier);
  if (!span || !elementSpan(xml, containerId)) {
    return xml;
  }
  const oldIndent = lineIndent(xml, span.start);
  const fragment = setOwnBounds(xml.slice(span.start, span.end), node);
  const out = removeSpans(xml, [node.identifier]);
  return appendInside(out, containerId, fragment, oldIndent) ?? xml;
}

/** Add a diagram connection in Archi's shape: nested in the source `child`, listed on the target. */
export function addArchiConnection(
  xml: string,
  conn: { identifier: string; source: string; target: string; relationshipRef?: string }
): string {
  const relationship = conn.relationshipRef ? ` archimateRelationship="${escapeXmlAttr(conn.relationshipRef)}"` : "";
  const fragment = `<sourceConnection xsi:type="archimate:Connection" id="${escapeXmlAttr(conn.identifier)}" source="${escapeXmlAttr(conn.source)}" target="${escapeXmlAttr(conn.target)}"${relationship}/>`;
  const out = appendInside(xml, conn.source, fragment);
  if (out == null) {
    return xml;
  }
  return editTargetConnections(out, conn.target, (ids) => (ids.includes(conn.identifier) ? ids : [...ids, conn.identifier]));
}

/** Add a model relationship to the `relations` folder (creating the folder if the file has none). */
export function addArchiRelationship(
  xml: string,
  rel: { identifier: string; type: string; source: string; target: string; name?: string }
): string {
  const name = rel.name ? ` name="${escapeXmlAttr(rel.name)}"` : "";
  const fragment = `<element xsi:type="archimate:${escapeXmlAttr(rel.type)}Relationship"${name} id="${escapeXmlAttr(rel.identifier)}" source="${escapeXmlAttr(rel.source)}" target="${escapeXmlAttr(rel.target)}"/>`;
  const folder = /<folder\b[^>]*\stype=(["'])relations\1[^>]*>/.exec(xml);
  const folderId = folder && /\sid=(["'])([^"']+)\1/.exec(folder[0])?.[2];
  if (folderId) {
    return appendInside(xml, folderId, fragment) ?? xml;
  }
  const close = xml.lastIndexOf("</");
  if (close < 0) {
    return xml;
  }
  return `${xml.slice(0, close)}  <folder name="Relations" id="id-folder-relations" type="relations">\n    ${fragment}\n  </folder>\n${xml.slice(close)}`;
}

/**
 * Insert `fragment` as the last child of the element named `parentId`. When `fragmentIndent` is
 * given, the fragment's continuation lines are re-indented to match its new depth.
 */
function appendInside(xml: string, parentId: string, fragment: string, fragmentIndent?: string): string | null {
  const parent = elementSpan(xml, parentId);
  if (!parent) {
    return null;
  }
  const openEnd = xml.indexOf(">", parent.start);
  const indent = lineIndent(xml, parent.start);
  const inner = `${indent}  `;
  const body = fragmentIndent == null ? fragment : fragment.split(`\n${fragmentIndent}`).join(`\n${inner}`);
  if (xml[openEnd - 1] === "/") {
    const name = /^<([A-Za-z_][\w:.-]*)/.exec(xml.slice(parent.start))?.[1] || "child";
    const open = xml.slice(parent.start, openEnd - 1).replace(/\s+$/, "");
    return `${xml.slice(0, parent.start)}${open}>\n${inner}${body}\n${indent}</${name}>${xml.slice(parent.end)}`;
  }
  const closeStart = xml.lastIndexOf("</", parent.end - 1);
  const lineStart = xml.lastIndexOf("\n", closeStart - 1) + 1;
  if (/^[ \t]*$/.test(xml.slice(lineStart, closeStart))) {
    return `${xml.slice(0, lineStart)}${inner}${body}\n${xml.slice(lineStart)}`;
  }
  return `${xml.slice(0, closeStart)}\n${inner}${body}\n${indent}${xml.slice(closeStart)}`;
}

/** Replace (or add) the `<bounds>` that belongs to the outermost `child` of `fragment`. */
function setOwnBounds(fragment: string, box: { x: number; y: number; w: number; h: number }): string {
  const bounds = `<bounds x="${Math.round(box.x)}" y="${Math.round(box.y)}" width="${Math.round(box.w)}" height="${Math.round(box.h)}"/>`;
  const openEnd = fragment.indexOf(">");
  if (fragment[openEnd - 1] === "/") {
    const name = /^<([A-Za-z_][\w:.-]*)/.exec(fragment)?.[1] || "child";
    return `${fragment.slice(0, openEnd - 1).replace(/\s+$/, "")}>${bounds}</${name}>`;
  }
  const own = /<bounds\b[^>]*?(\/>|>[\s\S]*?<\/bounds>)/.exec(fragment.slice(openEnd));
  const nested = fragment.slice(openEnd).search(/<(child|sourceConnection)\b/);
  if (own && (nested < 0 || own.index < nested)) {
    const start = openEnd + own.index;
    return fragment.slice(0, start) + bounds + fragment.slice(start + own[0].length);
  }
  return `${fragment.slice(0, openEnd + 1)}${bounds}${fragment.slice(openEnd + 1)}`;
}

export function removeFromXml(xml: string, ids: string[]): string {
  return removeSpans(dropTargetConnections(xml, new Set(ids)), ids);
}

/** Archi lists incoming connection ids on the target `child`; drop references to removed connections. */
function dropTargetConnections(xml: string, removed: Set<string>): string {
  if (/\stargetConnections=/.test(xml)) {
    xml = xml.replace(/(\s)targetConnections=(["'])([^"']*)\2/g, (_match, space: string, quote: string, value: string) => {
      const kept = value.split(/\s+/).filter((id) => id && !removed.has(id));
      return kept.length ? `${space}targetConnections=${quote}${kept.join(" ")}${quote}` : "";
    });
  }
  return xml;
}

function removeSpans(xml: string, ids: string[]): string {
  const spans = ids
    .map((id) => elementSpan(xml, id))
    .filter((span): span is { start: number; end: number } => Boolean(span))
    .sort((a, b) => a.start - b.start);
  const outer = spans.filter((span, index) => !spans.some((other, otherIndex) => otherIndex !== index && other.start <= span.start && other.end >= span.end));
  let out = xml;
  for (const span of [...outer].reverse()) {
    let start = span.start;
    const lineStart = out.lastIndexOf("\n", start - 1) + 1;
    if (/^[ \t]*$/.test(out.slice(lineStart, start))) {
      start = lineStart;
    }
    let end = span.end;
    if (out[end] === "\r") {
      end += 1;
    }
    if (out[end] === "\n") {
      end += 1;
    }
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function editTargetConnections(xml: string, nodeId: string, edit: (ids: string[]) => string[]): string {
  const at = idAttributeIndex(xml, nodeId);
  if (at < 0) {
    return xml;
  }
  const tagStart = xml.lastIndexOf("<", at);
  const tagEnd = xml.indexOf(">", at);
  const selfClosing = xml[tagEnd - 1] === "/";
  const tag = xml.slice(tagStart, selfClosing ? tagEnd - 1 : tagEnd);
  const match = /\stargetConnections=(["'])([^"']*)\1/.exec(tag);
  const ids = edit(match ? match[2].split(/\s+/).filter(Boolean) : []);
  const attribute = ids.length ? ` targetConnections="${ids.map(escapeXmlAttr).join(" ")}"` : "";
  const next = match ? tag.replace(match[0], attribute) : tag.replace(/\s*$/, "") + attribute;
  return xml.slice(0, tagStart) + next + xml.slice(selfClosing ? tagEnd - 1 : tagEnd);
}

function lineIndent(xml: string, index: number): string {
  const lineStart = xml.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t]*/.exec(xml.slice(lineStart, index))?.[0] || "";
}

/** Index of the `identifier="…"` (exchange) or `id="…"` (Archi) attribute that names `id`. */
function idAttributeIndex(xml: string, id: string): number {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\s(?:identifier|id)=(["'])${escaped}\\1`).exec(xml);
  return match ? match.index + 1 : -1;
}

function elementSpan(xml: string, id: string): { start: number; end: number } | null {
  const at = idAttributeIndex(xml, id);
  if (at < 0) {
    return null;
  }
  const start = xml.lastIndexOf("<", at);
  if (start < 0) {
    return null;
  }
  const end = elementEnd(xml, start);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

function elementEnd(xml: string, start: number): number {
  const open = /^<([A-Za-z_][\w:.-]*)/.exec(xml.slice(start));
  if (!open) {
    return start;
  }
  const name = open[1];
  const startEnd = xml.indexOf(">", start);
  if (startEnd < 0) {
    return xml.length;
  }
  if (xml[startEnd - 1] === "/") {
    return startEnd + 1;
  }
  let depth = 1;
  let index = startEnd + 1;
  while (depth > 0 && index < xml.length) {
    const next = xml.indexOf("<", index);
    if (next < 0) {
      return xml.length;
    }
    if (xml.startsWith(`</${name}>`, next) || xml.startsWith(`</${name} `, next)) {
      depth -= 1;
      const closeEnd = xml.indexOf(">", next);
      index = closeEnd < 0 ? xml.length : closeEnd + 1;
      if (depth === 0) {
        return index;
      }
      continue;
    }
    if (xml.startsWith(`<${name}`, next)) {
      const after = xml[next + name.length + 1];
      if (!after || /[\s/>]/.test(after)) {
        const tagEnd = xml.indexOf(">", next);
        if (tagEnd < 0) {
          return xml.length;
        }
        if (xml[tagEnd - 1] !== "/") {
          depth += 1;
        }
        index = tagEnd + 1;
        continue;
      }
    }
    index = next + 1;
  }
  return index;
}

function findNodeInViews(views: DiagramView[], id: string): DiagramNode | undefined {
  for (const view of views) {
    const node = findNode(view.nodes, id);
    if (node) {
      return node;
    }
  }
  return undefined;
}

function findNode(nodes: DiagramNode[], id: string): DiagramNode | undefined {
  for (const node of nodes) {
    if (node.identifier === id) {
      return node;
    }
    const child = findNode(node.children, id);
    if (child) {
      return child;
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

function walkNodes(nodes: DiagramNode[], visit: (node: DiagramNode) => void) {
  for (const node of nodes) {
    visit(node);
    walkNodes(node.children, visit);
  }
}

function pruneNodes(nodes: DiagramNode[], removed: Set<string>): DiagramNode[] {
  return nodes
    .filter((node) => !removed.has(node.identifier))
    .map((node) => ({ ...node, children: pruneNodes(node.children, removed) }));
}
