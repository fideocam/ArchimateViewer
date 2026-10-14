import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(dir, "fixtures/layered-view.xml"), "utf8");
const variants = readFileSync(join(dir, "fixtures/view-variants.xml"), "utf8");

describe("parseModel", () => {
  it("reads model name, elements, relationships and diagram views", () => {
    const model = parseModel(fixture);

    assert.equal(model.name, "ArchInsurance Claims");
    assert.equal(model.elements.get("id-customer")?.type, "BusinessActor");
    assert.equal(model.elements.get("id-claim")?.name, "Claim");
    assert.equal(model.relationships.get("id-r-access")?.type, "Access");
    assert.equal(model.relationships.get("id-r-access")?.accessType, "Write");
    assert.equal(model.relationships.get("id-r-inf")?.modifier, "+");
    assert.equal(model.views.length, 2);
    assert.equal(model.views[0].name, "Layered Claims View");
    assert.equal(model.views[1].identifier, "id-view-motivation");
  });

  it("captures node bounds, nested children, styles and connection bendpoints", () => {
    const model = parseModel(fixture);
    const view = model.views[0];
    const appGroup = view.nodes.find((n) => n.identifier === "id-n-group-app");
    assert.ok(appGroup);
    assert.equal(appGroup.x, 20);
    assert.equal(appGroup.w, 760);
    assert.equal(appGroup.label, "Application");

    const component = appGroup.children.find((n) => n.identifier === "id-n-claim-app");
    assert.ok(component);
    assert.equal(component.elementRef, "id-claim-app");
    assert.equal(component.children.length, 2);
    assert.deepEqual(component.style?.fillColor, { r: 181, g: 255, b: 255 });

    const flow = view.connections.find((c) => c.identifier === "id-c-flow");
    assert.ok(flow);
    assert.equal(flow.relationshipRef, "id-r-flow");
    assert.deepEqual(flow.bendpoints, [{ x: 490, y: 310 }]);
  });

  it("rejects non-ArchiMate XML", () => {
    assert.throws(() => parseModel("<root/>"), /ArchiMate/i);
  });

  it("recovers nested, referenced, Archi-schema and connection-only diagram views", () => {
    const model = parseModel(variants);
    const names = model.views.map((view) => view.name);
    assert.equal(names.includes("Folder"), false);
    assert.equal(names.includes("Organization catalog"), false);

    const nested = model.views.find((view) => view.identifier === "id-view-nested");
    assert.ok(nested);
    assert.equal(nested.nodes.some((node) => node.elementRef === "id-actor"), true);

    const archi = model.views.find((view) => view.identifier === "id-view-archi");
    assert.ok(archi);
    assert.equal(archi.nodes.length, 2);
    assert.equal(archi.nodes[0].w, 140);
    assert.equal(archi.nodes[0].x, 40);
    assert.equal(archi.connections.length, 1);

    const noBounds = model.views.find((view) => view.identifier === "id-view-nobounds");
    assert.ok(noBounds);
    const actor = noBounds.nodes.find((node) => node.identifier === "n-actor");
    const proc = noBounds.nodes.find((node) => node.identifier === "n-proc");
    assert.ok(actor && proc);
    assert.equal(actor.w, 140);
    assert.equal(proc.x, 200);
    assert.equal(noBounds.connections[0].source, "n-actor");
    assert.equal(noBounds.connections[0].target, "n-proc");

    const conns = model.views.find((view) => view.identifier === "id-view-conns");
    assert.ok(conns);
    assert.ok(conns.nodes.length >= 2);
    assert.equal(
      conns.nodes.some((node) => node.elementRef === "id-actor"),
      true
    );
    assert.equal(
      conns.nodes.some((node) => node.elementRef === "id-proc"),
      true
    );

    const group = model.views.find((view) => view.identifier === "id-view-group");
    assert.ok(group);
    const grouping = group.nodes.find((node) => node.identifier === "n-group");
    assert.ok(grouping);
    const memberRefs = new Set(
      [grouping, ...grouping.children, ...group.nodes].map((node) => node.elementRef)
    );
    assert.equal(memberRefs.has("id-actor"), true);
    assert.equal(memberRefs.has("id-role"), true);

    const referenced = model.views.find((view) => view.identifier === "id-view-ref");
    assert.ok(referenced);
    assert.ok(referenced.nodes.some((node) => node.w > 0 && node.h > 0));

    const viewpoint = model.views.find((view) => view.identifier === "id-view-viewpoint");
    assert.ok(viewpoint);
    assert.ok(viewpoint.nodes.length >= 2);
  });
});
