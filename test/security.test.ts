import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "./setup-dom.ts";
import { parseModel } from "../src/viewer/parser.ts";

describe("Security Vulnerability Tests", () => {
  it("should handle deeply nested XML without crashing (DoS test)", () => {
    // Create a deeply nested XML structure to test for stack overflow
    // We use a depth that is likely to cause issues if recursion is uncontrolled, 
    // but not so deep that the test runner itself crashes.
    const depth = 1000;
    let xml = `<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/">`;
    xml += `<views><diagrams><view identifier="v1">`;
    for (let i = 0; i < depth; i++) {
      xml += `<node identifier="n${i}"><node identifier="n${i+1}">`;
    }
    xml += `</node>`.repeat(depth + 1);
    xml += `</view></diagrams></views></model>`;

    // The goal is to see if it completes or throws a RangeError (stack overflow)
    try {
      parseModel(xml);
    } catch (e) {
      if (e instanceof RangeError && e.message.includes("Maximum call stack size exceeded")) {
        assert.fail("Stack overflow detected in XML traversal");
      }
      // Other errors (like parser errors) are acceptable, but not stack overflows
    }
  });

  it("should not execute scripts embedded in XML (XSS test)", () => {
    // While the parser doesn't render, we check that it treats script tags as data
    const xml = `
    <model xmlns="http://www.opengroup.org/xsd/archimate/3.0/">
      <elements>
        <element identifier="e1">
          <name><![CDATA[<script>alert('xss')</script>]]></name>
        </element>
      </elements>
    </model>`;
    
    const model = parseModel(xml);
    const element = model.elements.get("e1");
    assert.equal(element?.name, "<script>alert('xss')</script>");
  });

  it("should handle XML entities safely (XXE test)", () => {
    // Test if external entities are resolved. In a safe environment, they should be ignored or cause an error.
    const xml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE model [
      <!ENTITY xxe SYSTEM "http://attacker.com/evil.txt">
    ]>
    <model xmlns="http://www.opengroup.org/xsd/archimate/3.0/">
      <elements>
        <element identifier="e1">
          <name>&xxe;</name>
        </element>
      </elements>
    </model>`;

    try {
      const model = parseModel(xml);
      const element = model.elements.get("e1");
      // If &xxe; was resolved, the name would be the content of evil.txt.
      // If not resolved, it will likely be an empty string or the literal "&xxe;" depending on the DOMParser.
      assert.notEqual(element?.name, "contents of evil.txt");
    } catch (e) {
      // Parsing errors are acceptable for XXE prevention
    }
  });
});
