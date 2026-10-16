/**
 * Snap targets for dragged stacks. Connection points are measured once from
 * the DOM when a drag starts, in canvas coordinates (the same coordinates as
 * script x/y), so the snap preview can shift blocks without feedback loops.
 */
import type { DropTarget } from "../model/blocks.ts";

/** Height of the tab under each block; must match the 6px used in styles.css. */
export const TAB = 6;
export const SNAP_RADIUS = 32;

export interface ConnectionPoint {
  /** Which edge of the dragged stack connects here. */
  anchor: "top" | "bottom";
  x: number;
  y: number;
  target: DropTarget;
}

export function measureConnections(canvas: HTMLElement): ConnectionPoint[] {
  const origin = canvas.getBoundingClientRect();
  const points: ConnectionPoint[] = [];
  const rel = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: r.left - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top };
  };
  canvas.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
    const r = rel(el);
    // The next block's top edge sits on this block's tab.
    points.push({ anchor: "top", x: r.left, y: r.bottom - TAB, target: { kind: "after", blockId: el.dataset.blockId ?? "" } });
  });
  canvas.querySelectorAll<HTMLElement>("[data-c-inner]").forEach((el) => {
    const r = rel(el);
    points.push({ anchor: "top", x: r.left, y: r.top, target: { kind: "inside", blockId: el.dataset.cInner ?? "" } });
  });
  canvas.querySelectorAll<HTMLElement>("[data-script-id]").forEach((el) => {
    if (el.dataset.hatTop === "true") return;
    const r = rel(el);
    // The dragged stack's bottom would connect to this script's top.
    points.push({ anchor: "bottom", x: r.left, y: r.top, target: { kind: "before", scriptId: el.dataset.scriptId ?? "", y: 0 } });
  });
  return points;
}

export interface DragBox {
  left: number;
  top: number;
  height: number;
  /** Stacks that start with a hat block can only go above a script. */
  isHatStack: boolean;
}

/** Picks the nearest connection point for a stack whose top-left corner is at (left, top). */
export function findDropTarget(points: ConnectionPoint[], { left, top, height, isHatStack }: DragBox): DropTarget | null {
  let best: ConnectionPoint | null = null;
  let bestDistance = SNAP_RADIUS * SNAP_RADIUS;
  for (const point of points) {
    if (isHatStack && point.anchor !== "bottom") continue;
    const y = point.anchor === "top" ? top : top + height - TAB;
    const distance = (left - point.x) ** 2 + (y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  if (!best) return null;
  // The script's top moves up by the stack's height; never past the canvas edge.
  if (best.target.kind === "before") return { ...best.target, y: Math.max(8, Math.round(best.y - (height - TAB))) };
  return best.target;
}

export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "before" && b.kind === "before") return a.scriptId === b.scriptId && a.y === b.y;
  return a.kind !== "before" && b.kind !== "before" && a.blockId === b.blockId;
}
