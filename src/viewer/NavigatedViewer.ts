import { Viewer } from "./Viewer";

export class NavigatedViewer extends Viewer {
  protected canvasNavigable() {
    return true;
  }
}
