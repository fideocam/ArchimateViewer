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

export function removeFromXml(xml: string, ids: string[]): string {
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

function elementSpan(xml: string, id: string): { start: number; end: number } | null {
  const at = xml.indexOf(`identifier="${id}"`) >= 0 ? xml.indexOf(`identifier="${id}"`) : xml.indexOf(`identifier='${id}'`);
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
