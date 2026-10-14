import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";
import { renderView } from "../src/viewer/renderer.ts";
import type { DiagramNode } from "../src/viewer/types.ts";
import ArchiMateJS, { NavigatedViewer } from "../src/viewer/index.ts";

class DiagramPointerEvent extends window.Event {
  clientX: number;
  clientY: number;
  button: number;
  pointerId: number;
  constructor(
    type: string,
    init: { bubbles?: boolean; clientX?: number; clientY?: number; button?: number; pointerId?: number } = {}
  ) {
    super(type, init);
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0;
    this.pointerId = init.pointerId ?? 1;
  }
}

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
    assert.match(
      svg,
      /data-element-id="id-n-customer"[\s\S]*?<text class="av-label" x="120" y="100" text-anchor="middle" dominant-baseline="central"/
    );
  });

  it("draws nested model elements as separate boxes with relationship arrows", () => {
    const model = parseModel(fixture);
    const svg = renderView(model.views[0], model);

    assert.match(svg, /data-element-id="id-n-claim-app"/);
    assert.match(svg, /data-element-id="id-n-claim-fn"/);
    assert.match(svg, /data-element-id="id-n-claim-data"/);
    assert.doesNotMatch(svg, /data-parent-id="id-n-claim-app"/);
    assert.match(svg, /data-type="Composition"/);
    assert.match(svg, /data-type="Aggregation"/);

    const parent = svg.match(/data-element-id="id-n-claim-app"[^>]*data-h="(\d+(?:\.\d+)?)"/);
    const child = svg.match(/data-element-id="id-n-claim-fn"[^>]*/);
    assert.ok(parent && child);
    assert.ok(Number(parent[1]) <= 70, "parent element box should not wrap its former children");
  });

  it("renders the relationships sample with typed connectors", () => {
    const xml = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../samples/relationships.xml"),
      "utf8"
    );
    const model = parseModel(xml);
    const svg = renderView(model.views[0], model);
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
    assert.match(svg, /marker-start=/);
    assert.match(svg, /marker-end=/);
    assert.match(svg, /stroke-dasharray="2 3"/); // Access dotted
    assert.match(svg, /stroke-dasharray="8 5"/); // Realization / Flow / Influence dashed
  });

  it("uses a 2px stroke and larger corner icons", () => {
    const model = parseModel(fixture);
    const svg = renderView(model.views[0], model);
    assert.match(svg, /class="av-node"[\s\S]*?stroke-width="2"/);
    assert.match(svg, /class="av-connection"[\s\S]*?stroke-width="2"/);
    assert.doesNotMatch(svg, /stroke-width="1\.25"/);
    assert.doesNotMatch(svg, /stroke-width="1\.35"/);
    assert.match(svg, /class="av-icon"[^>]*scale\(1\.7\)/);
    const customer = svg.match(/data-element-id="id-n-customer"[\s\S]*?<\/g>/);
    const process = svg.match(/data-element-id="id-n-register"[\s\S]*?<\/g>/);
    const claim = svg.match(/data-element-id="id-n-claim"[\s\S]*?<\/g>/);
    const server = svg.match(/data-element-id="id-n-db-node"[\s\S]*?<\/g>/);
    assert.ok(customer && process && claim && server);
    assert.match(customer[0], /av-icon/);
    assert.doesNotMatch(process[0], /av-icon/);
    assert.doesNotMatch(claim[0], /av-icon/);
    assert.doesNotMatch(server[0], /av-icon/);
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
    const stage = container.querySelector(".av-stage") as HTMLElement;
    const beforePan = stage.style.transform;
    canvas.panBy(40, -15);
    assert.notEqual(stage.style.transform, beforePan);
    assert.match(stage.style.transform, /scale\(1\.5\)/);

    viewer.destroy();
  });

  it("drags objects in diagram coordinates and keeps connectors attached", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });

    const viewer = new NavigatedViewer({ container });
    await viewer.importXML(fixture);
    const canvas = viewer.get("canvas");
    canvas.zoom(2);

    const customer = findNode(viewer.get("model").views[0].nodes, "id-n-customer");
    const claimFn = findNode(viewer.get("model").views[0].nodes, "id-n-claim-fn");
    const flow = viewer.get("model").views[0].connections.find((conn) => conn.identifier === "id-c-flow");
    assert.ok(customer && claimFn && flow);
    assert.equal(customer.x, 30);
    assert.equal(claimFn.x, 260);
    assert.equal(flow.bendpoints[0].x, 490);

    const beforeTrigger = container.querySelector('[data-element-id="id-c-trigger"] path')?.getAttribute("d");
    drag(container, "id-n-customer", 20, 0);
    assert.equal(customer.x, 40);
    const customerEl = container.querySelector('[data-element-id="id-n-customer"]');
    assert.equal(customerEl?.getAttribute("data-x"), "60");
    assert.notEqual(
      container.querySelector('[data-element-id="id-c-trigger"] path')?.getAttribute("d"),
      beforeTrigger
    );

    canvas.zoom(1);
    const childX = claimFn.x;
    const flowX = flow.bendpoints[0].x;
    drag(container, "id-n-claim-app", 25, 10);
    assert.equal(claimFn.x, childX, "unnested children must not move with the former parent");
    assert.equal(flow.bendpoints[0].x, flowX);
    assert.equal(container.querySelector('[data-element-id="id-n-claim-app"]')?.getAttribute("data-x"), "285");

    viewer.destroy();
  });

  it("hugs the diagram instead of adding a side pad, and keeps overflow visible", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    await viewer.importXML(fixture);
    const svg = container.querySelector("svg");
    assert.ok(svg);
    assert.equal(svg.getAttribute("overflow"), "visible");
    assert.equal(container.querySelector(".av-backdrop"), null);
    assert.equal(svg.getAttribute("viewBox"), "20 20 760 560");
    viewer.destroy();
  });

  it("moves relationship arrows and edits labels on click", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    await viewer.importXML(fixture);
    const model = viewer.get("model");
    const flow = model.views[0].connections.find((conn) => conn.identifier === "id-c-flow");
    const trigger = model.views[0].connections.find((conn) => conn.identifier === "id-c-trigger");
    assert.ok(flow && trigger);
    assert.equal(flow.bendpoints[0].x, 490);

    drag(container, "id-c-flow", 15, -10);
    assert.equal(flow.bendpoints.length, 2);
    assert.equal(flow.bendpoints[0].x, 490);
    assert.equal(flow.bendpoints[0].y, 310);
    assert.equal(flow.bendpoints[1].x, 505);
    assert.equal(flow.bendpoints[1].y, 300);

    drag(container, "id-c-trigger", 30, 12);
    assert.equal(trigger.bendpoints.length, 1);
    assert.equal(trigger.bendpoints[0].x, 330);
    assert.equal(trigger.bendpoints[0].y, 112);

    drag(container, "id-c-trigger", 0, 20);
    assert.equal(trigger.bendpoints.length, 2);
    assert.equal(trigger.bendpoints[0].x, 330);
    assert.equal(trigger.bendpoints[0].y, 112);
    assert.equal(trigger.bendpoints[1].x, 330);
    assert.equal(trigger.bendpoints[1].y, 132);

    const label = container.querySelector('[data-element-id="id-n-customer"] .av-label');
    assert.ok(label);
    label.dispatchEvent(
      new DiagramPointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, button: 0, pointerId: 1 })
    );
    container.dispatchEvent(
      new DiagramPointerEvent("pointerup", { bubbles: true, clientX: 0, clientY: 0, button: 0, pointerId: 1 })
    );
    const input = container.querySelector("input.av-label-editor") as HTMLInputElement | null;
    assert.ok(input);
    input.value = "Client";
    const enter = new window.Event("keydown", { bubbles: true });
    Object.defineProperty(enter, "key", { value: "Enter" });
    input.dispatchEvent(enter);
    assert.equal(model.elements.get("id-customer")?.name, "Client");
    assert.match(container.querySelector('[data-element-id="id-n-customer"]')?.textContent || "", /Client/);

    const arrowLabel = container.querySelector('[data-element-id="id-c-flow"] .av-label');
    assert.ok(arrowLabel);
    arrowLabel.dispatchEvent(
      new DiagramPointerEvent("pointerdown", { bubbles: true, clientX: 4, clientY: 4, button: 0, pointerId: 2 })
    );
    container.dispatchEvent(
      new DiagramPointerEvent("pointerup", { bubbles: true, clientX: 4, clientY: 4, button: 0, pointerId: 2 })
    );
    const arrowInput = container.querySelector("input.av-label-editor") as HTMLInputElement | null;
    assert.ok(arrowInput);
    assert.equal(arrowInput.value, "updates");
    arrowInput.value = "writes";
    const enterArrow = new window.Event("keydown", { bubbles: true });
    Object.defineProperty(enterArrow, "key", { value: "Enter" });
    arrowInput.dispatchEvent(enterArrow);
    assert.equal(model.relationships.get("id-r-flow")?.name, "writes");

    viewer.destroy();
  });

  it("drags one kink point along the arrow", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    await viewer.importXML(fixture);
    const flow = viewer.get("model").views[0].connections.find((conn) => conn.identifier === "id-c-flow");
    assert.ok(flow);
    const handle = container.querySelector('[data-element-id="id-c-flow"] .av-connection-kink[data-index="0"]');
    assert.ok(handle);

    const orig = { x: flow.bendpoints[0].x, y: flow.bendpoints[0].y };
    dragElement(handle, container, 15, -10);
    assert.equal(flow.bendpoints.length, 1);
    assert.equal(flow.bendpoints[0].x, orig.x + 15);
    assert.equal(flow.bendpoints[0].y, orig.y - 10);

    drag(container, "id-c-flow", 0, 20);
    assert.equal(flow.bendpoints.length, 2);
    const kept = { x: flow.bendpoints[1].x, y: flow.bendpoints[1].y };
    const first = container.querySelector('[data-element-id="id-c-flow"] .av-connection-kink[data-index="0"]');
    assert.ok(first);
    const before = { x: flow.bendpoints[0].x, y: flow.bendpoints[0].y };
    dragElement(first, container, -20, 5);
    assert.equal(flow.bendpoints[0].x, before.x - 20);
    assert.equal(flow.bendpoints[0].y, before.y + 5);
    assert.equal(flow.bendpoints[1].x, kept.x);
    assert.equal(flow.bendpoints[1].y, kept.y);
    assert.ok(container.querySelector('[data-element-id="id-c-flow"].is-selected'));

    const customer = container.querySelector('[data-element-id="id-n-customer"]');
    assert.ok(customer);
    customer.dispatchEvent(
      new DiagramPointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, button: 0, pointerId: 3 })
    );
    assert.equal(container.querySelector('[data-element-id="id-c-flow"].is-selected'), null);

    viewer.destroy();
  });

  it("retargets a relationship when an arrow end is dropped on another element", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    let saved = "";
    viewer.on("change", (payload) => {
      saved = (payload as { xml: string }).xml;
    });
    await viewer.importXML(fixture);
    const model = viewer.get("model");
    const trigger = model.views[0].connections.find((conn) => conn.identifier === "id-c-trigger");
    assert.ok(trigger);
    assert.ok(container.querySelector('[data-element-id="id-c-trigger"] .av-connection-end[data-end="source"]'));
    assert.ok(container.querySelector('[data-element-id="id-c-trigger"] .av-connection-end[data-end="target"]'));

    dragEnd(container, "id-c-trigger", "source", 0, 0);
    assert.equal(trigger.source, "id-n-customer");
    assert.equal(model.relationships.get("id-r-trigger")?.source, "id-customer");
    assert.equal(saved, "");

    dragEnd(container, "id-c-trigger", "source", 300, 100);
    assert.equal(trigger.source, "id-n-clerk");
    assert.equal(trigger.target, "id-n-register");
    assert.equal(model.relationships.get("id-r-trigger")?.source, "id-clerk");
    assert.equal(model.relationships.get("id-r-trigger")?.target, "id-register");
    assert.match(container.querySelector('[data-element-id="id-c-trigger"]')?.getAttribute("data-source") || "", /id-n-clerk/);
    assert.match(saved, /identifier="id-c-trigger"[^>]*source="id-n-clerk"/);
    assert.match(saved, /identifier="id-r-trigger"[^>]*source="id-clerk"/);
    assert.match(saved, /identifier="id-r-trigger"[^>]*target="id-register"/);

    dragEnd(container, "id-c-trigger", "target", 680, 100);
    assert.equal(trigger.target, "id-n-claim");
    assert.equal(model.relationships.get("id-r-trigger")?.target, "id-claim");
    assert.match(saved, /identifier="id-c-trigger"[^>]*target="id-n-claim"/);

    viewer.destroy();
  });

  it("deletes a selected object or arrow from the diagram and the file", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    let saved = "";
    viewer.on("change", (payload) => {
      saved = (payload as { xml: string }).xml;
    });
    await viewer.importXML(fixture);

    click(container, "id-n-customer");
    assert.ok(container.querySelector('[data-element-id="id-n-customer"].is-selected'));
    pressKey("Backspace");

    const model = viewer.get("model");
    assert.equal(findNode(model.views[0].nodes, "id-n-customer"), undefined);
    assert.equal(model.elements.has("id-customer"), true);
    assert.equal(model.relationships.has("id-r-trigger"), true);
    assert.equal(model.views[0].connections.some((conn) => conn.identifier === "id-c-trigger"), false);
    assert.ok(findNode(model.views[0].nodes, "id-n-clerk"));
    assert.equal(container.querySelector('[data-element-id="id-n-customer"]'), null);
    assert.equal(saved.includes('identifier="id-n-customer"'), false);
    assert.equal(saved.includes('identifier="id-customer"'), true);
    assert.equal(saved.includes('identifier="id-r-trigger"'), true);
    assert.equal(saved.includes('identifier="id-c-trigger"'), false);
    assert.equal(saved.includes('identifier="id-n-clerk"'), true);

    click(container, "id-c-assign");
    assert.ok(container.querySelector('[data-element-id="id-c-assign"].is-selected'));
    pressKey("Backspace");
    assert.equal(viewer.get("model").views[0].connections.some((conn) => conn.identifier === "id-c-assign"), false);
    assert.equal(viewer.get("model").relationships.has("id-r-assign"), false);
    assert.equal(saved.includes('identifier="id-c-assign"'), false);
    assert.equal(saved.includes('identifier="id-r-assign"'), false);
    assert.ok(findNode(viewer.get("model").views[0].nodes, "id-n-clerk"));

    viewer.destroy();
  });

  it("removes an unused element from the file and keeps one that appears on another view", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="m">
  <name>Usage</name>
  <elements>
    <element identifier="id-only" xsi:type="BusinessActor"><name>Only Here</name></element>
    <element identifier="id-shared" xsi:type="BusinessRole"><name>Shared</name></element>
  </elements>
  <relationships/>
  <views>
    <diagrams>
      <view identifier="v1" xsi:type="Diagram">
        <name>One</name>
        <node identifier="n-only" xsi:type="Element" elementRef="id-only" x="10" y="10" w="80" h="40"/>
        <node identifier="n-shared-1" xsi:type="Element" elementRef="id-shared" x="120" y="10" w="80" h="40"/>
      </view>
      <view identifier="v2" xsi:type="Diagram">
        <name>Two</name>
        <node identifier="n-shared-2" xsi:type="Element" elementRef="id-shared" x="10" y="10" w="80" h="40"/>
      </view>
    </diagrams>
  </views>
</model>`;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const viewer = new NavigatedViewer({ container });
    let saved = "";
    viewer.on("change", (payload) => {
      saved = (payload as { xml: string }).xml;
    });
    await viewer.importXML(xml);

    click(container, "n-only");
    pressKey("Backspace");
    assert.equal(findNode(viewer.get("model").views[0].nodes, "n-only"), undefined);
    assert.equal(viewer.get("model").elements.has("id-only"), false);
    assert.equal(saved.includes('identifier="id-only"'), false);
    assert.equal(saved.includes('identifier="n-only"'), false);

    click(container, "n-shared-1");
    pressKey("Backspace");
    assert.equal(findNode(viewer.get("model").views[0].nodes, "n-shared-1"), undefined);
    assert.equal(viewer.get("model").elements.has("id-shared"), true);
    assert.equal(findNode(viewer.get("model").views[1].nodes, "n-shared-2")?.elementRef, "id-shared");
    assert.equal(saved.includes('identifier="id-shared"'), true);
    assert.equal(saved.includes('identifier="n-shared-2"'), true);
    assert.equal(saved.includes('identifier="n-shared-1"'), false);

    viewer.destroy();
  });

  it("exposes a constructable default export", () => {
    assert.equal(typeof ArchiMateJS, "function");
    assert.equal(ArchiMateJS.NavigatedViewer, NavigatedViewer);
  });
});

function findNode(nodes: DiagramNode[], id: string): DiagramNode | undefined {
  for (const node of nodes) {
    if (node.identifier === id) {
      return node;
    }
    const found = findNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function click(container: HTMLElement, id: string) {
  drag(container, id, 0, 0);
}

function pressKey(key: string) {
  const event = new window.Event("keydown", { bubbles: true });
  Object.defineProperty(event, "key", { value: key });
  document.dispatchEvent(event);
}

function dragEnd(container: HTMLElement, id: string, end: "source" | "target", x: number, y: number) {
  const handle = container.querySelector(`[data-element-id="${id}"] .av-connection-end[data-end="${end}"]`);
  assert.ok(handle);
  handle.dispatchEvent(
    new DiagramPointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 })
  );
  container.dispatchEvent(
    new DiagramPointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 })
  );
  container.dispatchEvent(
    new DiagramPointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 })
  );
}

function dragElement(node: Element, container: HTMLElement, dx: number, dy: number) {
  node.dispatchEvent(
    new DiagramPointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, button: 0, pointerId: 1 })
  );
  container.dispatchEvent(
    new DiagramPointerEvent("pointermove", { bubbles: true, clientX: dx, clientY: dy, button: 0, pointerId: 1 })
  );
  container.dispatchEvent(
    new DiagramPointerEvent("pointerup", { bubbles: true, clientX: dx, clientY: dy, button: 0, pointerId: 1 })
  );
}

function drag(container: HTMLElement, id: string, dx: number, dy: number) {
  const node = container.querySelector(`[data-element-id="${id}"]`);
  assert.ok(node);
  const viewport = container;
  node.dispatchEvent(
    new DiagramPointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, button: 0, pointerId: 1 })
  );
  viewport.dispatchEvent(
    new DiagramPointerEvent("pointermove", { bubbles: true, clientX: dx, clientY: dy, button: 0, pointerId: 1 })
  );
  viewport.dispatchEvent(
    new DiagramPointerEvent("pointerup", { bubbles: true, clientX: dx, clientY: dy, button: 0, pointerId: 1 })
  );
}
