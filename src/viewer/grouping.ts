import type { ArchiMateModel, DiagramNode, DiagramView } from "./types";

const PAD = 20;
const HEADER = 30;

/**
 * A Grouping is drawn as a box around its members, never as a box with arrows to them.
 *
 * - Element boxes drawn beside a Grouping and related to it are moved inside it, and the Grouping
 *   is resized to enclose them (members keep their position on the canvas).
 * - Connections between a Grouping and anything drawn inside it are hidden. They stay in the
 *   view so deleting a box still removes them from the file.
 *
 * Idempotent, so it is safe to run on every render.
 */
export function encloseGroupingMembers(view: DiagramView, model: ArchiMateModel): void {
  const isGrouping = (node: DiagramNode) =>
    Boolean(node.elementRef && model.elements.get(node.elementRef)?.type === "Grouping");

  const partners = new Map<string, string[]>();
  for (const conn of view.connections) {
    if (!conn.relationshipRef) {
      continue;
    }
    for (const [a, b] of [
      [conn.source, conn.target],
      [conn.target, conn.source]
    ]) {
      const list = partners.get(a) || [];
      list.push(b);
      partners.set(a, list);
    }
  }

  const enclose = (list: DiagramNode[]) => {
    const done = new Set<DiagramNode>();
    const visit = (group: DiagramNode) => {
      if (done.has(group)) {
        return;
      }
      done.add(group);
      const related = new Set(partners.get(group.identifier) || []);
      const members = list.filter((node) => node !== group && related.has(node.identifier) && node.elementRef);
      // Inner groupings first, so this one is sized around their final boxes.
      for (const member of members) {
        if (isGrouping(member)) {
          visit(member);
        }
      }
      const joining = members.filter((member) => list.includes(member));
      if (joining.length) {
        adopt(group, joining);
        for (const member of joining) {
          list.splice(list.indexOf(member), 1);
        }
      }
    };
    for (const node of [...list]) {
      if (isGrouping(node) && list.includes(node)) {
        visit(node);
      }
    }
    for (const node of list) {
      enclose(node.children);
    }
  };
  enclose(view.nodes);

  const inside = new Map<string, Set<string>>();
  const collect = (nodes: DiagramNode[], groupings: string[]) => {
    for (const node of nodes) {
      for (const group of groupings) {
        inside.get(group)!.add(node.identifier);
      }
      if (isGrouping(node)) {
        inside.set(node.identifier, new Set());
        collect(node.children, [...groupings, node.identifier]);
      } else {
        collect(node.children, groupings);
      }
    }
  };
  collect(view.nodes, []);
  for (const conn of view.connections) {
    conn.hidden =
      Boolean(conn.relationshipRef) &&
      (Boolean(inside.get(conn.source)?.has(conn.target)) || Boolean(inside.get(conn.target)?.has(conn.source)));
  }
}

/** Make `members` (siblings of `group`) its children, growing `group` to enclose them. */
function adopt(group: DiagramNode, members: DiagramNode[]) {
  const boxes = members.map((member) => ({ x: member.x, y: member.y, w: member.w, h: member.h }));
  if (group.children.length) {
    // Already an authored frame: keep what it covers.
    boxes.push({ x: group.x, y: group.y, w: group.w, h: group.h });
    for (const child of group.children) {
      boxes.push({ x: group.x + child.x, y: group.y + child.y, w: child.w, h: child.h });
    }
  }
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  const padded = group.children.length
    ? {
        x: Math.min(group.x, minX - PAD),
        y: Math.min(group.y, minY - HEADER),
        right: Math.max(group.x + group.w, maxX + PAD),
        bottom: Math.max(group.y + group.h, maxY + PAD)
      }
    : { x: minX - PAD, y: minY - HEADER, right: maxX + PAD, bottom: maxY + PAD };

  const shiftX = group.x - padded.x;
  const shiftY = group.y - padded.y;
  for (const child of group.children) {
    child.x += shiftX;
    child.y += shiftY;
  }
  group.x = padded.x;
  group.y = padded.y;
  group.w = padded.right - padded.x;
  group.h = padded.bottom - padded.y;
  for (const member of members) {
    member.x -= group.x;
    member.y -= group.y;
    group.children.push(member);
  }
}
