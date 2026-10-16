/**
 * Stage geometry, using Scratch conventions: a 480x360 stage with (0, 0) in
 * the centre, y pointing up, and direction 90 meaning "facing right".
 */
import type { Sprite } from "../model/types.ts";

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;
const HALF_WIDTH = STAGE_WIDTH / 2;
const HALF_HEIGHT = STAGE_HEIGHT / 2;

/** Collision radius of a sprite, in stage units. */
export const SPRITE_RADIUS = 40;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Parses a block input; anything that is not a finite number counts as 0, like Scratch. */
export function toNumber(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Normalises a direction to Scratch's (-180, 180] range. */
export function wrapDirection(degrees: number): number {
  const wrapped = tidy(180 - ((((180 - degrees) % 360) + 360) % 360));
  // Rounding can turn a value just above -180 into -180, which this range writes as 180.
  return wrapped === -180 ? 180 : wrapped;
}

/** Keeps a sprite's centre on the stage. */
export const fenced = (x: number, y: number): { x: number; y: number } => ({
  x: tidy(clamp(x, -HALF_WIDTH, HALF_WIDTH)),
  y: tidy(clamp(y, -HALF_HEIGHT, HALF_HEIGHT)),
});

export function moveSteps(sprite: Sprite, steps: number): Sprite {
  const radians = (sprite.direction * Math.PI) / 180;
  return {
    ...sprite,
    ...fenced(sprite.x + steps * Math.sin(radians), sprite.y + steps * Math.cos(radians)),
  };
}

export const turnBy = (sprite: Sprite, degrees: number): Sprite => ({
  ...sprite,
  direction: wrapDirection(sprite.direction + degrees),
});

type Point = { x: number; y: number };

export const touches = (a: Point, b: Point): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 2 * SPRITE_RADIUS;

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Keys of every pair of sprites that currently overlap. */
export function touchingPairs(sprites: Sprite[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < sprites.length; i += 1) {
    for (let j = i + 1; j < sprites.length; j += 1) {
      if (touches(sprites[i], sprites[j])) pairs.push(pairKey(sprites[i].id, sprites[j].id));
    }
  }
  return pairs;
}
