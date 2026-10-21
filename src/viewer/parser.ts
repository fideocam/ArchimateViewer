import type {
  ArchiMateElement,
  ArchiMateModel,
  ArchiMateProperty,
  ArchiMateRelationship,
  DiagramConnection,
  DiagramNode,
  DiagramView,
  MetadataEntry,
  OrganizationItem,
  Point,
  PropertyDefinition,
  RgbColor,
  ViewpointDefinition,
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
const SYNTH_W = 160;
const SYNTH_H = 55;
const SYNTH_GAP = 24;
const SYNTH_PAD = 16;
const SYNTH_HEADER = 32;

export function parseModel(xml: string): ArchiMateModel {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root || !isArchiMateModel(root)) {
    throw new Error("Not an Open Group ArchiMate Model Exchange XML file");
  }

  const warnings: string[] = [];
  const elements = new Map<string, ArchiMateElement>();
  const relationships = new Map<string, ArchiMateRelationship>();
  const propertyDefinitions = parsePropertyDefinitions(root);

  const elementsContainer = firstChildNamed(root, "elements");
  if (elementsContainer) {
    for (const el of childrenNamed(elementsContainer, "element")) {
      const identifier = attr(el, "identifier");
      if (!identifier) {
        warnings.push("Skipped element without identifier");
        continue;
      }
      const properties = parseProperties(el);
      elements.set(identifier, {
        identifier,
        type: xsiType(el) || "Element",
        name: textOf(el),
        documentation: textOf(el, ["documentation"]) || undefined,
        properties: properties.length ? properties : undefined
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
      const properties = parseProperties(el);
      relationships.set(identifier, {
        identifier,
        type: normalizeRelationshipType(xsiType(el) || "Association"),
        name: textOf(el),
        source,
        target,
        accessType: attr(el, "accessType"),
        modifier: attr(el, "modifier"),
        isDirected: attr(el, "isDirected") === "true" || attr(el, "directed") === "true",
        documentation: textOf(el, ["documentation"]) || undefined,
        properties: properties.length ? properties : undefined
      });
    }
  }

  const organizations = parseOrganizations(root);
  const viewpoints = parseViewpoints(root);
  const views = parseViews(root, warnings, elements, relationships, organizations);

  return {
    identifier: attr(root, "identifier") || "model",
    name: textOf(root) || "ArchiMate Model",
    documentation: textOf(root, ["documentation"]) || undefined,
    version: attr(root, "version"),
    properties: parseProperties(root),
    propertyDefinitions,
    organizations,
    viewpoints,
    metadata: parseMetadata(root),
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
  relationships: Map<string, ArchiMateRelationship>,
  organizations: OrganizationItem[]
): DiagramView[] {
  const viewEls = collectDiagramViewElements(root);
  const views = viewEls.map((viewEl, index) => parseView(viewEl, index, warnings));
  const byId = new Map(views.map((view) => [view.identifier, view]));
  const visiting = new Set<string>();
  for (const view of views) {
    finalizeView(view, byId, visiting, elements, relationships);
  }
  const drawable = views.filter((view) => view.nodes.length > 0 || view.connections.length > 0);
  if (drawable.length) {
    return drawable.filter((view) => view.nodes.length > 0);
  }
  const synthesized = synthesizeView(elements, relationships, organizations);
  return synthesized.nodes.length ? [synthesized] : [];
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
  const properties = parseProperties(viewEl);
  return {
    identifier,
    name: textOf(viewEl) || `View ${index + 1}`,
    documentation: textOf(viewEl, ["documentation"]) || undefined,
    viewpoint: attr(viewEl, "viewpoint"),
    viewpointRef: attr(viewEl, "viewpointRef") || refOf(firstChildNamed(viewEl, "viewpointRef")),
    properties: properties.length ? properties : undefined,
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
  const properties = parseProperties(el);
  return {
    identifier,
    xsiType: xsiType(el) || localName(el),
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    elementRef: elementRefOf(el),
    viewRef,
    conceptRef: attr(el, "conceptRef"),
    xpathPart: attr(el, "xpathPart"),
    label: textOf(el) || undefined,
    documentation: textOf(el, ["documentation"]) || undefined,
    properties: properties.length ? properties : undefined,
    style: parseStyle(el),
    children: graphicElements(el).map((child) => parseNode(child, warnings))
  };
}

function parseConnection(el: Element, warnings: string[]): DiagramConnection {
  const identifier = identifierOf(el) || `conn-${Math.random().toString(36).slice(2)}`;
  if (!identifierOf(el)) {
    warnings.push("Diagram connection was missing an identifier");
  }
  const properties = parseProperties(el);
  const sourceAttachment = parseLocation(firstChildNamed(el, "sourceAttachment"));
  const targetAttachment = parseLocation(firstChildNamed(el, "targetAttachment"));
  return {
    identifier,
    xsiType: xsiType(el) || localName(el) || "Relationship",
    source: attr(el, "source") || refOf(firstChildNamed(el, "nodeRef")) || refOf(firstChildNamed(el, "viewConceptRef")) || "",
    target: attr(el, "target") || "",
    relationshipRef: attr(el, "relationshipRef") || attr(el, "archimateRelationship") || attr(el, "connectionRef"),
    label: textOf(el) || undefined,
    documentation: textOf(el, ["documentation"]) || undefined,
    properties: properties.length ? properties : undefined,
    style: parseStyle(el),
    bendpoints: descendantsNamed(el, "bendpoint").map(
      (bp): Point => ({
        x: numberFrom(bp, ["x", "startX"]) ?? 0,
        y: numberFrom(bp, ["y", "startY"]) ?? 0
      })
    ),
    sourceAttachment,
    targetAttachment
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
  resolveConceptLabels(view, elements, relationships);
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
  const connectionIds = new Set(view.connections.map((conn) => conn.identifier));
  const ensureNode = (key: string | undefined): DiagramNode | undefined => {
    if (!key) {
      return undefined;
    }
    const existing = byId.get(key) || byElement.get(key);
    if (existing) {
      return existing;
    }
    if (connectionIds.has(key) || relationships.has(key)) {
      return undefined;
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
    const sourceKey = conn.source || rel?.source;
    const targetKey = conn.target || rel?.target;
    const source = ensureNode(sourceKey);
    const target = ensureNode(targetKey);
    if (source) {
      conn.source = source.identifier;
    } else if (sourceKey && (connectionIds.has(sourceKey) || relationships.has(sourceKey))) {
      conn.source = sourceKey;
    }
    if (target) {
      conn.target = target.identifier;
    } else if (targetKey && (connectionIds.has(targetKey) || relationships.has(targetKey))) {
      conn.target = targetKey;
    }
  }
}

function resolveConceptLabels(
  view: DiagramView,
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
) {
  for (const node of flattenNodeList(view.nodes)) {
    if (!node.conceptRef) {
      continue;
    }
    const concept = elements.get(node.conceptRef) || relationships.get(node.conceptRef);
    if (!concept) {
      continue;
    }
    if (!node.label || node.xpathPart) {
      node.label = resolveXpathPart(node.xpathPart, concept) || concept.name || node.label;
    }
  }
}

function resolveXpathPart(
  xpath: string | undefined,
  concept: { name: string; documentation?: string; properties?: ArchiMateProperty[] }
): string | undefined {
  const path = (xpath || "name").trim();
  if (/documentation/i.test(path)) {
    return concept.documentation;
  }
  const prop = /propertyDefinitionRef\s*=\s*['"]([^'"]+)/i.exec(path);
  if (prop) {
    return concept.properties?.find((item) => item.propertyDefinitionRef === prop[1])?.value;
  }
  if (!xpath || /name/i.test(path)) {
    return concept.name;
  }
  return concept.name;
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

function refOf(el: Element | undefined): string | undefined {
  if (!el) {
    return undefined;
  }
  return attr(el, "ref") || attr(el, "identifierRef") || identifierOf(el);
}

function parseLocation(el: Element | undefined): Point | undefined {
  if (!el) {
    return undefined;
  }
  const x = numberFrom(el, ["x"]);
  const y = numberFrom(el, ["y"]);
  if (x == null || y == null) {
    return undefined;
  }
  return { x, y };
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
    bendpoints: conn.bendpoints.map((point) => ({ x: point.x, y: point.y })),
    sourceAttachment: conn.sourceAttachment ? { ...conn.sourceAttachment } : undefined,
    targetAttachment: conn.targetAttachment ? { ...conn.targetAttachment } : undefined
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

function parseProperties(el: Element): ArchiMateProperty[] {
  const propsEl = firstChildNamed(el, "properties");
  if (!propsEl) {
    return [];
  }
  const out: ArchiMateProperty[] = [];
  for (const prop of childrenNamed(propsEl, "property")) {
    const propertyDefinitionRef = attr(prop, "propertyDefinitionRef");
    if (!propertyDefinitionRef) {
      continue;
    }
    out.push({
      propertyDefinitionRef,
      value: textOf(prop, ["value"]) || (prop.textContent || "").trim()
    });
  }
  return out;
}

function parsePropertyDefinitions(root: Element): Map<string, PropertyDefinition> {
  const defs = new Map<string, PropertyDefinition>();
  const container = firstChildNamed(root, "propertyDefinitions");
  if (!container) {
    return defs;
  }
  for (const el of childrenNamed(container, "propertyDefinition")) {
    const identifier = attr(el, "identifier");
    if (!identifier) {
      continue;
    }
    defs.set(identifier, {
      identifier,
      name: textOf(el),
      type: attr(el, "type") || "string",
      documentation: textOf(el, ["documentation"]) || undefined
    });
  }
  return defs;
}

function parseOrganizations(root: Element): OrganizationItem[] {
  const out: OrganizationItem[] = [];
  for (const org of childrenNamed(root, "organizations")) {
    for (const item of childrenNamed(org, "item")) {
      out.push(parseOrganizationItem(item));
    }
  }
  return out;
}

function parseOrganizationItem(el: Element): OrganizationItem {
  return {
    identifier: attr(el, "identifier"),
    identifierRef: attr(el, "identifierRef"),
    label: textOf(el, ["label", "name"]),
    documentation: textOf(el, ["documentation"]) || undefined,
    items: childrenNamed(el, "item").map(parseOrganizationItem)
  };
}

function parseViewpoints(root: Element): ViewpointDefinition[] {
  const viewsEl = firstChildNamed(root, "views");
  if (!viewsEl) {
    return [];
  }
  const container = firstChildNamed(viewsEl, "viewpoints");
  if (!container) {
    return [];
  }
  const out: ViewpointDefinition[] = [];
  for (const el of childrenNamed(container, "viewpoint")) {
    const identifier = attr(el, "identifier");
    if (!identifier) {
      continue;
    }
    out.push({
      identifier,
      name: textOf(el),
      documentation: textOf(el, ["documentation"]) || undefined,
      purpose: textOf(el, ["viewpointPurpose"]) || undefined,
      content: textOf(el, ["viewpointContent"]) || undefined,
      allowedElementTypes: childrenNamed(el, "allowedElementType")
        .map((item) => attr(item, "type") || "")
        .filter(Boolean),
      allowedRelationshipTypes: childrenNamed(el, "allowedRelationshipType")
        .map((item) => attr(item, "type") || "")
        .filter(Boolean)
    });
  }
  return out;
}

function parseMetadata(root: Element): MetadataEntry[] {
  const meta = firstChildNamed(root, "metadata");
  if (!meta) {
    return [];
  }
  const out: MetadataEntry[] = [];
  const add = (el: Element) => {
    const name = localName(el);
    if (name === "schemaInfo") {
      for (const child of childrenOf(el)) {
        add(child);
      }
      return;
    }
    const text = (el.textContent || "").trim();
    if (text) {
      out.push({ name, text });
    }
  };
  for (const child of childrenOf(meta)) {
    add(child);
  }
  return out;
}

function synthesizeView(
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>,
  organizations: OrganizationItem[]
): DiagramView {
  if (organizations.length) {
    return layoutFromOrganizations(organizations, elements, relationships);
  }
  return layoutAllElements(elements, relationships);
}

function layoutFromOrganizations(
  organizations: OrganizationItem[],
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
): DiagramView {
  const nodes: DiagramNode[] = [];
  let x = 20;
  let y = 20;
  let maxH = 0;
  for (const item of organizations) {
    const laid = layoutOrganizationItem(item, x, y, elements);
    nodes.push(laid.node);
    x += laid.width + SYNTH_GAP;
    maxH = Math.max(maxH, laid.height);
    if (x > 900) {
      x = 20;
      y += maxH + SYNTH_GAP;
      maxH = 0;
    }
  }
  const view: DiagramView = {
    identifier: "id-view-organization",
    name: "Organization",
    viewRefs: [],
    nodes,
    connections: []
  };
  addRelationshipConnections(view, relationships);
  return view;
}

function layoutOrganizationItem(
  item: OrganizationItem,
  x: number,
  y: number,
  elements: Map<string, ArchiMateElement>
): { node: DiagramNode; width: number; height: number } {
  if (item.identifierRef && elements.has(item.identifierRef) && item.items.length === 0) {
    const element = elements.get(item.identifierRef)!;
    const node: DiagramNode = {
      identifier: item.identifier || `id-n-org-${element.identifier}`,
      xsiType: "Element",
      x,
      y,
      w: SYNTH_W,
      h: SYNTH_H,
      elementRef: element.identifier,
      label: item.label || undefined,
      children: []
    };
    return { node, width: SYNTH_W, height: SYNTH_H };
  }

  const children: DiagramNode[] = [];
  let cx = SYNTH_PAD;
  let cy = SYNTH_HEADER;
  let col = 0;
  let rowH = 0;
  let maxX = 220;
  for (const child of item.items) {
    if (child.identifierRef && !elements.has(child.identifierRef) && child.items.length === 0) {
      continue;
    }
    const laid = layoutOrganizationItem(child, cx, cy, elements);
    children.push(laid.node);
    cx += laid.width + SYNTH_GAP;
    rowH = Math.max(rowH, laid.height);
    maxX = Math.max(maxX, cx);
    col += 1;
    if (col >= 3) {
      cx = SYNTH_PAD;
      cy += rowH + SYNTH_GAP;
      rowH = 0;
      col = 0;
    }
  }
  const width = Math.max(maxX + SYNTH_PAD, 220);
  const height = cy + Math.max(rowH, SYNTH_H) + SYNTH_PAD;
  const node: DiagramNode = {
    identifier: item.identifier || `id-n-org-${x}-${y}`,
    xsiType: "Container",
    x,
    y,
    w: width,
    h: height,
    label: item.label || "Group",
    children
  };
  return { node, width, height };
}

function layoutAllElements(
  elements: Map<string, ArchiMateElement>,
  relationships: Map<string, ArchiMateRelationship>
): DiagramView {
  const nodes: DiagramNode[] = [];
  const cols = 4;
  let index = 0;
  for (const element of elements.values()) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    nodes.push({
      identifier: `id-n-org-${element.identifier}`,
      xsiType: "Element",
      x: 40 + col * (SYNTH_W + SYNTH_GAP),
      y: 40 + row * (SYNTH_H + SYNTH_GAP),
      w: SYNTH_W,
      h: SYNTH_H,
      elementRef: element.identifier,
      children: []
    });
    index += 1;
  }
  const view: DiagramView = {
    identifier: "id-view-model",
    name: "Model",
    viewRefs: [],
    nodes,
    connections: []
  };
  addRelationshipConnections(view, relationships);
  return view;
}

function addRelationshipConnections(view: DiagramView, relationships: Map<string, ArchiMateRelationship>) {
  const { byElement } = indexNodes(view.nodes);
  for (const rel of relationships.values()) {
    const source = byElement.get(rel.source);
    const target = byElement.get(rel.target);
    if (!source || !target) {
      continue;
    }
    const exists = view.connections.some(
      (conn) =>
        (conn.source === source.identifier && conn.target === target.identifier) ||
        (conn.source === target.identifier && conn.target === source.identifier)
    );
    if (exists) {
      continue;
    }
    view.connections.push({
      identifier: `id-c-org-${rel.identifier}`,
      xsiType: "Relationship",
      source: source.identifier,
      target: target.identifier,
      relationshipRef: rel.identifier,
      bendpoints: []
    });
  }
}
