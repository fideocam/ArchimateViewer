import { parseHTML } from "linkedom";

const { window } = parseHTML("<!doctype html><html><body></body></html>");

const g = globalThis as typeof globalThis & {
  window: typeof window;
  document: typeof window.document;
  DOMParser: typeof window.DOMParser;
  HTMLElement: typeof window.HTMLElement;
  SVGElement: typeof window.SVGElement;
  Node: typeof window.Node;
  Element: typeof window.Element;
};

g.window = window;
g.document = window.document;
g.DOMParser = window.DOMParser;
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
g.Node = window.Node;
g.Element = window.Element;
