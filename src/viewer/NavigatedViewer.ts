import { Canvas } from "./canvas";
import { Viewer } from "./Viewer";

export class NavigatedViewer extends Viewer {
  protected createCanvas(container: HTMLElement): Canvas {
    return new Canvas(container, { navigable: true });
  }
}
