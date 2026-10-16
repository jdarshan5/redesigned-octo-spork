import test from "node:test";
import assert from "node:assert/strict";
import type { BlockKind } from "../blocks/catalog.ts";
import { createBlock } from "../model/blocks.ts";
import { createHeroDemoProject, createScript, createSprite } from "../model/project.ts";
import type { AppState, Block, Sprite } from "../model/types.ts";
import { initState, reducer } from "../state/reducer.ts";
import { FRAME_MS } from "./runtime.ts";

const block = (kind: BlockKind, inputs?: Record<string, string>): Block => createBlock(kind, inputs);
const repeat = (times: number, body: Block[]): Block => ({ ...block("control_repeat", { TIMES: String(times) }), body });
const flag = () => block("event_whenflagclicked");
const move = (steps: number) => block("motion_movesteps", { STEPS: String(steps) });

function world(sprites: Sprite[], heroEnabled = true): AppState {
  return initState({ sprites, selectedId: sprites[0].id, heroEnabled });
}

/** Ticks until nothing runs (or the frame budget is spent). Returns the final state and frame count. */
function runToEnd(state: AppState, { start = 0, maxFrames = 2000 } = {}) {
  let next = state;
  let frames = 0;
  while (next.runtime.threads.length > 0 && frames < maxFrames) {
    next = reducer(next, { type: "tick", now: start + frames * FRAME_MS });
    frames += 1;
  }
  return { state: next, frames };
}

function spriteNamed(state: AppState, name: string): Sprite {
  const sprite = state.project.sprites.find((s) => s.name === name);
  if (!sprite) throw new Error(`no sprite named ${name}`);
  return sprite;
}

test("move, turn and go to follow Scratch's coordinate system", () => {
  const cat = createSprite({
    name: "Cat",
    scripts: [
      createScript(0, 0, [
        flag(),
        move(10),
        block("motion_turnright", { DEGREES: "90" }),
        move(20),
        block("motion_turnleft", { DEGREES: "450" }),
      ]),
    ],
  });
  const { state } = runToEnd(reducer(world([cat]), { type: "greenFlag" }));
  const after = spriteNamed(state, "Cat");
  assert.equal(after.x, 10);
  assert.equal(after.y, -20); // facing 180 (down) after the right turn
  assert.equal(after.direction, 90);

  const goto = createSprite({
    name: "Cat",
    scripts: [createScript(0, 0, [block("motion_gotoxy", { X: "999", Y: "-50" })])],
  });
  const fencedState = runToEnd(reducer(world([goto]), { type: "greenFlag" })).state;
  assert.deepEqual([spriteNamed(fencedState, "Cat").x, spriteNamed(fencedState, "Cat").y], [240, -50]);
});

test("repeat animates one iteration per frame", () => {
  const cat = createSprite({ name: "Cat", scripts: [createScript(0, 0, [flag(), repeat(5, [move(10)])])] });
  let state = reducer(world([cat]), { type: "greenFlag" });
  state = reducer(state, { type: "tick", now: 0 });
  assert.equal(spriteNamed(state, "Cat").x, 10);
  state = reducer(state, { type: "tick", now: FRAME_MS });
  assert.equal(spriteNamed(state, "Cat").x, 20);
  const done = runToEnd(state, { start: 2 * FRAME_MS }).state;
  assert.equal(spriteNamed(done, "Cat").x, 50);
  assert.equal(done.runtime.threads.length, 0);
});

test("nested and empty repeats terminate", () => {
  const cat = createSprite({
    name: "Cat",
    scripts: [createScript(0, 0, [repeat(3, [repeat(2, [move(1)]), repeat(4, [])])])],
  });
  const { state, frames } = runToEnd(reducer(world([cat]), { type: "greenFlag" }));
  assert.equal(spriteNamed(state, "Cat").x, 6);
  assert.ok(frames < 30);
});

test("say for N seconds shows a bubble and then clears it", () => {
  const cat = createSprite({
    name: "Cat",
    scripts: [createScript(0, 0, [flag(), block("looks_sayforsecs", { MESSAGE: "Hi", SECS: "1" })])],
  });
  let state = reducer(world([cat]), { type: "greenFlag" });
  state = reducer(state, { type: "tick", now: 0 });
  const bubble = state.runtime.bubbles[cat.id];
  assert.equal(bubble.kind, "say");
  assert.equal(bubble.text, "Hi");
  state = reducer(state, { type: "tick", now: 900 });
  assert.ok(state.runtime.bubbles[cat.id], "bubble is still visible before the time is up");
  state = reducer(state, { type: "tick", now: 1001 });
  assert.equal(state.runtime.bubbles[cat.id], undefined);
  assert.equal(state.runtime.threads.length, 0);
});

test("think for N seconds uses a thought bubble", () => {
  const cat = createSprite({
    name: "Cat",
    scripts: [createScript(0, 0, [block("looks_thinkforsecs", { MESSAGE: "Hmm", SECS: "2" })])],
  });
  const state = reducer(reducer(world([cat]), { type: "greenFlag" }), { type: "tick", now: 0 });
  assert.equal(state.runtime.bubbles[cat.id].kind, "think");
});

test("play starts flag scripts and hat-less scripts on every sprite, but not click scripts", () => {
  const a = createSprite({ name: "A", scripts: [createScript(0, 0, [flag(), move(10)])] });
  const b = createSprite({ name: "B", y: 100, scripts: [createScript(0, 0, [move(5)])] });
  const c = createSprite({
    name: "C",
    y: -100,
    scripts: [createScript(0, 0, [block("event_whenthisspriteclicked"), move(7)])],
  });
  const { state } = runToEnd(reducer(world([a, b, c]), { type: "greenFlag" }));
  assert.deepEqual(state.project.sprites.map((s) => s.x), [10, 5, 0]);

  const clicked = runToEnd(reducer(state, { type: "spriteClicked", spriteId: c.id })).state;
  assert.equal(spriteNamed(clicked, "C").x, 7);
});

test("clicking a running script stops it", () => {
  const cat = createSprite({ name: "Cat", scripts: [createScript(0, 0, [repeat(100, [move(1)])])] });
  const script = cat.scripts[0];
  let state = reducer(world([cat]), { type: "toggleScript", spriteId: cat.id, scriptId: script.id, blocks: script.blocks });
  state = reducer(state, { type: "tick", now: 0 });
  state = reducer(state, { type: "toggleScript", spriteId: cat.id, scriptId: script.id, blocks: script.blocks });
  assert.equal(state.runtime.threads.length, 0);
  assert.equal(spriteNamed(state, "Cat").x, 1);
});

test("stop ends every thread and takes bubbles down", () => {
  const cat = createSprite({
    name: "Cat",
    scripts: [createScript(0, 0, [block("looks_sayforsecs", { MESSAGE: "Hi", SECS: "5" })])],
  });
  let state = reducer(reducer(world([cat]), { type: "greenFlag" }), { type: "tick", now: 0 });
  assert.ok(state.runtime.bubbles[cat.id]);
  state = reducer(state, { type: "stopAll" });
  assert.equal(state.runtime.threads.length, 0);
  assert.deepEqual(state.runtime.bubbles, {});
});

test("removing a sprite drops its threads and keeps a sprite selected", () => {
  const a = createSprite({ name: "A", scripts: [createScript(0, 0, [repeat(10, [move(1)])])] });
  const b = createSprite({ name: "B", x: 150 });
  let state = reducer(world([a, b]), { type: "greenFlag" });
  state = reducer(state, { type: "removeSprite", spriteId: a.id });
  assert.deepEqual(state.project.sprites.map((s) => s.name), ["B"]);
  assert.equal(state.project.selectedId, b.id);
  assert.equal(state.runtime.threads.length, 0);
  assert.equal(reducer(state, { type: "removeSprite", spriteId: b.id }), state, "the last sprite stays");
});

test("updateSprite keeps sprites on the stage and names non-empty", () => {
  const cat = createSprite({ name: "Cat" });
  let state = reducer(world([cat]), { type: "updateSprite", spriteId: cat.id, patch: { x: 900, direction: 270 } });
  assert.equal(spriteNamed(state, "Cat").x, 240);
  assert.equal(spriteNamed(state, "Cat").direction, -90);
  state = reducer(state, { type: "updateSprite", spriteId: cat.id, patch: { name: "   " } });
  assert.equal(state.project.sprites[0].name, "Cat");
});

function heroWorld(heroEnabled: boolean): AppState {
  const cat1 = createSprite({ name: "Cat 1", x: -100, scripts: [createScript(0, 0, [flag(), repeat(30, [move(10)])])] });
  const cat2 = createSprite({ name: "Cat 2", x: 100, scripts: [createScript(0, 0, [flag(), repeat(30, [move(-10)])])] });
  return reducer(world([cat1, cat2], heroEnabled), { type: "greenFlag" });
}

test("hero feature: colliding sprites swap animations and bounce apart", () => {
  const { state } = runToEnd(heroWorld(true));
  const cat1 = spriteNamed(state, "Cat 1");
  const cat2 = spriteNamed(state, "Cat 2");

  // They met in the middle, swapped, then walked back to the stage edges.
  assert.equal(cat1.x, -240);
  assert.equal(cat2.x, 240);
  assert.equal(state.runtime.swaps.length, 1);
  assert.deepEqual([state.runtime.swaps[0].a, state.runtime.swaps[0].b].sort(), [cat1.id, cat2.id].sort());

  // The scripts traded places too, so the editor shows the swap.
  assert.equal(cat1.scripts[0].blocks[1].body?.[0].inputs.STEPS, "-10");
  assert.equal(cat2.scripts[0].blocks[1].body?.[0].inputs.STEPS, "10");
});

test("hero feature: the swap happens mid-animation and only once per contact", () => {
  let state = heroWorld(true);
  const xs: number[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    state = reducer(state, { type: "tick", now: frame * FRAME_MS });
    xs.push(spriteNamed(state, "Cat 1").x);
  }
  // Moves right until they touch (distance < 80), then reverses.
  assert.deepEqual(xs.slice(0, 8), [-90, -80, -70, -60, -50, -40, -30, -40]);
  assert.equal(state.runtime.swaps.length, 1);
});

test("hero feature can be switched off", () => {
  const { state } = runToEnd(heroWorld(false));
  assert.equal(spriteNamed(state, "Cat 1").x, 200);
  assert.equal(spriteNamed(state, "Cat 2").x, -200);
  assert.equal(state.runtime.swaps.length, 0);
});

test("sprites that already overlap when play is pressed do not swap", () => {
  const a = createSprite({ name: "A", scripts: [createScript(0, 0, [repeat(3, [move(1)])])] });
  const b = createSprite({ name: "B", x: 10, scripts: [] });
  const { state } = runToEnd(reducer(world([a, b]), { type: "greenFlag" }));
  assert.equal(state.runtime.swaps.length, 0);
  assert.equal(spriteNamed(state, "A").scripts.length, 1);

  // The same holds when a script is started by clicking it.
  const script = a.scripts[0];
  const clicked = runToEnd(reducer(world([a, b]), { type: "toggleScript", spriteId: a.id, scriptId: script.id, blocks: script.blocks }));
  assert.equal(clicked.state.runtime.swaps.length, 0);
});

test("a sprite added on top of a running sprite does not swap with it", () => {
  const walker = createSprite({ name: "Walker", scripts: [createScript(0, 0, [repeat(5, [move(1)])])] });
  let state = reducer(reducer(world([walker]), { type: "greenFlag" }), { type: "tick", now: 0 });
  state = reducer(state, { type: "addSprite", sprite: createSprite({ name: "New", x: 20 }) });
  const { state: done } = runToEnd(state, { start: FRAME_MS });
  assert.equal(done.runtime.swaps.length, 0);
  assert.equal(spriteNamed(done, "Walker").scripts.length, 1);
  assert.equal(spriteNamed(done, "Walker").x, 5);
});

test("a swap hands a speech bubble over with the animation", () => {
  const talker = createSprite({
    name: "Talker",
    x: -60,
    scripts: [createScript(0, 0, [move(25), block("looks_sayforsecs", { MESSAGE: "Hey", SECS: "1" })])],
  });
  const other = createSprite({ name: "Other", x: 60, scripts: [] });
  let state = reducer(world([talker, other]), { type: "greenFlag" });
  state = reducer(state, { type: "tick", now: 0 }); // distance 95, no contact
  state = reducer(state, { type: "tick", now: FRAME_MS }); // says "Hey"
  assert.ok(state.runtime.bubbles[talker.id]);

  // Nudge Other into contact while the bubble is up; the next tick swaps.
  state = reducer(state, { type: "updateSprite", spriteId: other.id, patch: { x: 0 } });
  state = reducer(state, { type: "tick", now: 2 * FRAME_MS });
  assert.equal(state.runtime.bubbles[talker.id], undefined);
  assert.equal(state.runtime.bubbles[other.id].text, "Hey");
  state = reducer(state, { type: "tick", now: 1100 });
  assert.equal(state.runtime.bubbles[other.id], undefined, "the new owner's thread clears it on time");
});

test("the hero demo project plays out the example from the brief", () => {
  const { state } = runToEnd(reducer(initState(createHeroDemoProject()), { type: "greenFlag" }));
  assert.equal(state.runtime.swaps.length, 1);
  const [first, second] = state.project.sprites;
  assert.ok(first.x < -150, "Sprite1 walked back past where it started");
  assert.ok(second.x > 150, "Sprite2 walked back past where it started");
});
