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
  descendantsNamed,
  firstChildNamed,
  isArchiMateModel,
  localName,
  numAttr,
  parseXml,
  textOf,
  xsiType
} from "./xml";

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

  const views = parseViews(root, warnings);

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

function parseViews(root: Element, warnings: string[]): DiagramView[] {
  const viewsEl = firstChildNamed(root, "views");
  if (!viewsEl) {
    return [];
  }

  const diagrams = firstChildNamed(viewsEl, "diagrams");
  const viewEls = diagrams
    ? childrenNamed(diagrams, "view")
    : childrenNamed(viewsEl, "view");

  return viewEls.map((viewEl, index) => {
    const identifier = attr(viewEl, "identifier") || `view-${index + 1}`;
    return {
      identifier,
      name: textOf(viewEl) || `View ${index + 1}`,
      documentation: textOf(viewEl, ["documentation"]) || undefined,
      nodes: childrenNamed(viewEl, "node").map((node) => parseNode(node, warnings)),
      connections: childrenNamed(viewEl, "connection").map((conn) => parseConnection(conn, warnings))
    };
  });
}

function parseNode(el: Element, warnings: string[]): DiagramNode {
  const identifier = attr(el, "identifier") || `node-${Math.random().toString(36).slice(2)}`;
  if (!attr(el, "identifier")) {
    warnings.push("Diagram node was missing an identifier");
  }
  return {
    identifier,
    xsiType: xsiType(el) || localName(el),
    x: numAttr(el, "x"),
    y: numAttr(el, "y"),
    w: numAttr(el, "w", 120),
    h: numAttr(el, "h", 55),
    elementRef: attr(el, "elementRef"),
    label: textOf(el) || undefined,
    style: parseStyle(el),
    children: childrenNamed(el, "node").map((child) => parseNode(child, warnings))
  };
}

function parseConnection(el: Element, warnings: string[]): DiagramConnection {
  const identifier = attr(el, "identifier") || `conn-${Math.random().toString(36).slice(2)}`;
  if (!attr(el, "identifier")) {
    warnings.push("Diagram connection was missing an identifier");
  }
  return {
    identifier,
    xsiType: xsiType(el) || "Relationship",
    source: attr(el, "source") || "",
    target: attr(el, "target") || "",
    relationshipRef: attr(el, "relationshipRef"),
    label: textOf(el) || undefined,
    style: parseStyle(el),
    bendpoints: descendantsNamed(el, "bendpoint").map(
      (bp): Point => ({ x: numAttr(bp, "x"), y: numAttr(bp, "y") })
    )
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

