/**
 * The data model. Everything the editor and the runtime work with is plain,
 * immutable data, so it can be reduced, unit-tested and serialised freely.
 */
import type { BlockKind } from "../blocks/catalog.ts";

export interface Block {
  id: string;
  kind: BlockKind;
  /** Input values are kept as typed (strings); the runtime parses them. */
  inputs: Record<string, string>;
  /** The nested stack of a C-block (repeat). Absent on every other block. */
  body?: Block[];
}

/** A positioned stack of blocks in a sprite's code area. */
export interface Script {
  id: string;
  x: number;
  y: number;
  blocks: Block[];
}

export interface Sprite {
  id: string;
  name: string;
  /** Stage position, Scratch style: (0, 0) is the centre and y points up. */
  x: number;
  y: number;
  /** Heading in degrees; 90 faces right, as in Scratch. */
  direction: number;
  /** Costume tint: a hue rotation in degrees applied to the orange cat. */
  hue: number;
  scripts: Script[];
}

export interface Project {
  sprites: Sprite[];
  selectedId: string;
  /** Hero feature: swap animations when two sprites collide. */
  heroEnabled: boolean;
}

export type BubbleKind = "say" | "think";

export interface Bubble {
  kind: BubbleKind;
  text: string;
  /** Identifies which block put the bubble up, so only that block clears it. */
  token: number;
}

export interface RepeatState {
  remaining: number;
  /** True once the current iteration has spent a frame. */
  yielded: boolean;
}

/** One level of a running script: a block list and a program counter. */
export interface Frame {
  blocks: Block[];
  pc: number;
  repeat?: RepeatState;
}

export interface Thread {
  spriteId: string;
  scriptId: string;
  frames: Frame[];
  waitUntil: number | null;
  bubbleToken: number | null;
}

/** One hero-feature swap, recorded so the stage can announce it. */
export interface Swap {
  a: string;
  b: string;
  at: number;
}

export interface Runtime {
  threads: Thread[];
  /** Speech/thought bubble per sprite id. */
  bubbles: Record<string, Bubble>;
  /** Pairs of sprites that were touching after the last frame. */
  touching: string[];
  nextToken: number;
  swaps: Swap[];
}

export interface AppState {
  project: Project;
  runtime: Runtime;
}
