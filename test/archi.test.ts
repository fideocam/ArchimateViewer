import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";
import { removeFromXml, retargetArchiConnection } from "../src/viewer/delete.ts";
import { renderView } from "../src/viewer/renderer.ts";
import { NavigatedViewer } from "../src/viewer/index.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const archi = readFileSync(join(dir, "fixtures/archi-model.archimate"), "utf8");

describe("Archi .archimate parsing", () => {
  it("reads model, elements from nested folders and relationships", () => {
    const model = parseModel(archi);
    assert.equal(model.format, "archi");
    assert.equal(model.name, "Archi Claims");
    assert.equal(model.identifier, "id-model");
    assert.equal(model.elements.get("id-customer")?.type, "BusinessActor");
    assert.equal(model.elements.get("id-customer")?.documentation, "Person filing a claim");
    assert.equal(model.elements.get("id-handle")?.name, "Handle Claim");
    assert.equal(model.elements.get("id-junction")?.type, "OrJunction");
    assert.equal(model.elements.has("id-view-main"), false);

    assert.equal(model.relationships.get("id-r-assign")?.type, "Assignment");
    assert.equal(model.relationships.get("id-r-read")?.accessType, "Read");
    assert.equal(model.relationships.get("id-r-write")?.accessType, "Write");
    assert.equal(model.relationships.get("id-r-serve")?.name, "serves");
    assert.equal(model.relationships.get("id-r-inf")?.modifier, "++");
    assert.equal(model.relationships.get("id-r-assoc")?.isDirected, true);
  });

  it("reads ArchiMate diagrams, skipping sketch models", () => {
    const model = parseModel(archi);
    assert.deepEqual(
      model.views.map((view) => view.name),
      ["Main View", "Motivation"]
    );
    const view = model.views[0];
    assert.equal(view.documentation, "Main claims view");

    const group = view.nodes.find((node) => node.identifier === "id-d-group");
    assert.ok(group);
    assert.equal(group.xsiType, "Container");
    assert.equal(group.label, "Business Layer");
    assert.deepEqual(group.style?.fillColor, { r: 224, g: 224, b: 224 });

    const customer = group.children.find((node) => node.identifier === "id-d-customer");
    assert.ok(customer);
    assert.equal(customer.elementRef, "id-customer");
    assert.equal(customer.x, 20);
    assert.equal(customer.style?.font?.size, 12);
    assert.equal(customer.style?.font?.style, "bold");

    const handle = group.children.find((node) => node.identifier === "id-d-handle");
    assert.equal(handle?.w, 120);
    assert.equal(handle?.h, 55);

    const note = view.nodes.find((node) => node.identifier === "id-d-note");
    assert.equal(note?.xsiType, "Label");
    assert.equal(note?.label, "Claims are handled within 5 days");

    const ref = view.nodes.find((node) => node.identifier === "id-d-ref");
    assert.equal(ref?.viewRef, "id-view-motivation");
    assert.equal(ref?.label, "Motivation");

    assert.deepEqual(
      view.connections.map((conn) => conn.identifier).sort(),
      ["id-c-assign", "id-c-read", "id-c-serve"]
    );
  });

  it("converts Archi relative bendpoints to absolute coordinates", () => {
    const model = parseModel(archi);
    const read = model.views[0].connections.find((conn) => conn.identifier === "id-c-read");
    assert.ok(read);
    assert.equal(read.source, "id-d-handle");
    assert.equal(read.target, "id-d-claim");
    assert.equal(read.relationshipRef, "id-r-read");
    // source centre (320, 87.5) + (0, 80); target centre (460, 327.5) + (-100, 0); halfway blend.
    assert.deepEqual(read.bendpoints, [{ x: 340, y: 248 }]);
  });

  it("renders Archi diagrams", () => {
    const model = parseModel(archi);
    const svg = renderView(model.views[0], model);
    assert.match(svg, /data-element-id="id-d-customer"/);
    assert.match(svg, /data-element-id="id-c-serve"/);
    assert.match(svg, /Claims are handled/);
  });
});

describe("Archi .archimate editing", () => {
  it("drops deleted connections from targetConnections", () => {
    const out = removeFromXml(archi, ["id-c-assign"]);
    assert.equal(out.includes('id="id-c-assign"'), false);
    assert.match(out, /id="id-d-handle" targetConnections="id-c-serve"/);
    assert.doesNotThrow(() => parseModel(out));
  });

  it("removes the targetConnections attribute when no connections remain", () => {
    const out = removeFromXml(archi, ["id-c-read"]);
    assert.match(out, /<child xsi:type="archimate:DiagramObject" id="id-d-claim" archimateElement="id-claim">/);
  });

  it("moves targetConnections when a connection target changes", () => {
    const out = retargetArchiConnection(archi, "id-c-read", "target", "id-d-claim", "id-d-app");
    assert.match(out, /id="id-c-read" source="id-d-handle" target="id-d-app"/);
    assert.match(out, /id="id-d-claim" archimateElement="id-claim">/);
    assert.match(out, /id="id-d-app" archimateElement="id-app" lineColor="#205c5c" targetConnections="id-c-read"/);
    const read = parseModel(out).views[0].connections.find((conn) => conn.identifier === "id-c-read");
    assert.equal(read?.target, "id-d-app");
  });

  it("moves the sourceConnection element under the new source", () => {
    const out = retargetArchiConnection(archi, "id-c-assign", "source", "id-d-customer", "id-d-claim");
    const doc = new DOMParser().parseFromString(out, "application/xml");
    const conn = [...doc.getElementsByTagName("sourceConnection")].find((el) => el.getAttribute("id") === "id-c-assign");
    assert.ok(conn);
    assert.equal(conn.getAttribute("source"), "id-d-claim");
    assert.equal((conn.parentNode as Element).getAttribute("id"), "id-d-claim");
    assert.match(out, /id="id-d-handle" targetConnections="id-c-assign id-c-serve"/);
    const model = parseModel(out);
    assert.equal(model.views[0].connections.find((c) => c.identifier === "id-c-assign")?.source, "id-d-claim");
  });

  it("opens in the viewer and deletes a node from the file", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    let saved = "";
    viewer.on("change", (payload) => {
      saved = (payload as { xml: string }).xml;
    });
    const result = await viewer.importXML(archi);
    assert.deepEqual(result.warnings, []);
    assert.ok(container.querySelector('[data-element-id="id-d-customer"]'));

    (viewer as unknown as { deleteDiagramObject(kind: string, id: string): void }).deleteDiagramObject("node", "id-d-app");
    assert.equal(saved.includes('id="id-d-app"'), false);
    assert.equal(saved.includes('id="id-c-serve"'), false);
    assert.equal(saved.includes('id="id-app"'), true);
    assert.equal(saved.includes('id="id-r-serve"'), true);
    assert.match(saved, /id="id-d-handle" targetConnections="id-c-assign"/);
    assert.doesNotThrow(() => parseModel(saved));

    viewer.destroy();
  });
});
