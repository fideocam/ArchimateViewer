import { NavigatedViewer } from "./NavigatedViewer";
import { Viewer } from "./Viewer";

const ArchiMateJS = Object.assign(NavigatedViewer, {
  Viewer,
  NavigatedViewer
});

Object.assign(globalThis, { ArchiMateJS });

export {};
