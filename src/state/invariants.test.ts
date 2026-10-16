/**
 * Property test: drives the reducer with long, seeded random sequences of
 * everything the UI can dispatch (play, ticks, clicks, drags, deletes, sprite
 * edits, hero toggles) and checks the invariants that must always hold.
 * A failure names the seed and step, so it can be replayed exactly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BLOCK_SPECS, type BlockKind } from "../blocks/catalog.ts";
import { applyDrop, createBlock, deleteBlock, detachStack, setInput, type DropTarget } from "../model/blocks.ts";
import { createScript, createSprite } from "../model/project.ts";
import type { AppState, Block, Script } from "../model/types.ts";
import { FRAME_MS } from "../engine/runtime.ts";
import { initState, reducer, type Action } from "./reducer.ts";

const SEEDS = 120;
const STEPS = 300;

/** mulberry32: a tiny deterministic PRNG. */
function random(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  return { next, pick };
}
type Random = ReturnType<typeof random>;

const NUMBERS = ["10", "-10", "0", "", "-", ".", "2.5", "45", "-450", "999", "0.01", "3"];
const STACK_KINDS: BlockKind[] = [
  "motion_movesteps",
  "motion_turnright",
  "motion_turnleft",
  "motion_gotoxy",
  "looks_sayforsecs",
  "looks_thinkforsecs",
  "control_repeat",
];

const flatten = (blocks: Block[]): Block[] => blocks.flatMap((b) => [b, ...flatten(b.body ?? [])]);

function randomBlock(r: Random, depth: number): Block {
  const kind = r.pick(STACK_KINDS);
  const inputs: Record<string, string> = {};
  for (const name of Object.keys(BLOCK_SPECS[kind].defaults)) inputs[name] = name === "MESSAGE" ? r.pick(["", "hi"]) : r.pick(NUMBERS);
  if (kind === "looks_sayforsecs" || kind === "looks_thinkforsecs") inputs.SECS = r.pick(["0.1", "0.5", "", "-1"]);
  if (kind === "control_repeat") {
    inputs.TIMES = String(Math.floor(r.next() * 6));
    const body = depth < 2 ? Array.from({ length: Math.floor(r.next() * 3) }, () => randomBlock(r, depth + 1)) : [];
    return { ...createBlock(kind, inputs), body };
  }
  return createBlock(kind, inputs);
}

function randomScript(r: Random): Script {
  const hat = r.pick<BlockKind | null>(["event_whenflagclicked", "event_whenthisspriteclicked", null, null]);
  const blocks = Array.from({ length: 1 + Math.floor(r.next() * 4) }, () => randomBlock(r, 0));
  return createScript(Math.floor(r.next() * 300), Math.floor(r.next() * 300), hat ? [createBlock(hat), ...blocks] : blocks);
}

/** A drag in the code area: take a block's stack and drop it somewhere, or delete or edit a block. */
function randomEdit(r: Random, scripts: Script[]): (scripts: Script[]) => Script[] {
  const blocks = flatten(scripts.flatMap((s) => s.blocks));
  if (blocks.length === 0) return (list) => [...list, randomScript(r)];
  const block = r.pick(blocks);
  const roll = r.next();
  if (roll < 0.15) return (list) => deleteBlock(list, block.id);
  if (roll < 0.25) return (list) => setInput(list, block.id, Object.keys(block.inputs)[0] ?? "X", r.pick(NUMBERS));
  return (list) => {
    const detached = detachStack(list, block.id);
    if (!detached) return list;
    const { scripts: rest, stack, scriptId } = detached;
    if (roll < 0.35) return rest; // dropped on the palette
    const isHatStack = BLOCK_SPECS[stack[0].kind].shape === "hat";
    const others = flatten(rest.flatMap((s) => s.blocks));
    const options: DropTarget[] = [];
    if (!isHatStack) {
      for (const b of others) options.push(b.body ? { kind: "inside", blockId: b.id } : { kind: "after", blockId: b.id });
    }
    for (const s of rest) {
      if (BLOCK_SPECS[s.blocks[0].kind].shape !== "hat") options.push({ kind: "before", scriptId: s.id, y: 8 });
    }
    if (options.length > 0 && roll < 0.8) return applyDrop(rest, r.pick(options), stack);
    return [...rest, { id: scriptId ?? `loose-${blocks.length}-${roll}`, x: 8, y: 8, blocks: stack }];
  };
}

function randomAction(r: Random, state: AppState, now: number): Action {
  const { sprites } = state.project;
  const sprite = r.pick(sprites);
  const roll = r.next();
  if (roll < 0.45) return { type: "tick", now };
  if (roll < 0.5) return { type: "greenFlag" };
  if (roll < 0.53) return { type: "stopAll" };
  if (roll < 0.58) return { type: "spriteClicked", spriteId: sprite.id };
  if (roll < 0.64 && sprite.scripts.length > 0) {
    const script = r.pick(sprite.scripts);
    return { type: "toggleScript", spriteId: sprite.id, scriptId: script.id, blocks: script.blocks };
  }
  if (roll < 0.67) {
    const kind = r.pick(STACK_KINDS);
    return { type: "toggleScript", spriteId: sprite.id, scriptId: `palette:${kind}`, blocks: [createBlock(kind)] };
  }
  if (roll < 0.71) {
    return { type: "updateSprite", spriteId: sprite.id, patch: { x: r.next() * 600 - 300, y: r.next() * 400 - 200 } };
  }
  if (roll < 0.73) {
    return { type: "updateSprite", spriteId: sprite.id, patch: { direction: r.next() * 2000 - 1000, name: r.pick(["  ", "Cat"]) } };
  }
  if (roll < 0.76 && sprites.length < 6) {
    return { type: "addSprite", sprite: createSprite({ name: "New", x: r.next() * 400 - 200, scripts: [randomScript(r)] }) };
  }
  if (roll < 0.78) return { type: "removeSprite", spriteId: sprite.id };
  if (roll < 0.8) return { type: "setHeroEnabled", enabled: r.next() < 0.7 };
  if (roll < 0.83) return { type: "selectSprite", spriteId: sprite.id };
  return { type: "editScripts", spriteId: sprite.id, edit: randomEdit(r, sprite.scripts) };
}

function checkInvariants(state: AppState) {
  const { project, runtime } = state;
  const spriteIds = new Set(project.sprites.map((s) => s.id));
  assert.ok(spriteIds.has(project.selectedId), "the selected sprite exists");

  for (const s of project.sprites) {
    assert.ok(s.x >= -240 && s.x <= 240 && s.y >= -180 && s.y <= 180, `${s.name} is on the stage at ${s.x}, ${s.y}`);
    assert.ok(s.direction > -180 && s.direction <= 180, `direction ${s.direction} is in (-180, 180]`);
    assert.notEqual(s.name.trim(), "", "names are never blank");
    assert.ok(s.scripts.every((script) => script.blocks.length > 0), "empty scripts are removed");
  }
  const scriptIds = project.sprites.flatMap((s) => s.scripts.map((script) => script.id));
  assert.equal(new Set(scriptIds).size, scriptIds.length, "script ids are unique");
  const blockIds = project.sprites.flatMap((s) => flatten(s.scripts.flatMap((script) => script.blocks)).map((b) => b.id));
  assert.equal(new Set(blockIds).size, blockIds.length, "block ids are unique");

  const threadKeys = runtime.threads.map((t) => `${t.spriteId}/${t.scriptId}`);
  assert.equal(new Set(threadKeys).size, threadKeys.length, "a script runs at most once per sprite");
  assert.ok(runtime.threads.every((t) => spriteIds.has(t.spriteId)), "threads belong to existing sprites");
  for (const [spriteId, bubble] of Object.entries(runtime.bubbles)) {
    const owner = runtime.threads.some((t) => t.spriteId === spriteId && t.bubbleToken === bubble.token);
    assert.ok(owner, "every bubble is owned by a running thread, which will take it down");
  }
  for (const key of runtime.touching) {
    assert.ok(key.split("|").every((id) => spriteIds.has(id)), "touching pairs refer to existing sprites");
  }
}

test("random sessions never break the editor's invariants", () => {
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const r = random(seed);
    const sprites = Array.from({ length: 1 + Math.floor(r.next() * 4) }, (_, i) =>
      createSprite({
        name: `Sprite${i + 1}`,
        x: r.next() * 300 - 150,
        y: r.next() * 200 - 100,
        scripts: Array.from({ length: 1 + Math.floor(r.next() * 3) }, () => randomScript(r)),
      })
    );
    let state = initState({ sprites, selectedId: sprites[0].id, heroEnabled: true });
    let now = 0;
    const history: string[] = [];
    for (let step = 0; step < STEPS; step += 1) {
      now += FRAME_MS * (r.next() < 0.05 ? 30 : 1);
      const action = randomAction(r, state, now);
      history.push(action.type);
      state = reducer(state, action);
      try {
        checkInvariants(state);
      } catch (error) {
        throw new Error(`seed ${seed}, step ${step} (${history.slice(-6).join(" → ")}): ${(error as Error).message}`);
      }
    }
  }
});
