# ArchiMate Viewer

VS Code extension that opens [Open Group ArchiMate Model Exchange](https://www.opengroup.org/open-group-archimate-model-exchange-file-format) XML and renders the diagram with pan/zoom. The rendering engine is a bpmn-js-style JavaScript viewer you can also embed on a web page.

This is a **viewer**, not a modeler.

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

Wheel to zoom, drag the canvas to pan, use the toolbar to fit or switch views.

## Embed the JavaScript viewer

Same product shape as [bpmn-js Viewer](https://bpmn.io/toolkit/bpmn-js/walkthrough/): attach to a container, `importXML`, then zoom.

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

Parses Open Group ArchiMate 3.x Model Exchange XML (`http://www.opengroup.org/xsd/archimate/3.0/`), including elements, relationships, diagram views, nested nodes, visual bounds, styles, and bendpoints. ArchiMate 2.x `label` text is also read.

**Elements:** Business, Application, Technology, Physical, Motivation, Strategy, Implementation & Migration, plus Grouping, Location, and Junctions. Shapes follow ArchiMate aspect conventions (square = active structure, rounded = behavior, folded corner = passive structure, ellipse/bevel = motivation, 3D box = nodes/devices). Layer colours match the usual Archi palette.

**Relationships:** Composition, Aggregation, Assignment, Realization, Serving, Access, Influence, Triggering, Flow, Specialization, Association — with the standard line styles and end markers.

Unknown types fall back to a labelled rectangle / solid connector.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm test` | Parser, notation, and viewer tests |
| `npm run compile` | Extension host, webview bundle, and library dist |
| `npm run demo` | Static demo at `/demo` |
| `npm run package` | Build a `.vsix` |
