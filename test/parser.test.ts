import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/layered-view.xml"),
  "utf8"
);

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
});
