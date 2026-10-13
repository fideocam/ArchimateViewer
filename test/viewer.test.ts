import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";
import { renderView } from "../src/viewer/renderer.ts";
import ArchiMateJS, { NavigatedViewer } from "../src/viewer/index.ts";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/layered-view.xml"),
  "utf8"
);

describe("renderView", () => {
  it("emits recognizable ArchiMate shapes, nested nodes and relationship markers", () => {
    const model = parseModel(fixture);
    const svg = renderView(model.views[0], model);

    assert.match(svg, /data-element-id="id-n-customer"/);
    assert.match(svg, /data-type="BusinessActor"/);
    assert.match(svg, /data-type="BusinessProcess"/);
    assert.match(svg, /rx="/); // rounded behavior elements
    assert.match(svg, /data-kind="relationship"/);
    assert.match(svg, /marker-end=/);
    assert.match(svg, /Customer/);
    assert.match(svg, /Claim Management/);
  });
});

describe("NavigatedViewer", () => {
  it("imports XML into a container and supports view switching and fit-viewport zoom", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });

    const viewer = new NavigatedViewer({ container });
    const result = await viewer.importXML(fixture);

    assert.equal(result.warnings.length, 0);
    assert.ok(container.querySelector("svg"));
    assert.ok(container.querySelector('[data-element-id="id-n-customer"]'));

    const model = viewer.get("model");
    assert.equal(model.views.length, 2);

    await viewer.openView("id-view-motivation");
    assert.ok(container.querySelector('[data-element-id="id-n-goal"]'));
    assert.equal(container.querySelector('[data-element-id="id-n-customer"]'), null);

    const canvas = viewer.get("canvas");
    canvas.zoom("fit-viewport");
    assert.ok(canvas.getZoom() > 0);
    canvas.zoom(1.5);
    assert.equal(canvas.getZoom(), 1.5);

    viewer.destroy();
  });

  it("exposes a constructable default export like bpmn-js", () => {
    assert.equal(typeof ArchiMateJS, "function");
    assert.equal(ArchiMateJS.NavigatedViewer, NavigatedViewer);
  });
});
