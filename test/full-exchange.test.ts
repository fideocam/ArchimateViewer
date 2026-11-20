import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";
import { renderView } from "../src/viewer/renderer.ts";
import { NavigatedViewer } from "../src/viewer/index.ts";
import type { ArchiMateModel, DiagramNode } from "../src/viewer/types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const full = readFileSync(join(dir, "fixtures/full-exchange.xml"), "utf8");
const orgOnly = readFileSync(join(dir, "fixtures/organization-only.xml"), "utf8");
const allElements = readFileSync(join(dir, "fixtures/all-element-types.xml"), "utf8");

const ELEMENT_TYPES = [
  "BusinessActor",
  "BusinessRole",
  "BusinessCollaboration",
  "BusinessInterface",
  "BusinessProcess",
  "BusinessFunction",
  "BusinessInteraction",
  "BusinessEvent",
  "BusinessService",
  "BusinessObject",
  "Contract",
  "Representation",
  "Product",
  "ApplicationComponent",
  "ApplicationCollaboration",
  "ApplicationInterface",
  "ApplicationFunction",
  "ApplicationInteraction",
  "ApplicationProcess",
  "ApplicationEvent",
  "ApplicationService",
  "DataObject",
  "Node",
  "Device",
  "SystemSoftware",
  "TechnologyCollaboration",
  "TechnologyInterface",
  "Path",
  "CommunicationNetwork",
  "TechnologyFunction",
  "TechnologyProcess",
  "TechnologyInteraction",
  "TechnologyEvent",
  "TechnologyService",
  "Artifact",
  "Equipment",
  "Facility",
  "DistributionNetwork",
  "Material",
  "Stakeholder",
  "Driver",
  "Assessment",
  "Goal",
  "Outcome",
  "Principle",
  "Requirement",
  "Constraint",
  "Meaning",
  "Value",
  "Resource",
  "Capability",
  "CourseOfAction",
  "WorkPackage",
  "Deliverable",
  "ImplementationEvent",
  "Plateau",
  "Gap",
  "Grouping",
  "Location",
  "AndJunction",
  "OrJunction"
] as const;

describe("full Open Group exchange coverage", () => {
  it("parses version, metadata, properties, organizations and viewpoints", () => {
    const model = parseModel(full);

    assert.equal(model.version, "3.1");
    assert.equal(model.properties[0]?.propertyDefinitionRef, "prop-status");
    assert.equal(model.properties[0]?.value, "draft");
    assert.equal(model.propertyDefinitions.get("prop-owner")?.name, "Owner");
    assert.equal(model.propertyDefinitions.get("prop-owner")?.type, "string");
    assert.equal(model.elements.get("id-actor")?.properties?.[0]?.value, "Claims");
    assert.ok(model.metadata.some((entry) => /Dublin Core|Full exchange fixture|ArchiMate Viewer/i.test(entry.text)));

    const business = findOrg(model.organizations, "Business");
    assert.ok(business);
    assert.equal(
      business.items.some((item) => item.identifierRef === "id-actor"),
      true
    );

    assert.equal(model.viewpoints[0]?.identifier, "id-vp-layered");
    assert.equal(model.viewpoints[0]?.name, "Layered catalog");
    assert.match(model.viewpoints[0]?.purpose || "", /Designing/);
    assert.deepEqual(model.viewpoints[0]?.allowedElementTypes, ["BusinessActor", "BusinessProcess"]);
    assert.deepEqual(model.viewpoints[0]?.allowedRelationshipTypes, ["Assignment"]);

    const view = model.views.find((item) => item.identifier === "id-view-full");
    assert.ok(view);
    assert.equal(view.viewpoint, "Layered");
    assert.equal(view.viewpointRef, "id-vp-layered");
    assert.equal(view.properties?.[0]?.value, "shown");
  });

  it("parses Label conceptRef, Line, attachments and connection-to-connection", () => {
    const model = parseModel(full);
    const view = model.views.find((item) => item.identifier === "id-view-full");
    assert.ok(view);

    const label = flatten(view.nodes).find((node) => node.identifier === "n-label");
    assert.ok(label);
    assert.equal(label.conceptRef, "id-actor");
    assert.equal(label.xpathPart, "name");
    assert.equal(label.label, "Claims Actor");

    const asg = view.connections.find((conn) => conn.identifier === "c-asg");
    assert.ok(asg);
    assert.deepEqual(asg.sourceAttachment, { x: 180, y: 70 });
    assert.deepEqual(asg.targetAttachment, { x: 260, y: 67 });

    const line = view.connections.find((conn) => conn.identifier === "c-line");
    assert.ok(line);
    assert.equal(line.xsiType, "Line");
    assert.deepEqual(line.sourceAttachment, { x: 500, y: 160 });
    assert.deepEqual(line.bendpoints, [{ x: 560, y: 200 }]);
    assert.equal(line.style?.lineWidth, 3);

    const toRel = view.connections.find((conn) => conn.identifier === "c-to-rel");
    assert.ok(toRel);
    assert.equal(toRel.source, "n-goal");
    assert.equal(toRel.target, "c-asg");
  });

  it("does not require xsi:type=Diagram on views", () => {
    assert.equal(/<view[^>]*xsi:type="Diagram"/.test(full), false);
    const model = parseModel(full);
    assert.ok(model.views.some((view) => view.identifier === "id-view-full"));
    assert.equal(
      model.views.some((view) => view.identifier === "id-vp-layered"),
      false,
      "viewpoint catalog entries are not diagrams"
    );
  });

  it("renders Line, conceptRef labels, attachments, connection-to-connection and styles", () => {
    const model = parseModel(full);
    const view = model.views.find((item) => item.identifier === "id-view-full");
    assert.ok(view);
    const svg = renderView(view, model);

    assert.match(svg, /Claims Actor/);
    assert.match(svg, /Freeform note/);
    assert.match(svg, /data-element-id="c-line"/);
    assert.match(svg, /data-kind="line"/);
    assert.match(svg, /stroke-width="3"/);
    assert.match(svg, /font-weight="bold"/);
    assert.match(svg, /data-element-id="c-to-rel"/);
    assert.match(svg, /data-kind="relationship"/);
    assert.doesNotMatch(svg, /viewBox="0 0 1 1"/);
  });

  it("still draws nested model elements as sibling boxes with arrows", () => {
    const model = parseModel(full);
    const view = model.views.find((item) => item.identifier === "id-view-nested-boxes");
    assert.ok(view);
    const svg = renderView(view, model);
    assert.match(svg, /data-element-id="n-group"/);
    assert.match(svg, /data-element-id="n-nested-actor"/);
    assert.doesNotMatch(svg, /data-parent-id="n-group"/);
    assert.match(svg, /data-type="Composition"/);
  });

  it("synthesizes a drawable view from organizations when the file has no diagrams", async () => {
    const model = parseModel(orgOnly);
    assert.equal(model.version, "3.0");
    assert.ok(model.organizations.length > 0);
    assert.ok(model.views.length >= 1, "organization-only models must still produce a view");
    const svg = renderView(model.views[0], model);
    assert.match(svg, /Claims Actor/);
    assert.match(svg, /Handle Claim/);
    assert.match(svg, /Claims App/);
    assert.match(svg, /data-kind="relationship"/);
    assert.doesNotMatch(svg, /viewBox="0 0 1 1"/);

    const container = document.createElement("div");
    document.body.appendChild(container);
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    const viewer = new NavigatedViewer({ container });
    await viewer.importXML(orgOnly);
    assert.ok(container.querySelector(".av-node"));
    viewer.destroy();
  });

  it("parses and renders every ArchiMate 3 element type and relationship type", () => {
    const model = parseModel(allElements);
    for (const type of ELEMENT_TYPES) {
      assert.equal(model.elements.get(`id-e-${type}`)?.type, type, type);
    }
    const svg = renderView(model.views[0], model);
    for (const type of ELEMENT_TYPES) {
      assert.match(svg, new RegExp(`data-type="${type}"`), type);
    }
    for (const type of [
      "Composition",
      "Aggregation",
      "Assignment",
      "Realization",
      "Serving",
      "Access",
      "Influence",
      "Triggering",
      "Flow",
      "Specialization",
      "Association"
    ]) {
      assert.match(svg, new RegExp(`data-type="${type}"`));
    }
  });
});

function findOrg(items: ArchiMateModel["organizations"], label: string) {
  const walk = (list: ArchiMateModel["organizations"]): ArchiMateModel["organizations"][number] | undefined => {
    for (const item of list || []) {
      if (item.label === label) {
        return item;
      }
      const nested = walk(item.items);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  };
  return walk(items);
}

function flatten(nodes: DiagramNode[]): DiagramNode[] {
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
