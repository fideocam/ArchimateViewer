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
const archigpt = readFileSync(join(dir, "fixtures/archigpt-agent.xml"), "utf8");

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

  it("does not draw plugin-JSON style viewsAndDiagrams/id XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="m">
  <name>Legacy agent shape</name>
  <elements>
    <element id="id-actor" type="BusinessActor"><name>Actor</name></element>
  </elements>
  <relationships/>
  <viewsAndDiagrams>
    <view name="Idea" id="v1">
      <node elementId="id-actor" x="10" y="10" width="120" height="55"/>
    </view>
  </viewsAndDiagrams>
</model>`;
    const model = parseModel(xml);
    assert.equal(model.elements.size, 0, "elements must use identifier, not id");
    const view = model.views[0];
    assert.ok(!view || view.nodes.every((node) => !node.elementRef), "nodes must use elementRef, not elementId");
  });

  it("parses ArchiGPT agent-shaped exchange XML without requiring xsi:type=Diagram", () => {
    assert.equal(/<view[^>]*xsi:type="Diagram"/.test(archigpt), false);
    const model = parseModel(archigpt);
    assert.equal(model.views.length, 1);
    assert.equal(model.views[0].identifier, "id-view-archigpt");
    assert.ok(model.views[0].nodes.some((node) => node.elementRef === "id-left"));
    assert.ok(model.views[0].nodes.some((node) => node.xsiType === "Container" && !node.elementRef));
    assert.equal(model.elements.get("id-left")?.type, "BusinessActor");
    assert.equal(model.relationships.get("id-serve-rel")?.type, "Serving");
    assert.equal(model.relationships.get("id-serve-rel")?.source, "id-svc");
    assert.equal(model.relationships.get("id-serve-rel")?.target, "id-right");
    assert.ok(model.views[0].connections.length >= 11);
  });

  it("requires relationship source and target as attributes, not nested children", () => {
    assert.match(archigpt, /<relationship[^>]*\ssource="/);
    assert.match(archigpt, /<relationship[^>]*\starget="/);
    assert.doesNotMatch(archigpt, /<relationship[^>]*>\s*<source[\s>]/);
    assert.doesNotMatch(archigpt, /<relationship[^>]*>\s*<target[\s>]/);

    const nested = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="m">
  <name>Nested ends</name>
  <elements>
    <element identifier="id-a" xsi:type="BusinessActor"><name>A</name></element>
    <element identifier="id-b" xsi:type="BusinessProcess"><name>B</name></element>
  </elements>
  <relationships>
    <relationship identifier="id-r-nested" xsi:type="Serving">
      <source>id-a</source>
      <target>id-b</target>
    </relationship>
  </relationships>
  <views>
    <diagrams>
      <view identifier="v1">
        <name>One</name>
        <node identifier="n-a" xsi:type="Element" elementRef="id-a" x="10" y="10" w="80" h="40"/>
        <node identifier="n-b" xsi:type="Element" elementRef="id-b" x="120" y="10" w="80" h="40"/>
      </view>
    </diagrams>
  </views>
</model>`;
    const model = parseModel(nested);
    assert.equal(model.relationships.has("id-r-nested"), false);
    assert.ok(model.warnings.some((w) => /source\/target/i.test(w)));
  });
});
