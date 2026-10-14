# ArchiMate Viewer

VS Code extension that opens [Open Group ArchiMate Model Exchange](https://www.opengroup.org/open-group-archimate-model-exchange-file-format) XML and renders the diagram with pan/zoom. The rendering engine is a JavaScript viewer you can also embed on a web page.

This is a **viewer**, not a modeler.

<!-- marketplace:omit -->
## Run the extension locally (F5)

```sh
npm install
npm run compile
```

Open this folder in VS Code / Cursor and press **F5**. A new Extension Development Host window opens on the `samples/` folder. Open `archinsurance-claims.xml` (or use **Open With… → ArchiMate Viewer**).

- `.archimate` files open in the viewer by default
- `.xml` files can be opened with **Open With… → ArchiMate Viewer**, the **ArchiMate: Open Viewer** command, or by setting:

```json
"workbench.editorAssociations": {
  "*.xml": "archimate.viewer"
}
```

The F5 sample workspace already sets that association.
<!-- /marketplace:omit -->

The extension also ships **ArchiGPT**, a Copilot Chat custom agent (`ArchiGPT.agent.md`) registered with `contributes.chatAgents`. After F5 or installing the VSIX, pick **ArchiGPT** from the chat agents dropdown. It writes Open Group exchange XML this viewer can parse: `view`/`diagram` by tag (no `xsi:type="Diagram"` required), sibling `<node>` boxes with relationship `<connection>` arrows (not nested-in-box layout), and `identifier`/`xsi:type` on elements. Example output: `samples/archigpt-agent.xml`.

Wheel to zoom, drag the canvas to pan, use the toolbar to fit or switch views.

## Embed the JavaScript viewer

Attach to a container, call `importXML`, then zoom.

### Script tag

```html
<div id="canvas" style="height: 600px;"></div>
<script src="dist/archimate-viewer.js"></script>
<script>
  const viewer = new ArchiMateJS({ container: "#canvas" });
  const xml = "... ArchiMate Model Exchange XML ...";

  try {
    await viewer.importXML(xml);
    viewer.get("canvas").zoom("fit-viewport");
  } catch (err) {
    console.error("could not import ArchiMate diagram", err);
  }
</script>
```

`ArchiMateJS` is a `NavigatedViewer` (pan/zoom). Use `new ArchiMateJS.Viewer({ container })` for display-only.

### npm

```sh
npm install
```

```js
import { NavigatedViewer } from "archimate-viewer/lib/NavigatedViewer";

const viewer = new NavigatedViewer({ container: "#canvas" });
await viewer.importXML(xml);
viewer.get("canvas").zoom("fit-viewport");
```

`Viewer#importXML(xml, viewId?)` returns `{ warnings }`. `viewer.get("model")` exposes parsed elements, relationships, and views. `viewer.openView(id)` switches diagrams in a multi-view file.

## Demo page

```sh
npm run demo
```

Then open http://localhost:4173/demo/ — load a sample, or open/drop an `.xml` exchange file.

## ArchiMate coverage

Parses Open Group ArchiMate 3.x Model Exchange XML (`http://www.opengroup.org/xsd/archimate/3.0/`), including elements, relationships, diagram views, visual bounds, styles, and bendpoints. ArchiMate 2.x `label` text is also read. Nested model elements inside another element box are drawn as **separate boxes with relationship arrows** (not both nesting and an arrow). Visual grouping containers (layer frames without an `elementRef`) stay as frames.

**Elements:** Business, Application, Technology, Physical, Motivation, Strategy, Implementation & Migration, plus Grouping, Location, and Junctions. Shapes follow ArchiMate aspect conventions (square = active structure, rounded = behavior, folded corner = passive structure, ellipse/bevel = motivation, 3D box = nodes/devices). Layer colours match the usual Archi palette.

**Relationships (full exchange set):**

| Type | Line | Ends |
| --- | --- | --- |
| Association | solid | none, or open arrow if directed |
| Assignment | solid | filled circle at source |
| Realization | dashed | open arrow at target |
| Serving (Used-By) | solid | open arrow at target |
| Access | dotted | open arrow: Write → target, Read → source, ReadWrite → both |
| Influence | dashed | open arrow at target (optional +/- modifier) |
| Triggering | solid | filled arrow at target |
| Flow | dashed | filled arrow at target |
| Specialization | solid | open triangle at target |
| Composition | solid | filled diamond at source |
| Aggregation | solid | open diamond at source |

Unknown types fall back to a labelled rectangle / solid connector.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm test` | Parser, notation, and viewer tests |
| `npm run compile` | Extension host, webview bundle, and library dist |
| `npm run demo` | Static demo at `/demo` |
| `npm run package` | Build a `.vsix` |
