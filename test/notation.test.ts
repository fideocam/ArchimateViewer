import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getElementNotation, getRelationshipNotation } from "../src/viewer/notation.ts";

describe("ArchiMate notation", () => {
  it("uses layer colours and aspect shapes for common elements", () => {
    const actor = getElementNotation("BusinessActor");
    assert.equal(actor.layer, "business");
    assert.equal(actor.aspect, "active");
    assert.equal(actor.shape, "rect");
    assert.match(actor.fill, /^#/i);

    const process = getElementNotation("BusinessProcess");
    assert.equal(process.aspect, "behavior");
    assert.equal(process.shape, "rounded");

    const object = getElementNotation("BusinessObject");
    assert.equal(object.aspect, "passive");
    assert.equal(object.shape, "folded");

    const app = getElementNotation("ApplicationComponent");
    assert.equal(app.layer, "application");

    const node = getElementNotation("Node");
    assert.equal(node.layer, "technology");
    assert.equal(node.shape, "box3d");

    const goal = getElementNotation("Goal");
    assert.equal(goal.layer, "motivation");
    assert.equal(goal.shape, "ellipse");
  });

  it("maps relationship line styles and end markers", () => {
    assert.deepEqual(getRelationshipNotation("Composition").sourceMarker, "filled-diamond");
    assert.equal(getRelationshipNotation("Aggregation").sourceMarker, "open-diamond");
    assert.equal(getRelationshipNotation("Assignment").sourceMarker, "filled-circle");
    assert.equal(getRelationshipNotation("Assignment").targetMarker, "none");
    assert.equal(getRelationshipNotation("Realization").dash, "dashed");
    assert.equal(getRelationshipNotation("Realization").targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("Serving").dash, "solid");
    assert.equal(getRelationshipNotation("Serving").targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("UsedBy").targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("Access").dash, "dotted");
    assert.equal(getRelationshipNotation("Triggering").dash, "solid");
    assert.equal(getRelationshipNotation("Triggering").targetMarker, "filled-arrow");
    assert.equal(getRelationshipNotation("Flow").dash, "dashed");
    assert.equal(getRelationshipNotation("Flow").targetMarker, "filled-arrow");
    assert.equal(getRelationshipNotation("Specialization").targetMarker, "open-triangle");
    assert.equal(getRelationshipNotation("Influence").dash, "dashed");
    assert.equal(getRelationshipNotation("Influence").targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("Association").sourceMarker, "none");
    assert.equal(getRelationshipNotation("Association").targetMarker, "none");
  });

  it("covers Access direction, directed Association, and Relationship-suffixed type names", () => {
    assert.equal(getRelationshipNotation("Access", { accessType: "Write" }).targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("Access", { accessType: "Read" }).sourceMarker, "open-arrow");
    assert.equal(getRelationshipNotation("Access", { accessType: "Read" }).targetMarker, "none");
    const rw = getRelationshipNotation("Access", { accessType: "ReadWrite" });
    assert.equal(rw.sourceMarker, "open-arrow");
    assert.equal(rw.targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("Association", { isDirected: true }).targetMarker, "open-arrow");
    assert.equal(getRelationshipNotation("CompositionRelationship").sourceMarker, "filled-diamond");
    assert.equal(getRelationshipNotation("UsedByRelationship").targetMarker, "open-arrow");
  });
});
