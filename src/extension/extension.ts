import * as vscode from "vscode";
import { ArchimateEditorProvider } from "./editorProvider";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(ArchimateEditorProvider.register(context));
  context.subscriptions.push(
    vscode.commands.registerCommand("archimate.openViewer", async (uri?: vscode.Uri) => {
      const target = uri || vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showInformationMessage("Open an ArchiMate exchange XML file first.");
        return;
      }
      await vscode.commands.executeCommand("vscode.openWith", target, ArchimateEditorProvider.viewType);
    })
  );
}

export function deactivate() {}
