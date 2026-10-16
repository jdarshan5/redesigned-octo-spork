/**
 * Pure helpers for editing scripts. A script is a positioned stack of blocks;
 * C-blocks (repeat) hold a nested stack in `body`. Every helper returns new
 * objects and leaves its input untouched.
 */
import { BLOCK_SPECS, type BlockKind } from "../blocks/catalog.ts";
import { uid } from "./ids.ts";
import type { Block, Script } from "./types.ts";

/** Where a dragged stack will land, as computed by the drag-and-drop layer. */
export type DropTarget =
  | { kind: "after"; blockId: string }
  | { kind: "inside"; blockId: string }
  | { kind: "before"; scriptId: string; y: number };

export function createBlock(kind: BlockKind, inputs: Record<string, string> = {}): Block {
  const spec = BLOCK_SPECS[kind];
  const block: Block = { id: uid("block"), kind, inputs: { ...spec.defaults, ...inputs } };
  return spec.shape === "c" ? { ...block, body: [] } : block;
}

/** Deep-copies a stack, giving every block a fresh id. */
export function cloneStack(blocks: Block[], makeId: (block: Block) => string = () => uid("block")): Block[] {
  return blocks.map((block) => {
    const copy: Block = { ...block, id: makeId(block), inputs: { ...block.inputs } };
    return block.body ? { ...copy, body: cloneStack(block.body, makeId) } : copy;
  });
}

const replaceAt = <T>(list: T[], index: number, item: T): T[] => list.map((x, i) => (i === index ? item : x));

type ListEdit = (list: Block[], index: number) => Block[];

/**
 * Runs `edit(list, index)` on whichever list (top level or nested body)
 * directly holds `blockId`. Returns the rebuilt top-level list, or null.
 */
function editListHolding(blocks: Block[], blockId: string, edit: ListEdit): Block[] | null {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index !== -1) return edit(blocks, index);
  for (let i = 0; i < blocks.length; i += 1) {
    const { body } = blocks[i];
    if (!body) continue;
    const next = editListHolding(body, blockId, edit);
    if (next) return replaceAt(blocks, i, { ...blocks[i], body: next });
  }
  return null;
}

/** Replaces the block with `blockId` by `edit(block)`. Unchanged lists keep their identity. */
function editBlock(blocks: Block[], blockId: string, edit: (block: Block) => Block): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.id === blockId) {
      changed = true;
      return edit(block);
    }
    if (block.body) {
      const body = editBlock(block.body, blockId, edit);
      if (body !== block.body) {
        changed = true;
        return { ...block, body };
      }
    }
    return block;
  });
  return changed ? next : blocks;
}

const editEachScript = (scripts: Script[], edit: (blocks: Block[]) => Block[] | null): Script[] =>
  scripts
    .map((script) => {
      const blocks = edit(script.blocks);
      return blocks && blocks !== script.blocks ? { ...script, blocks } : script;
    })
    .filter((script) => script.blocks.length > 0);

const holds = (blocks: Block[], blockId: string): boolean =>
  blocks.some((b) => b.id === blockId || (b.body !== undefined && holds(b.body, blockId)));

/** The script that contains `blockId`, at any depth. */
export function findScript(scripts: Script[], blockId: string): Script | null {
  return scripts.find((script) => holds(script.blocks, blockId)) ?? null;
}

/** The block with `blockId` and every block below it in its stack. */
export function stackFrom(scripts: Script[], blockId: string): Block[] {
  let stack: Block[] = [];
  for (const script of scripts) {
    if (editListHolding(script.blocks, blockId, (list, index) => (stack = list.slice(index)))) break;
  }
  return stack;
}

export interface Detached {
  scripts: Script[];
  stack: Block[];
  /** Where the script the stack came from sits, for putting copies nearby. */
  origin: { x: number; y: number };
  /** The script's id when the whole script was taken, so a move can keep it. */
  scriptId: string | null;
}

/**
 * Pulls the block and everything below it out of its stack, as Scratch does
 * when you drag a block. Dragging the top block takes the whole script.
 */
export function detachStack(scripts: Script[], blockId: string): Detached | null {
  for (const script of scripts) {
    let stack: Block[] = [];
    const blocks = editListHolding(script.blocks, blockId, (list, index) => {
      stack = list.slice(index);
      return list.slice(0, index);
    });
    if (!blocks) continue;
    const rest =
      blocks.length === 0
        ? scripts.filter((s) => s !== script)
        : scripts.map((s) => (s === script ? { ...s, blocks } : s));
    return { scripts: rest, stack, origin: { x: script.x, y: script.y }, scriptId: blocks.length === 0 ? script.id : null };
  }
  return null;
}

/** Removes a single block (with its body, if it has one) and closes the gap. */
export const deleteBlock = (scripts: Script[], blockId: string): Script[] =>
  editEachScript(scripts, (blocks) =>
    editListHolding(blocks, blockId, (list, index) => [...list.slice(0, index), ...list.slice(index + 1)])
  );

export const insertAfter = (scripts: Script[], blockId: string, stack: Block[]): Script[] =>
  editEachScript(scripts, (blocks) =>
    editListHolding(blocks, blockId, (list, index) => [
      ...list.slice(0, index + 1),
      ...stack,
      ...list.slice(index + 1),
    ])
  );

export const insertInside = (scripts: Script[], blockId: string, stack: Block[]): Script[] =>
  editEachScript(scripts, (blocks) =>
    editBlock(blocks, blockId, (block) => ({ ...block, body: [...stack, ...(block.body || [])] }))
  );

export const insertBefore = (scripts: Script[], scriptId: string, stack: Block[], y: number): Script[] =>
  scripts.map((s) => (s.id === scriptId ? { ...s, y, blocks: [...stack, ...s.blocks] } : s));

/** Applies a drop target computed by the drag-and-drop layer. */
export function applyDrop(scripts: Script[], target: DropTarget, stack: Block[]): Script[] {
  switch (target.kind) {
    case "after":
      return insertAfter(scripts, target.blockId, stack);
    case "inside":
      return insertInside(scripts, target.blockId, stack);
    case "before":
      return insertBefore(scripts, target.scriptId, stack, target.y);
  }
}

export interface ArrangeOptions {
  x?: number;
  y?: number;
  gap?: number;
}

/**
 * Lines scripts up in one column in reading order (top to bottom, then left
 * to right), like Scratch's "Clean up blocks". `heightOf` gives each script's
 * rendered height. The array order is kept so React does not remount scripts.
 */
export function arrangeScripts(
  scripts: Script[],
  heightOf: (script: Script) => number,
  { x = 24, y = 24, gap = 28 }: ArrangeOptions = {}
): Script[] {
  const placed = new Map<string, Script>();
  let top = y;
  for (const script of [...scripts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    placed.set(script.id, { ...script, x, y: top });
    top += heightOf(script) + gap;
  }
  return scripts.map((s) => placed.get(s.id) ?? s);
}

/** Moves (x, y) down and to the right until no script starts there, so copies never hide one another. */
export function freeSpot(scripts: Script[], x: number, y: number, step = 32): { x: number; y: number } {
  let spot = { x, y };
  while (scripts.some((s) => s.x === spot.x && s.y === spot.y)) spot = { x: spot.x + step, y: spot.y + step };
  return spot;
}

export const setInput = (scripts: Script[], blockId: string, name: string, value: string): Script[] =>
  editEachScript(scripts, (blocks) =>
    editBlock(blocks, blockId, (block) => ({ ...block, inputs: { ...block.inputs, [name]: value } }))
  );
