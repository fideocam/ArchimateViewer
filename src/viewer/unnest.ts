import type { ArchiMateModel, ArchiMateRelationship, DiagramConnection, DiagramNode, DiagramView } from "./types";

const COMPACT_H = 55;
const COMPACT_W = 160;
const GAP = 16;

export interface UnnestOptions {
  /**
   * Which nested boxes may be pulled out of their parent element box. Defaults to all of them
   * for exchange XML and none for Archi `.archimate` files, whose nesting is an authored layout.
   */
  only?: (node: DiagramNode) => boolean;
}

/** A box that left its parent element box: it now lives directly in `containerId`. */
export interface UnnestMove {
  node: DiagramNode;
  /** Group/Container node id, or the view id for the diagram itself. */
  containerId: string;
}

export interface UnnestResult {
  moves: UnnestMove[];
  /** Connections added to replace the visual nesting. */
  connections: DiagramConnection[];
  /** Relationships synthesized because the model had none between parent and child. */
  relationships: ArchiMateRelationship[];
}

interface Context {
  model: ArchiMateModel;
  view: DiagramView;
  only: (node: DiagramNode) => boolean;
  moves: Map<string, UnnestMove>;
  connections: DiagramConnection[];
  relationships: ArchiMateRelationship[];
}

export function unnestElementBoxes(view: DiagramView, model: ArchiMateModel, options: UnnestOptions = {}): UnnestResult {
  if (model.format === "archi" && !options.only) {
    return { moves: [], connections: [], relationships: [] };
  }
  const ctx: Context = {
    model,
    view,
    only: options.only || (() => true),
    moves: new Map(),
    connections: [],
    relationships: []
  };
  view.nodes = explodeList(view.nodes, view.identifier, ctx);
  return { moves: [...ctx.moves.values()], connections: ctx.connections, relationships: ctx.relationships };
}

/** Frames whose nesting is always kept: Groups/Containers and ArchiMate Grouping elements. */
function isVisualContainer(node: DiagramNode, model: ArchiMateModel): boolean {
  if (node.elementRef) {
    return model.elements.get(node.elementRef)?.type === "Grouping";
  }
  return node.xsiType === "Container" || node.xsiType === "Grouping";
}

/** Flattens `nodes`, which all live in `containerId`, returning the new list for that container. */
function explodeList(nodes: DiagramNode[], containerId: string, ctx: Context): DiagramNode[] {
  const out: DiagramNode[] = [];
  for (const node of nodes) {
    if (isVisualContainer(node, ctx.model)) {
      node.children = explodeList(node.children, node.identifier, ctx);
      out.push(node);
      continue;
    }
    const kids = explodeList(node.children, node.identifier, ctx);
    const moving = kids.filter((kid) => ctx.only(kid));
    node.children = kids.filter((kid) => !ctx.only(kid));
    if (moving.length && !node.children.length && ctx.only(node)) {
      compactParent(node);
    }
    out.push(node);
    for (const kid of moving) {
      kid.x += node.x;
      kid.y += node.y;
      separateFromParent(node, kid);
      out.push(kid);
      // Only the box it was drawn in is its real parent; later hops just carry it outward.
      if (!ctx.moves.has(kid.identifier)) {
        ensureRelationshipArrow(ctx, node, kid);
      }
      ctx.moves.set(kid.identifier, { node: kid, containerId });
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

function ensureRelationshipArrow(ctx: Context, parent: DiagramNode, child: DiagramNode) {
  const { model, view } = ctx;
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
    ctx.relationships.push(rel);
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
  ctx.connections.push(connection);
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
