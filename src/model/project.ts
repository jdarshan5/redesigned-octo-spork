import { createBlock } from "./blocks.ts";
import { uid } from "./ids.ts";
import type { Block, Project, Script, Sprite } from "./types.ts";

export interface SpriteInit {
  name: string;
  x?: number;
  y?: number;
  direction?: number;
  hue?: number;
  scripts?: Script[];
}

export function createSprite({ name, x = 0, y = 0, direction = 90, hue = 0, scripts = [] }: SpriteInit): Sprite {
  return { id: uid("sprite"), name, x, y, direction, hue, scripts };
}

/** Costume tints, as hue rotations of the orange cat: orange, blue, pink, green, violet, red. */
export const SPRITE_HUES = [0, 180, 285, 105, 230, 330];

/** The first tint no sprite uses yet, so sprites are easy to tell apart on the stage. */
export function nextSpriteHue(sprites: Sprite[]): number {
  const used = new Set(sprites.map((s) => s.hue));
  return SPRITE_HUES.find((hue) => !used.has(hue)) ?? SPRITE_HUES[sprites.length % SPRITE_HUES.length];
}

export const createScript = (x: number, y: number, blocks: Block[]): Script => ({ id: uid("script"), x, y, blocks });

/** Scratch-style default names: Sprite1, Sprite2, ... */
export function nextSpriteName(sprites: Sprite[]): string {
  let n = sprites.length + 1;
  while (sprites.some((s) => s.name === `Sprite${n}`)) n += 1;
  return `Sprite${n}`;
}

export function createInitialProject(): Project {
  const sprite = createSprite({ name: "Sprite1" });
  return { sprites: [sprite], selectedId: sprite.id, heroEnabled: true };
}

/**
 * The example from the challenge brief: two sprites walking towards each
 * other with "move 10 steps" and "move -10 steps" inside a repeat. When they
 * collide, the hero feature swaps their animations and they walk apart.
 */
export function createHeroDemoProject(): Project {
  const walker = (name: string, x: number, steps: number, hue: number): Sprite =>
    createSprite({
      name,
      x,
      hue,
      scripts: [
        createScript(40, 40, [
          createBlock("event_whenflagclicked"),
          { ...createBlock("control_repeat", { TIMES: "30" }), body: [createBlock("motion_movesteps", { STEPS: String(steps) })] },
        ]),
      ],
    });
  const sprites = [walker("Sprite1", -150, 10, SPRITE_HUES[0]), walker("Sprite2", 150, -10, SPRITE_HUES[1])];
  return { sprites, selectedId: sprites[0].id, heroEnabled: true };
}
