import * as vscode from "vscode";
import { getNonce, looksLikeArchimate } from "./util";

export class ArchimateEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "archimate.viewer";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ArchimateEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(ArchimateEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    });
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "out")]
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    const update = () => {
      webviewPanel.webview.postMessage({
        type: "init",
        text: document.getText(),
        fileName: document.uri.path.split("/").pop()
      });
    };

    const change = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        update();
      }
    });
    webviewPanel.onDidDispose(() => change.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "apply" && typeof message.text === "string") {
        const edit = new vscode.WorkspaceEdit();
        const end = document.positionAt(document.getText().length);
        edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), end), message.text);
        await vscode.workspace.applyEdit(edit);
        return;
      }
      if (message.type === "ready") {
        if (!looksLikeArchimate(document.getText())) {
          webviewPanel.webview.postMessage({
            type: "error",
            message:
              "This file does not look like an Open Group ArchiMate Model Exchange XML document. Use Open With… to switch back to the text editor."
          });
          return;
        }
        update();
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "webview", "editor.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "webview", "editor.css")
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>ArchiMate Viewer</title>
</head>
<body>
  <div id="toolbar">
    <div class="title" id="title">ArchiMate Viewer</div>
    <label>View
      <select id="views"></select>
    </label>
    <button type="button" id="fit" title="Fit diagram">Fit</button>
    <button type="button" id="zoomOut" title="Zoom out">−</button>
    <button type="button" id="zoomIn" title="Zoom in">+</button>
    <span id="status"></span>
  </div>
  <div id="canvas"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
