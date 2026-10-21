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

export interface ArchiMateProperty {
  propertyDefinitionRef: string;
  value: string;
}

export interface PropertyDefinition {
  identifier: string;
  name: string;
  type: string;
  documentation?: string;
}

export interface OrganizationItem {
  identifier?: string;
  identifierRef?: string;
  label: string;
  documentation?: string;
  items: OrganizationItem[];
}

export interface ViewpointDefinition {
  identifier: string;
  name: string;
  documentation?: string;
  purpose?: string;
  content?: string;
  allowedElementTypes: string[];
  allowedRelationshipTypes: string[];
}

export interface MetadataEntry {
  name: string;
  text: string;
}

export interface ArchiMateElement {
  identifier: string;
  type: string;
  name: string;
  documentation?: string;
  properties?: ArchiMateProperty[];
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
  properties?: ArchiMateProperty[];
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
  viewRef?: string;
  conceptRef?: string;
  xpathPart?: string;
  label?: string;
  documentation?: string;
  properties?: ArchiMateProperty[];
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
  documentation?: string;
  properties?: ArchiMateProperty[];
  style?: VisualStyle;
  bendpoints: Point[];
  sourceAttachment?: Point;
  targetAttachment?: Point;
}

export interface DiagramView {
  identifier: string;
  name: string;
  documentation?: string;
  viewpoint?: string;
  viewpointRef?: string;
  properties?: ArchiMateProperty[];
  viewRefs: string[];
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

export interface ArchiMateModel {
  identifier: string;
  name: string;
  documentation?: string;
  version?: string;
  properties: ArchiMateProperty[];
  propertyDefinitions: Map<string, PropertyDefinition>;
  organizations: OrganizationItem[];
  viewpoints: ViewpointDefinition[];
  metadata: MetadataEntry[];
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
