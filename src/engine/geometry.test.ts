import test from "node:test";
import assert from "node:assert/strict";
import { createSprite } from "../model/project.ts";
import { fenced, moveSteps, pairKey, SPRITE_RADIUS, toNumber, touches, touchingPairs, turnBy, wrapDirection } from "./geometry.ts";

test("toNumber reads inputs the way Scratch does", () => {
  assert.equal(toNumber("12.5"), 12.5);
  assert.equal(toNumber(" -3 "), -3);
  assert.equal(toNumber(7), 7);
  for (const junk of ["", "-", ".", "abc", "Infinity", undefined]) assert.equal(toNumber(junk), 0, `${junk}`);
});

test("wrapDirection keeps directions in (-180, 180]", () => {
  const cases: [number, number][] = [
    [90, 90],
    [180, 180],
    [-180, 180],
    [181, -179],
    [270, -90],
    [-270, 90],
    [540, 180],
    [-720, 0],
    [180.5, -179.5],
    [-179.5, -179.5],
    [359.9, -0.1],
  ];
  for (const [input, expected] of cases) assert.equal(wrapDirection(input), expected, `${input}`);
  for (let degrees = -1000; degrees <= 1000; degrees += 0.37) {
    const wrapped = wrapDirection(degrees);
    assert.ok(wrapped > -180 && wrapped <= 180, `${degrees} -> ${wrapped}`);
  }
});

test("turning by fractions does not pile up floating-point noise", () => {
  let sprite = createSprite({ name: "Cat" });
  for (let i = 0; i < 10; i += 1) sprite = turnBy(sprite, 0.1);
  assert.equal(sprite.direction, 91);
  assert.equal(turnBy(createSprite({ name: "Cat", direction: 179.9 }), 0.2).direction, -179.9);
});

test("moveSteps follows the heading: 0 is up, 90 is right", () => {
  const at = (direction: number, steps: number) => {
    const { x, y } = moveSteps(createSprite({ name: "Cat", direction }), steps);
    return [x + 0, y + 0]; // -0 and 0 are the same position
  };
  assert.deepEqual(at(90, 10), [10, 0]);
  assert.deepEqual(at(0, 10), [0, 10]);
  assert.deepEqual(at(180, 10), [0, -10]);
  assert.deepEqual(at(-90, 10), [-10, 0]);
  assert.deepEqual(at(90, -10), [-10, 0]);
  const [x, y] = at(45, 10);
  assert.ok(Math.abs(x - y) < 1e-9 && Math.abs(x - 7.071068) < 1e-6);
});

test("fenced keeps a sprite's centre on the stage", () => {
  assert.deepEqual(fenced(1000, -1000), { x: 240, y: -180 });
  assert.deepEqual(fenced(-240, 180), { x: -240, y: 180 });
  assert.equal(moveSteps(createSprite({ name: "Cat", x: 235 }), 50).x, 240);
});

test("sprites touch when their centres are closer than two radii", () => {
  const limit = 2 * SPRITE_RADIUS;
  assert.equal(touches({ x: 0, y: 0 }, { x: limit, y: 0 }), false, "exactly two radii apart is not touching");
  assert.equal(touches({ x: 0, y: 0 }, { x: limit - 0.01, y: 0 }), true);
  assert.equal(touches({ x: 0, y: 0 }, { x: 50, y: 50 }), true);

  const a = createSprite({ name: "A", x: 0 });
  const b = createSprite({ name: "B", x: 60 });
  const c = createSprite({ name: "C", x: 200 });
  assert.deepEqual(touchingPairs([a, b, c]), [pairKey(a.id, b.id)]);
  assert.equal(pairKey(a.id, b.id), pairKey(b.id, a.id), "pair keys do not depend on order");
});
