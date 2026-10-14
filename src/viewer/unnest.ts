import type { ArchiMateModel, ArchiMateRelationship, DiagramConnection, DiagramNode, DiagramView } from "./types";

const COMPACT_H = 55;
const COMPACT_W = 160;
const GAP = 16;

export function unnestElementBoxes(view: DiagramView, model: ArchiMateModel): void {
  view.nodes = explodeList(view.nodes, model, view);
}

function isVisualContainer(node: DiagramNode): boolean {
  return !node.elementRef && (node.xsiType === "Container" || node.xsiType === "Grouping");
}

function explodeList(nodes: DiagramNode[], model: ArchiMateModel, view: DiagramView): DiagramNode[] {
  const out: DiagramNode[] = [];
  for (const node of nodes) {
    if (isVisualContainer(node)) {
      node.children = explodeList(node.children, model, view);
      out.push(node);
      continue;
    }
    const originX = node.x;
    const originY = node.y;
    const kids = explodeList(node.children, model, view);
    node.children = [];
    if (kids.length) {
      compactParent(node);
    }
    out.push(node);
    for (const kid of kids) {
      kid.x += originX;
      kid.y += originY;
      separateFromParent(node, kid);
      out.push(kid);
      ensureRelationshipArrow(view, model, node, kid);
    }
  }
  return out;
}

function compactParent(node: DiagramNode) {
  if (node.h > COMPACT_H + 8) {
    node.h = COMPACT_H;
  }
  if (node.w > 240) {
    node.w = Math.max(COMPACT_W, Math.min(200, node.w));
  }
}

function separateFromParent(parent: DiagramNode, kid: DiagramNode) {
  if (!overlaps(parent, kid)) {
    return;
  }
  kid.y = parent.y + parent.h + GAP;
}

function overlaps(a: DiagramNode, b: DiagramNode): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function ensureRelationshipArrow(
  view: DiagramView,
  model: ArchiMateModel,
  parent: DiagramNode,
  child: DiagramNode
) {
  if (!parent.elementRef || !child.elementRef) {
    return;
  }
  const linked = view.connections.some(
    (conn) =>
      (conn.source === parent.identifier && conn.target === child.identifier) ||
      (conn.source === child.identifier && conn.target === parent.identifier)
  );
  if (linked) {
    return;
  }

  let rel = findRelationship(model, parent.elementRef, child.elementRef);
  let source = parent;
  let target = child;
  if (rel) {
    if (rel.source === child.elementRef) {
      source = child;
      target = parent;
    }
  } else {
    rel = {
      identifier: `id-rel-${parent.identifier}-${child.identifier}`,
      type: "Composition",
      name: "",
      source: parent.elementRef,
      target: child.elementRef
    };
    model.relationships.set(rel.identifier, rel);
  }

  const connection: DiagramConnection = {
    identifier: `id-conn-${parent.identifier}-${child.identifier}`,
    xsiType: "Relationship",
    source: source.identifier,
    target: target.identifier,
    relationshipRef: rel.identifier,
    bendpoints: []
  };
  view.connections.push(connection);
}

function findRelationship(
  model: ArchiMateModel,
  a: string,
  b: string
): ArchiMateRelationship | undefined {
  for (const rel of model.relationships.values()) {
    if ((rel.source === a && rel.target === b) || (rel.source === b && rel.target === a)) {
      return rel;
    }
  }
  return undefined;
}
