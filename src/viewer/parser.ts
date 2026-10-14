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
import {
  attr,
  childrenNamed,
  childrenOf,
  descendantsNamed,
  firstChildNamed,
  isArchiMateModel,
  localName,
  numAttr,
  parseXml,
  textOf,
  xsiType
} from "./xml";

const DEFAULT_W = 120;
const DEFAULT_H = 55;
const NESTING_RELATIONS = new Set(["Composition", "Aggregation", "Assignment"]);

export function parseModel(xml: string): ArchiMateModel {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root || !isArchiMateModel(root)) {
    throw new Error("Not an Open Group ArchiMate Model Exchange XML file");
  }

  const warnings: string[] = [];
  const elements = new Map<string, ArchiMateElement>();
  const relationships = new Map<string, ArchiMateRelationship>();

  const elementsContainer = firstChildNamed(root, "elements");
  if (elementsContainer) {
    for (const el of childrenNamed(elementsContainer, "element")) {
      const identifier = attr(el, "identifier");
      if (!identifier) {
        warnings.push("Skipped element without identifier");
        continue;
      }
      elements.set(identifier, {
        identifier,
        type: xsiType(el) || "Element",
        name: textOf(el),
        documentation: textOf(el, ["documentation"]) || undefined
      });
    }
  }

  const relationshipsContainer = firstChildNamed(root, "relationships");
  if (relationshipsContainer) {
    for (const el of childrenNamed(relationshipsContainer, "relationship")) {
      const identifier = attr(el, "identifier");
      const source = attr(el, "source");
      const target = attr(el, "target");
      if (!identifier || !source || !target) {
        warnings.push("Skipped relationship missing identifier/source/target");
        continue;
      }
      relationships.set(identifier, {
        identifier,
        type: normalizeRelationshipType(xsiType(el) || "Association"),
        name: textOf(el),
        source,
        target,
        accessType: attr(el, "accessType"),
        modifier: attr(el, "modifier"),
        isDirected: attr(el, "isDirected") === "true" || attr(el, "directed") === "true",
        documentation: textOf(el, ["documentation"]) || undefined
      });
    }
  }

  const views = parseViews(root, warnings, elements, relationships);

  return {
    identifier: attr(root, "identifier") || "model",
    name: textOf(root) || "ArchiMate Model",
    documentation: textOf(root, ["documentation"]) || undefined,
    elements,
    relationships,
    views,
    warnings
  };
}

function parseViews(
  root: Element,
  warnings: string[],
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
): DiagramView[] {
  const viewEls = collectDiagramViewElements(root);
  const views = viewEls.map((viewEl, index) => parseView(viewEl, index, warnings));
  const byId = new Map(views.map((view) => [view.identifier, view]));
  const visiting = new Set<string>();
  for (const view of views) {
    finalizeView(view, byId, visiting, elements, relationships);
  }
  return views.filter((view) => view.nodes.length > 0);
}

function collectDiagramViewElements(root: Element): Element[] {
  const viewsEl = firstChildNamed(root, "views") || root;
  const diagrams = firstChildNamed(viewsEl, "diagrams");
  const scopes: Element[] = [];
  if (diagrams) {
    scopes.push(diagrams);
  }
  for (const child of childrenOf(viewsEl)) {
    const name = localName(child);
    if (name === "view" || name === "diagram") {
      scopes.push(child);
    }
  }
  if (!scopes.length) {
    scopes.push(viewsEl);
  }

  const found: Element[] = [];
  const seen = new Set<Element>();
  const walk = (el: Element) => {
    const name = localName(el);
    if (name === "viewpoints" || name === "viewpoint") {
      return;
    }
    if ((name === "view" || name === "diagram") && !seen.has(el)) {
      seen.add(el);
      found.push(el);
    }
    for (const child of childrenOf(el)) {
      walk(child);
    }
  };
  for (const scope of scopes) {
    if (localName(scope) === "view" || localName(scope) === "diagram") {
      walk(scope);
    } else {
      for (const child of childrenOf(scope)) {
        walk(child);
      }
    }
  }
  return found.filter((el) => !isFolderView(el) && !isViewpointCatalog(el));
}

function isFolderView(el: Element): boolean {
  const nested = [...childrenNamed(el, "view"), ...childrenNamed(el, "diagram")];
  if (!nested.length) {
    return false;
  }
  return graphicElements(el).length === 0 && collectViewRefs(el).length === 0 && connectionElements(el).length === 0;
}

function isViewpointCatalog(el: Element): boolean {
  const type = xsiType(el);
  if (type === "Diagram") {
    return false;
  }
  if (type !== "Viewpoint") {
    return false;
  }
  return graphicElements(el).length === 0 && collectViewRefs(el).length === 0 && connectionElements(el).length === 0;
}

function parseView(viewEl: Element, index: number, warnings: string[]): DiagramView {
  const identifier = identifierOf(viewEl) || `view-${index + 1}`;
  return {
    identifier,
    name: textOf(viewEl) || `View ${index + 1}`,
    documentation: textOf(viewEl, ["documentation"]) || undefined,
    viewRefs: collectViewRefs(viewEl),
    nodes: graphicElements(viewEl).map((node) => parseNode(node, warnings)),
    connections: connectionElements(viewEl).map((conn) => parseConnection(conn, warnings))
  };
}

function parseNode(el: Element, warnings: string[]): DiagramNode {
  const identifier = identifierOf(el) || `node-${Math.random().toString(36).slice(2)}`;
  if (!identifierOf(el)) {
    warnings.push("Diagram node was missing an identifier");
  }
  const bounds = readBounds(el);
  const viewRef = collectViewRefs(el)[0];
  return {
    identifier,
    xsiType: xsiType(el) || localName(el),
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    elementRef: elementRefOf(el),
    viewRef,
    label: textOf(el) || undefined,
    style: parseStyle(el),
    children: graphicElements(el).map((child) => parseNode(child, warnings))
  };
}

function parseConnection(el: Element, warnings: string[]): DiagramConnection {
  const identifier = identifierOf(el) || `conn-${Math.random().toString(36).slice(2)}`;
  if (!identifierOf(el)) {
    warnings.push("Diagram connection was missing an identifier");
  }
  return {
    identifier,
    xsiType: xsiType(el) || "Relationship",
    source: attr(el, "source") || "",
    target: attr(el, "target") || "",
    relationshipRef: attr(el, "relationshipRef") || attr(el, "archimateRelationship"),
    label: textOf(el) || undefined,
    style: parseStyle(el),
    bendpoints: descendantsNamed(el, "bendpoint").map(
      (bp): Point => ({
        x: numberFrom(bp, ["x", "startX"]) ?? 0,
        y: numberFrom(bp, ["y", "startY"]) ?? 0
      })
    )
  };
}

function finalizeView(
  view: DiagramView,
  byId: Map<string, DiagramView>,
  visiting: Set<string>,
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
) {
  if (visiting.has(view.identifier)) {
    return;
  }
  visiting.add(view.identifier);
  expandEmptyContainers(view, elements, relationships);
  resolveConnections(view, elements, relationships);
  for (const ref of viewRefsOf(view)) {
    const target = byId.get(ref);
    if (target) {
      finalizeView(target, byId, visiting, elements, relationships);
    }
  }
  inlineViewRefs(view, byId);
}

function expandEmptyContainers(
  view: DiagramView,
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
) {
  const present = new Set<string>();
  collectElementRefs(view.nodes, present);
  const walk = (nodes: DiagramNode[]) => {
    for (const node of nodes) {
      if (shouldExpandContainer(node, elements) && node.elementRef) {
        const members = membersOf(node.elementRef, elements, relationships);
        let index = 0;
        for (const member of members) {
          if (present.has(member.identifier)) {
            continue;
          }
          present.add(member.identifier);
          node.children.push({
            identifier: `${node.identifier}-member-${member.identifier}`,
            xsiType: "Element",
            x: 16 + (index % 2) * 168,
            y: 40 + Math.floor(index / 2) * 72,
            w: 150,
            h: 55,
            elementRef: member.identifier,
            children: []
          });
          index += 1;
        }
      }
      walk(node.children);
    }
  };
  walk(view.nodes);
}

function shouldExpandContainer(node: DiagramNode, elements: Map<string, ArchiMateElement>): boolean {
  if (!node.elementRef || node.children.length) {
    return false;
  }
  const type = elements.get(node.elementRef)?.type || node.xsiType;
  return type === "Grouping" || node.xsiType === "Container" || node.xsiType === "Grouping";
}

function membersOf(
  parentId: string,
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
): ArchiMateElement[] {
  const members: ArchiMateElement[] = [];
  for (const rel of relationships.values()) {
    if (!NESTING_RELATIONS.has(rel.type) || rel.source !== parentId) {
      continue;
    }
    const target = elements.get(rel.target);
    if (target) {
      members.push(target);
    }
  }
  return members;
}

function resolveConnections(
  view: DiagramView,
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
) {
  const { byId, byElement } = indexNodes(view.nodes);
  const ensureNode = (key: string | undefined): DiagramNode | undefined => {
    if (!key) {
      return undefined;
    }
    const existing = byId.get(key) || byElement.get(key);
    if (existing) {
      return existing;
    }
    const element = elements.get(key);
    if (!element) {
      return undefined;
    }
    const node = synthesizedNode(element, view.nodes.length);
    view.nodes.push(node);
    byId.set(node.identifier, node);
    byElement.set(element.identifier, node);
    return node;
  };

  for (const conn of view.connections) {
    const rel = conn.relationshipRef ? relationships.get(conn.relationshipRef) : undefined;
    const source = ensureNode(conn.source || rel?.source);
    const target = ensureNode(conn.target || rel?.target);
    if (source) {
      conn.source = source.identifier;
    }
    if (target) {
      conn.target = target.identifier;
    }
  }
}

function inlineViewRefs(view: DiagramView, byId: Map<string, DiagramView>) {
  for (const node of flattenNodeList(view.nodes)) {
    if (node.w <= 0) {
      node.w = DEFAULT_W;
    }
    if (node.h <= 0) {
      node.h = DEFAULT_H;
    }
    if (node.viewRef && !node.label) {
      node.label = byId.get(node.viewRef)?.name;
    }
  }
  if (view.nodes.length > 0) {
    return;
  }
  for (const ref of viewRefsOf(view)) {
    const target = byId.get(ref);
    if (!target || target.identifier === view.identifier) {
      continue;
    }
    view.nodes.push(...target.nodes.map(cloneNode));
    view.connections.push(...target.connections.map(cloneConnection));
  }
}

function viewRefsOf(view: DiagramView): string[] {
  const refs = [...view.viewRefs];
  for (const node of flattenNodeList(view.nodes)) {
    if (node.viewRef) {
      refs.push(node.viewRef);
    }
  }
  return refs;
}

function graphicElements(el: Element): Element[] {
  return [...childrenNamed(el, "node"), ...childrenNamed(el, "child")];
}

function connectionElements(viewEl: Element): Element[] {
  const nestedViews = new Set([...childrenNamed(viewEl, "view"), ...childrenNamed(viewEl, "diagram")]);
  const out: Element[] = [];
  const seen = new Set<Element>();
  const consider = (el: Element) => {
    if (seen.has(el) || isInside(el, nestedViews)) {
      return;
    }
    seen.add(el);
    out.push(el);
  };
  for (const el of childrenNamed(viewEl, "connection")) {
    consider(el);
  }
  for (const el of descendantsNamed(viewEl, "connection")) {
    consider(el);
  }
  for (const el of descendantsNamed(viewEl, "sourceConnection")) {
    consider(el);
  }
  return out;
}

function isInside(el: Element, ancestors: Set<Element>): boolean {
  let current: Element | null = el.parentElement;
  while (current) {
    if (ancestors.has(current)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function collectViewRefs(el: Element): string[] {
  const refs: string[] = [];
  const direct = attr(el, "viewRef");
  if (direct) {
    refs.push(direct);
  }
  for (const refEl of childrenNamed(el, "viewRef")) {
    const ref = attr(refEl, "ref") || attr(refEl, "identifierRef") || identifierOf(refEl);
    if (ref) {
      refs.push(ref);
    }
  }
  return refs;
}

function readBounds(el: Element): { x: number; y: number; w: number; h: number } {
  const bounds = firstChildNamed(el, "bounds");
  const x = numberFrom(el, ["x"]) ?? (bounds ? numberFrom(bounds, ["x"]) : undefined) ?? 0;
  const y = numberFrom(el, ["y"]) ?? (bounds ? numberFrom(bounds, ["y"]) : undefined) ?? 0;
  const w = positiveSize(
    numberFrom(el, ["w", "width"]) ?? (bounds ? numberFrom(bounds, ["w", "width"]) : undefined),
    DEFAULT_W
  );
  const h = positiveSize(
    numberFrom(el, ["h", "height"]) ?? (bounds ? numberFrom(bounds, ["h", "height"]) : undefined),
    DEFAULT_H
  );
  return { x, y, w, h };
}

function positiveSize(value: number | undefined, fallback: number): number {
  return value && value > 0 ? value : fallback;
}

function numberFrom(el: Element, names: string[]): number | undefined {
  for (const name of names) {
    const raw = attr(el, name);
    if (raw == null) {
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function identifierOf(el: Element): string | undefined {
  return attr(el, "identifier") || attr(el, "id");
}

function elementRefOf(el: Element): string | undefined {
  return attr(el, "elementRef") || attr(el, "archimateElement") || attr(el, "elementref");
}

function indexNodes(nodes: DiagramNode[]) {
  const byId = new Map<string, DiagramNode>();
  const byElement = new Map<string, DiagramNode>();
  const walk = (list: DiagramNode[]) => {
    for (const node of list) {
      byId.set(node.identifier, node);
      if (node.elementRef) {
        byElement.set(node.elementRef, node);
      }
      walk(node.children);
    }
  };
  walk(nodes);
  return { byId, byElement };
}

function collectElementRefs(nodes: DiagramNode[], into: Set<string>) {
  for (const node of nodes) {
    if (node.elementRef) {
      into.add(node.elementRef);
    }
    collectElementRefs(node.children, into);
  }
}

function flattenNodeList(nodes: DiagramNode[]): DiagramNode[] {
  const out: DiagramNode[] = [];
  const walk = (list: DiagramNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function synthesizedNode(element: ArchiMateElement, index: number): DiagramNode {
  const cols = 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    identifier: `id-n-synth-${element.identifier}`,
    xsiType: "Element",
    x: 40 + col * 200,
    y: 40 + row * 90,
    w: 160,
    h: 60,
    elementRef: element.identifier,
    children: []
  };
}

function cloneNode(node: DiagramNode): DiagramNode {
  return {
    ...node,
    style: node.style ? { ...node.style } : undefined,
    children: node.children.map(cloneNode)
  };
}

function cloneConnection(conn: DiagramConnection): DiagramConnection {
  return {
    ...conn,
    bendpoints: conn.bendpoints.map((point) => ({ x: point.x, y: point.y }))
  };
}

function parseStyle(el: Element): VisualStyle | undefined {
  const styleEl = firstChildNamed(el, "style");
  if (!styleEl) {
    return undefined;
  }
  const fill = firstChildNamed(styleEl, "fillColor");
  const line = firstChildNamed(styleEl, "lineColor");
  const fontEl = firstChildNamed(styleEl, "font");
  const style: VisualStyle = {};
  if (fill) {
    style.fillColor = parseColor(fill);
  }
  if (line) {
    style.lineColor = parseColor(line);
  }
  const lineWidth = attr(styleEl, "lineWidth");
  if (lineWidth) {
    style.lineWidth = Number(lineWidth);
  }
  if (fontEl) {
    const colorEl = firstChildNamed(fontEl, "color");
    style.font = {
      name: attr(fontEl, "name"),
      size: attr(fontEl, "size") ? Number(attr(fontEl, "size")) : undefined,
      style: attr(fontEl, "style"),
      color: colorEl ? parseColor(colorEl) : undefined
    };
  }
  return style;
}

function parseColor(el: Element): RgbColor {
  const color: RgbColor = {
    r: numAttr(el, "r"),
    g: numAttr(el, "g"),
    b: numAttr(el, "b")
  };
  if (attr(el, "a") != null) {
    color.a = numAttr(el, "a");
  }
  return color;
}

