export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FontStyle {
  name?: string;
  size?: number;
  color?: RgbColor;
  style?: string;
}

export interface VisualStyle {
  fillColor?: RgbColor;
  lineColor?: RgbColor;
  lineWidth?: number;
  font?: FontStyle;
}

export interface Point {
  x: number;
  y: number;
}

export interface ArchiMateElement {
  identifier: string;
  type: string;
  name: string;
  documentation?: string;
}

export interface ArchiMateRelationship {
  identifier: string;
  type: string;
  name: string;
  source: string;
  target: string;
  accessType?: string;
  modifier?: string;
  isDirected?: boolean;
  documentation?: string;
}

export interface RelationshipNotationOptions {
  accessType?: string;
  isDirected?: boolean;
}

export interface DiagramNode {
  identifier: string;
  xsiType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  elementRef?: string;
  label?: string;
  style?: VisualStyle;
  children: DiagramNode[];
}

export interface DiagramConnection {
  identifier: string;
  xsiType: string;
  source: string;
  target: string;
  relationshipRef?: string;
  label?: string;
  style?: VisualStyle;
  bendpoints: Point[];
}

export interface DiagramView {
  identifier: string;
  name: string;
  documentation?: string;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

export interface ArchiMateModel {
  identifier: string;
  name: string;
  documentation?: string;
  elements: Map<string, ArchiMateElement>;
  relationships: Map<string, ArchiMateRelationship>;
  views: DiagramView[];
  warnings: string[];
}

export type Layer =
  | "strategy"
  | "business"
  | "application"
  | "technology"
  | "physical"
  | "motivation"
  | "implementation"
  | "composite"
  | "other";

export type Aspect = "active" | "behavior" | "passive" | "motivation" | "composite" | "junction";

export type ElementShape =
  | "rect"
  | "rounded"
  | "folded"
  | "bevel"
  | "ellipse"
  | "box3d"
  | "circle"
  | "note"
  | "dashed-rect"
  | "dashed-rounded";

export interface ElementNotation {
  layer: Layer;
  aspect: Aspect;
  shape: ElementShape;
  fill: string;
  stroke: string;
  icon: string;
}

export type MarkerKind =
  | "none"
  | "filled-diamond"
  | "open-diamond"
  | "filled-circle"
  | "open-circle"
  | "filled-arrow"
  | "open-arrow"
  | "open-triangle";

export type DashStyle = "solid" | "dashed" | "dotted";

export interface RelationshipNotation {
  dash: DashStyle;
  sourceMarker: MarkerKind;
  targetMarker: MarkerKind;
}

export interface ImportResult {
  warnings: string[];
}

export interface ViewerOptions {
  container?: string | HTMLElement;
  width?: string | number;
  height?: string | number;
}
