import type {
  DashStyle,
  ElementNotation,
  ElementShape,
  Layer,
  MarkerKind,
  RelationshipNotation
} from "./types";

const LAYER_FILL: Record<Layer, string> = {
  strategy: "#F5DEAA",
  business: "#FFFFB5",
  application: "#B5FFFF",
  technology: "#C9E7CB",
  physical: "#C9E7CB",
  motivation: "#CCCCFF",
  implementation: "#FFE0E0",
  composite: "#FFFFFF",
  other: "#E8E8E8"
};

const LAYER_STROKE: Record<Layer, string> = {
  strategy: "#5A4A20",
  business: "#5C5C20",
  application: "#205C5C",
  technology: "#205C20",
  physical: "#205C20",
  motivation: "#50508C",
  implementation: "#8C4040",
  composite: "#555555",
  other: "#444444"
};

interface ElementSpec {
  layer: Layer;
  shape: ElementShape;
  icon: string;
}

const ELEMENTS: Record<string, ElementSpec> = {
  Resource: { layer: "strategy", shape: "rect", icon: "resource" },
  Capability: { layer: "strategy", shape: "rounded", icon: "function" },
  ValueStream: { layer: "strategy", shape: "rounded", icon: "process" },
  CourseOfAction: { layer: "strategy", shape: "rounded", icon: "course" },

  BusinessActor: { layer: "business", shape: "rect", icon: "actor" },
  BusinessRole: { layer: "business", shape: "rect", icon: "role" },
  BusinessCollaboration: { layer: "business", shape: "rect", icon: "collaboration" },
  BusinessInterface: { layer: "business", shape: "rect", icon: "interface" },
  BusinessProcess: { layer: "business", shape: "rounded", icon: "process" },
  BusinessFunction: { layer: "business", shape: "rounded", icon: "function" },
  BusinessInteraction: { layer: "business", shape: "rounded", icon: "collaboration" },
  BusinessEvent: { layer: "business", shape: "rounded", icon: "event" },
  BusinessService: { layer: "business", shape: "rounded", icon: "service" },
  BusinessObject: { layer: "business", shape: "folded", icon: "object" },
  Contract: { layer: "business", shape: "folded", icon: "contract" },
  Representation: { layer: "business", shape: "folded", icon: "representation" },
  Product: { layer: "business", shape: "rect", icon: "product" },

  ApplicationComponent: { layer: "application", shape: "rect", icon: "component" },
  ApplicationCollaboration: { layer: "application", shape: "rect", icon: "collaboration" },
  ApplicationInterface: { layer: "application", shape: "rect", icon: "interface" },
  ApplicationFunction: { layer: "application", shape: "rounded", icon: "function" },
  ApplicationInteraction: { layer: "application", shape: "rounded", icon: "collaboration" },
  ApplicationProcess: { layer: "application", shape: "rounded", icon: "process" },
  ApplicationEvent: { layer: "application", shape: "rounded", icon: "event" },
  ApplicationService: { layer: "application", shape: "rounded", icon: "service" },
  DataObject: { layer: "application", shape: "folded", icon: "object" },

  Node: { layer: "technology", shape: "box3d", icon: "node" },
  Device: { layer: "technology", shape: "box3d", icon: "device" },
  SystemSoftware: { layer: "technology", shape: "box3d", icon: "software" },
  TechnologyCollaboration: { layer: "technology", shape: "rect", icon: "collaboration" },
  TechnologyInterface: { layer: "technology", shape: "rect", icon: "interface" },
  Path: { layer: "technology", shape: "rect", icon: "path" },
  CommunicationNetwork: { layer: "technology", shape: "rect", icon: "network" },
  TechnologyFunction: { layer: "technology", shape: "rounded", icon: "function" },
  TechnologyProcess: { layer: "technology", shape: "rounded", icon: "process" },
  TechnologyInteraction: { layer: "technology", shape: "rounded", icon: "collaboration" },
  TechnologyEvent: { layer: "technology", shape: "rounded", icon: "event" },
  TechnologyService: { layer: "technology", shape: "rounded", icon: "service" },
  Artifact: { layer: "technology", shape: "folded", icon: "artifact" },

  Equipment: { layer: "physical", shape: "box3d", icon: "equipment" },
  Facility: { layer: "physical", shape: "box3d", icon: "facility" },
  DistributionNetwork: { layer: "physical", shape: "rect", icon: "network" },
  Material: { layer: "physical", shape: "folded", icon: "material" },

  Stakeholder: { layer: "motivation", shape: "rect", icon: "role" },
  Driver: { layer: "motivation", shape: "ellipse", icon: "driver" },
  Assessment: { layer: "motivation", shape: "ellipse", icon: "assessment" },
  Goal: { layer: "motivation", shape: "ellipse", icon: "goal" },
  Outcome: { layer: "motivation", shape: "ellipse", icon: "outcome" },
  Principle: { layer: "motivation", shape: "bevel", icon: "principle" },
  Requirement: { layer: "motivation", shape: "bevel", icon: "requirement" },
  Constraint: { layer: "motivation", shape: "bevel", icon: "constraint" },
  Meaning: { layer: "motivation", shape: "ellipse", icon: "meaning" },
  Value: { layer: "motivation", shape: "ellipse", icon: "value" },

  WorkPackage: { layer: "implementation", shape: "rounded", icon: "process" },
  Deliverable: { layer: "implementation", shape: "folded", icon: "object" },
  ImplementationEvent: { layer: "implementation", shape: "rounded", icon: "event" },
  Plateau: { layer: "implementation", shape: "rect", icon: "plateau" },
  Gap: { layer: "implementation", shape: "folded", icon: "gap" },

  Grouping: { layer: "composite", shape: "dashed-rounded", icon: "none" },
  Location: { layer: "composite", shape: "dashed-rect", icon: "location" },
  AndJunction: { layer: "other", shape: "circle", icon: "none" },
  OrJunction: { layer: "other", shape: "circle", icon: "none" },
  Junction: { layer: "other", shape: "circle", icon: "none" }
};

const RELATIONSHIPS: Record<string, RelationshipNotation> = {
  Composition: { dash: "solid", sourceMarker: "filled-diamond", targetMarker: "none" },
  Aggregation: { dash: "solid", sourceMarker: "open-diamond", targetMarker: "none" },
  Assignment: { dash: "solid", sourceMarker: "filled-circle", targetMarker: "none" },
  Realization: { dash: "dashed", sourceMarker: "none", targetMarker: "open-arrow" },
  Serving: { dash: "solid", sourceMarker: "none", targetMarker: "open-arrow" },
  Access: { dash: "dotted", sourceMarker: "none", targetMarker: "open-arrow" },
  Influence: { dash: "dashed", sourceMarker: "none", targetMarker: "open-arrow" },
  Triggering: { dash: "solid", sourceMarker: "none", targetMarker: "filled-arrow" },
  Flow: { dash: "dashed", sourceMarker: "none", targetMarker: "filled-arrow" },
  Specialization: { dash: "solid", sourceMarker: "none", targetMarker: "open-triangle" },
  Association: { dash: "solid", sourceMarker: "none", targetMarker: "none" }
};

export function getElementNotation(type: string): ElementNotation {
  const spec = ELEMENTS[type] || inferFromName(type);
  return {
    layer: spec.layer,
    aspect: aspectFor(spec.shape, spec.layer),
    shape: spec.shape,
    fill: LAYER_FILL[spec.layer],
    stroke: LAYER_STROKE[spec.layer],
    icon: spec.icon
  };
}

export function getRelationshipNotation(type: string): RelationshipNotation {
  return (
    RELATIONSHIPS[type] || {
      dash: "solid" as DashStyle,
      sourceMarker: "none" as MarkerKind,
      targetMarker: "none" as MarkerKind
    }
  );
}

export function dashArray(dash: DashStyle): string | undefined {
  if (dash === "dashed") {
    return "8 5";
  }
  if (dash === "dotted") {
    return "2 3";
  }
  return undefined;
}

function aspectFor(shape: ElementShape, layer: Layer): ElementNotation["aspect"] {
  if (shape === "circle") {
    return "junction";
  }
  if (shape === "dashed-rect" || shape === "dashed-rounded") {
    return "composite";
  }
  if (layer === "motivation") {
    return "motivation";
  }
  if (shape === "rounded") {
    return "behavior";
  }
  if (shape === "folded" || shape === "ellipse") {
    return "passive";
  }
  return "active";
}

function inferFromName(type: string): ElementSpec {
  if (/Process|Function|Interaction|Event|Service|Capability|WorkPackage/.test(type)) {
    return { layer: inferLayer(type), shape: "rounded", icon: "function" };
  }
  if (/Object|Contract|Artifact|Material|Deliverable|Representation/.test(type)) {
    return { layer: inferLayer(type), shape: "folded", icon: "object" };
  }
  if (/Node|Device|Facility|Equipment|SystemSoftware/.test(type)) {
    return { layer: inferLayer(type), shape: "box3d", icon: "node" };
  }
  if (/Goal|Driver|Value|Meaning|Outcome|Assessment/.test(type)) {
    return { layer: "motivation", shape: "ellipse", icon: "goal" };
  }
  return { layer: inferLayer(type), shape: "rect", icon: "none" };
}

function inferLayer(type: string): Layer {
  if (type.startsWith("Business")) return "business";
  if (type.startsWith("Application") || type === "DataObject") return "application";
  if (type.startsWith("Technology") || type === "Node" || type === "Device") return "technology";
  if (type.startsWith("Implementation") || type === "Plateau" || type === "Gap") return "implementation";
  return "other";
}
