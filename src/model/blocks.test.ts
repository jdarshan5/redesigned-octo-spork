import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDrop,
  arrangeScripts,
  cloneStack,
  createBlock,
  deleteBlock,
  detachStack,
  findScript,
  freeSpot,
  setInput,
  stackFrom,
} from "./blocks.ts";
import type { Block, Script } from "./types.ts";

const ids = (blocks: Block[]) => blocks.map((b) => b.id);

function fixture(): Script[] {
  const hat: Block = { id: "hat", kind: "event_whenflagclicked", inputs: {} };
  const a: Block = { id: "a", kind: "motion_movesteps", inputs: { STEPS: "10" } };
  const inner1: Block = { id: "i1", kind: "motion_turnright", inputs: { DEGREES: "15" } };
  const inner2: Block = { id: "i2", kind: "motion_movesteps", inputs: { STEPS: "5" } };
  const loop: Block = { id: "loop", kind: "control_repeat", inputs: { TIMES: "10" }, body: [inner1, inner2] };
  const b: Block = { id: "b", kind: "looks_sayforsecs", inputs: { MESSAGE: "Hi", SECS: "2" } };
  const lone: Block = { id: "lone", kind: "motion_gotoxy", inputs: { X: "0", Y: "0" } };
  return [
    { id: "s1", x: 10, y: 10, blocks: [hat, a, loop, b] },
    { id: "s2", x: 300, y: 10, blocks: [lone] },
  ];
}

const body = (block: Block): Block[] => block.body ?? [];

test("createBlock fills defaults and gives C-blocks an empty body", () => {
  const repeat = createBlock("control_repeat");
  assert.deepEqual(repeat.inputs, { TIMES: "10" });
  assert.deepEqual(repeat.body, []);
  assert.equal(createBlock("motion_movesteps", { STEPS: "3" }).inputs.STEPS, "3");
  assert.equal("body" in createBlock("motion_movesteps"), false);
});

test("detaching a middle block takes everything below it", () => {
  const scripts = fixture();
  const detached = detachStack(scripts, "a");
  assert.ok(detached);
  assert.deepEqual(ids(detached.stack), ["a", "loop", "b"]);
  assert.deepEqual(ids(detached.scripts[0].blocks), ["hat"]);
  assert.deepEqual(ids(scripts[0].blocks), ["hat", "a", "loop", "b"], "input is not mutated");
});

test("detaching the top block removes the whole script", () => {
  const detached = detachStack(fixture(), "hat");
  assert.ok(detached);
  assert.equal(detached.stack.length, 4);
  assert.deepEqual(detached.scripts.map((s) => s.id), ["s2"]);
  assert.deepEqual(detached.origin, { x: 10, y: 10 });
  assert.equal(detached.scriptId, "s1", "moving a whole script keeps its id");
  assert.equal(detachStack(fixture(), "a")?.scriptId, null, "a partial stack becomes a new script");
});

test("detaching from inside a C-block splits its body", () => {
  const detached = detachStack(fixture(), "i2");
  assert.ok(detached);
  assert.deepEqual(ids(detached.stack), ["i2"]);
  assert.deepEqual(ids(body(detached.scripts[0].blocks[2])), ["i1"]);
  assert.equal(detachStack(fixture(), "missing"), null);
});

test("drop after, inside and before", () => {
  const extra: Block[] = [{ id: "x", kind: "motion_movesteps", inputs: { STEPS: "1" } }];
  const after = applyDrop(fixture(), { kind: "after", blockId: "a" }, extra);
  assert.deepEqual(ids(after[0].blocks), ["hat", "a", "x", "loop", "b"]);

  const nestedAfter = applyDrop(fixture(), { kind: "after", blockId: "i2" }, extra);
  assert.deepEqual(ids(body(nestedAfter[0].blocks[2])), ["i1", "i2", "x"]);

  const inside = applyDrop(fixture(), { kind: "inside", blockId: "loop" }, extra);
  assert.deepEqual(ids(body(inside[0].blocks[2])), ["x", "i1", "i2"]);

  const before = applyDrop(fixture(), { kind: "before", scriptId: "s2", y: -30 }, extra);
  assert.deepEqual(ids(before[1].blocks), ["x", "lone"]);
  assert.equal(before[1].y, -30);
});

test("deleteBlock removes one block and closes the gap", () => {
  assert.deepEqual(ids(deleteBlock(fixture(), "a")[0].blocks), ["hat", "loop", "b"]);
  assert.deepEqual(ids(deleteBlock(fixture(), "loop")[0].blocks), ["hat", "a", "b"]);
  assert.deepEqual(ids(body(deleteBlock(fixture(), "i1")[0].blocks[2])), ["i2"]);
  assert.deepEqual(deleteBlock(fixture(), "lone").map((s) => s.id), ["s1"], "an emptied script disappears");
});

test("arrangeScripts lines scripts up in reading order", () => {
  const scripts: Script[] = [
    { id: "low", x: 300, y: 200, blocks: [] },
    { id: "high", x: 50, y: 10, blocks: [] },
    { id: "mid", x: 10, y: 120, blocks: [] },
  ];
  const heights: Record<string, number> = { high: 100, mid: 40, low: 60 };
  const arranged = arrangeScripts(scripts, (s) => heights[s.id], { x: 20, y: 20, gap: 10 });
  assert.deepEqual(arranged.map((s) => s.id), ["low", "high", "mid"], "array order is kept");
  assert.deepEqual(arranged.map((s) => [s.x, s.y]), [[20, 180], [20, 20], [20, 130]]);
});

test("freeSpot cascades copies past scripts that already start there", () => {
  const at = (x: number, y: number): Script => ({ id: `${x},${y}`, x, y, blocks: [] });
  assert.deepEqual(freeSpot([], 40, 40), { x: 40, y: 40 });
  assert.deepEqual(freeSpot([at(40, 40)], 40, 40), { x: 72, y: 72 });
  assert.deepEqual(freeSpot([at(40, 40), at(72, 72), at(200, 10)], 40, 40), { x: 104, y: 104 });
  assert.deepEqual(freeSpot([at(41, 40)], 40, 40), { x: 40, y: 40 }, "only an exact match hides a copy");
});

test("setInput, findScript, stackFrom and cloneStack", () => {
  const scripts = fixture();
  const edited = setInput(scripts, "i2", "STEPS", "42");
  assert.equal(body(edited[0].blocks[2])[1].inputs.STEPS, "42");
  assert.equal(edited[1], scripts[1], "untouched scripts keep their identity");

  assert.equal(findScript(fixture(), "i1")?.id, "s1");
  assert.equal(findScript(fixture(), "missing"), null);
  assert.deepEqual(ids(stackFrom(fixture(), "loop")), ["loop", "b"]);
  assert.deepEqual(stackFrom(fixture(), "missing"), []);

  const copy = cloneStack(fixture()[0].blocks);
  assert.notEqual(copy[2].id, "loop");
  assert.notEqual(body(copy[2])[0].id, "i1");
  assert.equal(body(copy[2])[0].kind, "motion_turnright");
});
