export { Viewer } from "./Viewer";
export { NavigatedViewer } from "./NavigatedViewer";
export { parseModel } from "./parser";
export { renderView } from "./renderer";
export { getElementNotation, getRelationshipNotation, normalizeRelationshipType } from "./notation";
export { unnestElementBoxes } from "./unnest";
export type { ArchiMateModel, ImportResult, ViewerOptions } from "./types";

import { NavigatedViewer } from "./NavigatedViewer";
import { Viewer } from "./Viewer";

const ArchiMateJS = Object.assign(NavigatedViewer, { Viewer, NavigatedViewer });
export default ArchiMateJS;
