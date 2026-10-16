import test from "node:test";
import assert from "node:assert/strict";
import { findDropTarget, sameTarget, SNAP_RADIUS, TAB, type ConnectionPoint } from "./hitTest.ts";

// One script at (100, 100): a 40px-high block "a" with a repeat "loop" below it, plus a loose script "s2".
const points: ConnectionPoint[] = [
  { anchor: "top", x: 100, y: 100 + 40 - TAB, target: { kind: "after", blockId: "a" } },
  { anchor: "top", x: 100, y: 200 - TAB, target: { kind: "after", blockId: "loop" } },
  { anchor: "top", x: 116, y: 180, target: { kind: "inside", blockId: "loop" } },
  { anchor: "bottom", x: 300, y: 300, target: { kind: "before", scriptId: "s2", y: 0 } },
];
const box = (left: number, top: number, height = 40, isHatStack = false) => ({ left, top, height, isHatStack });

test("a stack snaps to the nearest connection within the snap radius", () => {
  assert.deepEqual(findDropTarget(points, box(104, 136)), { kind: "after", blockId: "a" });
  assert.deepEqual(findDropTarget(points, box(118, 182)), { kind: "inside", blockId: "loop" });
  assert.deepEqual(findDropTarget(points, box(98, 196)), { kind: "after", blockId: "loop" });
  assert.equal(findDropTarget(points, box(100 + SNAP_RADIUS, 134)), null, "the radius is exclusive");
  assert.equal(findDropTarget(points, box(600, 600)), null);
  assert.equal(findDropTarget([], box(0, 0)), null);
});

test("dropping above a script lines the stack's bottom up with the script's top", () => {
  // A 60px stack whose bottom tab sits on the script's top edge.
  const target = findDropTarget(points, box(302, 300 - 60 + TAB, 60));
  assert.deepEqual(target, { kind: "before", scriptId: "s2", y: 300 - (60 - TAB) });
  // A tall stack would push the script above the canvas; it stops at the edge instead.
  const tall = findDropTarget([{ ...points[3], y: 20 }], box(300, 20 - 200 + TAB, 200));
  assert.deepEqual(tall, { kind: "before", scriptId: "s2", y: 8 });
});

test("a stack that starts with a hat block only goes on top of a script", () => {
  assert.equal(findDropTarget(points, box(104, 136, 40, true)), null, "hats never go under a block");
  assert.equal(findDropTarget(points, box(118, 182, 40, true)), null, "or inside a repeat");
  assert.equal(findDropTarget(points, box(300, 300 - 40 + TAB, 40, true))?.kind, "before");
});

test("sameTarget compares targets by value", () => {
  assert.ok(sameTarget(null, null));
  assert.ok(sameTarget({ kind: "after", blockId: "a" }, { kind: "after", blockId: "a" }));
  assert.ok(!sameTarget({ kind: "after", blockId: "a" }, { kind: "inside", blockId: "a" }));
  assert.ok(!sameTarget({ kind: "after", blockId: "a" }, null));
  assert.ok(sameTarget({ kind: "before", scriptId: "s", y: 4 }, { kind: "before", scriptId: "s", y: 4 }));
  assert.ok(!sameTarget({ kind: "before", scriptId: "s", y: 4 }, { kind: "before", scriptId: "s", y: 5 }));
});
