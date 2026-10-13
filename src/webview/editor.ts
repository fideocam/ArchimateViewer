import { NavigatedViewer } from "../viewer/NavigatedViewer";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
const canvasEl = document.getElementById("canvas") as HTMLElement;
const viewsEl = document.getElementById("views") as HTMLSelectElement;
const titleEl = document.getElementById("title") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const viewer = new NavigatedViewer({ container: canvasEl });

let currentXml = "";

window.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type === "error") {
    statusEl.textContent = message.message;
    return;
  }
  if (message.type === "init" || message.type === "update") {
    currentXml = message.text || "";
    if (message.fileName) {
      titleEl.textContent = message.fileName;
    }
    await load(currentXml);
  }
});

viewsEl.addEventListener("change", async () => {
  try {
    await viewer.openView(viewsEl.value);
    viewer.get("canvas").zoom("fit-viewport");
  } catch (error) {
    statusEl.textContent = String(error);
  }
});

document.getElementById("fit")?.addEventListener("click", () => {
  viewer.get("canvas").zoom("fit-viewport");
});
document.getElementById("zoomIn")?.addEventListener("click", () => {
  viewer.get("canvas").zoom(viewer.get("canvas").getZoom() * 1.15);
});
document.getElementById("zoomOut")?.addEventListener("click", () => {
  viewer.get("canvas").zoom(viewer.get("canvas").getZoom() / 1.15);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "0") {
    viewer.get("canvas").zoom("fit-viewport");
  }
  if (event.key === "+" || event.key === "=") {
    viewer.get("canvas").zoom(viewer.get("canvas").getZoom() * 1.15);
  }
  if (event.key === "-") {
    viewer.get("canvas").zoom(viewer.get("canvas").getZoom() / 1.15);
  }
});

async function load(xml: string) {
  statusEl.textContent = "Loading…";
  try {
    const result = await viewer.importXML(xml);
    const model = viewer.get("model");
    titleEl.textContent = model.name || titleEl.textContent;
    viewsEl.replaceChildren();
    for (const view of model.views) {
      const option = document.createElement("option");
      option.value = view.identifier;
      option.textContent = view.name;
      viewsEl.appendChild(option);
    }
    viewer.get("canvas").zoom("fit-viewport");
    statusEl.textContent = result.warnings.length
      ? `${result.warnings.length} warning(s)`
      : `${model.views.length} view(s)`;
    vscode?.postMessage({ type: "imported", warnings: result.warnings });
  } catch (error) {
    statusEl.textContent = String(error);
    vscode?.postMessage({ type: "error", message: String(error) });
  }
}

vscode?.postMessage({ type: "ready" });
