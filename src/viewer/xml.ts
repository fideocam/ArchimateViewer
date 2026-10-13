const ARCHIMATE_NS = [
  "http://www.opengroup.org/xsd/archimate/3.0/",
  "http://www.opengroup.org/xsd/archimate/3.1/",
  "http://www.opengroup.org/xsd/archimate"
];

const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

export function parseXml(xml: string): Document {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is not available in this environment");
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (!root) {
    throw new Error("XML parse error: empty document");
  }
  if (localName(root) === "parsererror") {
    throw new Error(root.textContent || "XML parse error");
  }
  const errorNode = firstChildNamed(root, "parsererror");
  if (errorNode) {
    throw new Error(errorNode.textContent || "XML parse error");
  }
  return doc;
}

export function localName(node: Node): string {
  const el = node as Element;
  if (el.localName) {
    return el.localName;
  }
  const name = el.nodeName || "";
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

export function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

export function childrenOf(el: Element): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child && isElement(child)) {
      out.push(child);
    }
  }
  return out;
}

export function childrenNamed(el: Element, name: string): Element[] {
  return childrenOf(el).filter((child) => localName(child) === name);
}

export function firstChildNamed(el: Element, name: string): Element | undefined {
  return childrenNamed(el, name)[0];
}

export function descendantsNamed(el: Element, name: string): Element[] {
  const out: Element[] = [];
  const walk = (node: Element) => {
    for (const child of childrenOf(node)) {
      if (localName(child) === name) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(el);
  return out;
}

export function textOf(el: Element, tags: string[] = ["name", "label"]): string {
  for (const tag of tags) {
    const child = firstChildNamed(el, tag);
    if (child) {
      return (child.textContent || "").trim();
    }
  }
  return "";
}

export function attr(el: Element, name: string): string | undefined {
  const value = el.getAttribute(name);
  return value == null || value === "" ? undefined : value;
}

export function xsiType(el: Element): string {
  const raw =
    el.getAttributeNS?.(XSI_NS, "type") ||
    el.getAttribute("xsi:type") ||
    el.getAttribute("type") ||
    "";
  return stripPrefix(raw);
}

export function stripPrefix(value: string): string {
  const i = value.indexOf(":");
  return (i >= 0 ? value.slice(i + 1) : value).trim();
}

export function isArchiMateModel(el: Element): boolean {
  if (localName(el) !== "model") {
    return false;
  }
  const ns = el.namespaceURI || "";
  if (ARCHIMATE_NS.includes(ns)) {
    return true;
  }
  const xmlns = el.getAttribute("xmlns") || "";
  return xmlns.includes("opengroup.org/xsd/archimate");
}

export function numAttr(el: Element, name: string, fallback = 0): number {
  const value = attr(el, name);
  if (value == null) {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
