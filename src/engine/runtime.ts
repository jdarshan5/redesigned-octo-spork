/**
 * The script runtime. It is a set of pure functions over the app state
 * `{ project, runtime }`, so it can be unit-tested without a browser.
 *
 * Every running script is a thread: a stack of frames (one per nested
 * repeat body) plus a program counter. `tick` advances each thread until it
 * yields. Motion and looks blocks yield once per frame so every step is
 * visible, and each repeat iteration takes at least one frame.
 *
 * Hero feature: after each tick, sprites that have just started touching
 * swap animations. Their running threads, speech bubbles and scripts trade
 * places, so each sprite carries on with the other one's program.
 */
import { BLOCK_SPECS } from "../blocks/catalog.ts";
import type { AppState, Block, Bubble, Frame, Runtime, Script, Sprite, Thread } from "../model/types.ts";
import { fenced, moveSteps, toNumber, touchingPairs, turnBy } from "./geometry.ts";

export const FRAME_MS = 1000 / 30;
const MAX_OPS_PER_TICK = 10000;
/** Scratch's limit on bubble text, which also keeps the longest bubble on the stage. */
export const BUBBLE_TEXT_LIMIT = 330;

export const createRuntime = (): Runtime => ({
  threads: [],
  bubbles: {},
  touching: [],
  nextToken: 1,
  swaps: [],
});

export const createThread = (spriteId: string, scriptId: string, blocks: Block[]): Thread => ({
  spriteId,
  scriptId,
  frames: [{ blocks, pc: 0 }],
  waitUntil: null,
  bubbleToken: null,
});

const copyFrames = (frames: Frame[]): Frame[] =>
  frames.map((f) => (f.repeat ? { ...f, repeat: { ...f.repeat } } : { ...f }));

export interface StepResult {
  /** The thread to keep running, or null when it has finished. */
  thread: Thread | null;
  sprite: Sprite;
  bubble: Bubble | undefined;
  nextToken: number;
}

/** Runs one thread until it yields or finishes. */
export function stepThread(
  thread: Thread,
  spriteIn: Sprite,
  bubbleIn: Bubble | undefined,
  now: number,
  tokenIn: number
): StepResult {
  let sprite = spriteIn;
  let bubble = bubbleIn;
  let token = tokenIn;
  let { waitUntil, bubbleToken } = thread;
  const frames = copyFrames(thread.frames);

  const result = (done: boolean): StepResult => ({
    thread: done ? null : { ...thread, frames, waitUntil, bubbleToken },
    sprite,
    bubble,
    nextToken: token,
  });

  // A thread that has yielded inside a loop iteration has "spent" a frame.
  const markYielded = (frameCount: number) => {
    for (let i = 0; i < frameCount; i += 1) {
      const loop = frames[i].repeat;
      if (loop) loop.yielded = true;
    }
  };
  const yieldFrame = () => {
    markYielded(frames.length);
    return result(false);
  };

  if (waitUntil !== null) {
    if (now < waitUntil) return result(false);
    if (bubble && bubble.token === bubbleToken) bubble = undefined;
    waitUntil = null;
    bubbleToken = null;
  }

  for (let ops = 0; ops < MAX_OPS_PER_TICK; ops += 1) {
    const top = frames[frames.length - 1];
    if (!top) return result(true);

    if (top.pc >= top.blocks.length) {
      const loop = top.repeat;
      if (!loop) {
        frames.pop();
        continue;
      }
      loop.remaining -= 1;
      const mustYield = !loop.yielded;
      if (loop.remaining > 0) {
        top.pc = 0;
        loop.yielded = false;
      } else {
        frames.pop();
      }
      if (mustYield) {
        if (frames.length === 0) return result(true);
        markYielded(loop.remaining > 0 ? frames.length - 1 : frames.length);
        return result(false);
      }
      continue;
    }

    const block = top.blocks[top.pc];
    top.pc += 1;
    const { inputs } = block;

    switch (block.kind) {
      case "motion_movesteps":
        sprite = moveSteps(sprite, toNumber(inputs.STEPS));
        return yieldFrame();
      case "motion_turnright":
        sprite = turnBy(sprite, toNumber(inputs.DEGREES));
        return yieldFrame();
      case "motion_turnleft":
        sprite = turnBy(sprite, -toNumber(inputs.DEGREES));
        return yieldFrame();
      case "motion_gotoxy":
        sprite = { ...sprite, ...fenced(toNumber(inputs.X), toNumber(inputs.Y)) };
        return yieldFrame();
      case "looks_sayforsecs":
      case "looks_thinkforsecs":
        bubble = {
          kind: block.kind === "looks_sayforsecs" ? "say" : "think",
          text: String(inputs.MESSAGE ?? "").slice(0, BUBBLE_TEXT_LIMIT),
          token,
        };
        bubbleToken = token;
        token += 1;
        waitUntil = now + Math.max(0, toNumber(inputs.SECS)) * 1000;
        return yieldFrame();
      case "control_repeat": {
        const times = Math.round(toNumber(inputs.TIMES));
        if (times > 0) {
          frames.push({ blocks: block.body || [], pc: 0, repeat: { remaining: times, yielded: false } });
        }
        continue;
      }
      case "event_whenflagclicked":
      case "event_whenthisspriteclicked":
        // Hat blocks do nothing when executed.
        continue;
    }
  }
  return result(false);
}

/** Swaps everything that makes up two sprites' animations. */
export function swapAnimations(state: AppState, a: string, b: string): AppState {
  const { project, runtime } = state;
  const spriteA = project.sprites.find((s) => s.id === a);
  const spriteB = project.sprites.find((s) => s.id === b);
  if (!spriteA || !spriteB) return state;

  const other = (id: string) => (id === a ? b : id === b ? a : id);
  const bubbles = { ...runtime.bubbles };
  delete bubbles[a];
  delete bubbles[b];
  if (runtime.bubbles[a]) bubbles[b] = runtime.bubbles[a];
  if (runtime.bubbles[b]) bubbles[a] = runtime.bubbles[b];

  return {
    project: {
      ...project,
      sprites: project.sprites.map((s) => {
        if (s.id === a) return { ...s, scripts: spriteB.scripts };
        if (s.id === b) return { ...s, scripts: spriteA.scripts };
        return s;
      }),
    },
    runtime: {
      ...runtime,
      threads: runtime.threads.map((t) => ({ ...t, spriteId: other(t.spriteId) })),
      bubbles,
    },
  };
}

/**
 * Swaps animations for pairs that started touching this tick. Pairs that
 * keep touching do not swap again until they separate.
 */
function resolveCollisions(state: AppState, animatedIds: Set<string>, now: number): AppState {
  const pairs = touchingPairs(state.project.sprites);
  const before = new Set(state.runtime.touching);
  let next = state;
  if (state.project.heroEnabled) {
    for (const key of pairs) {
      if (before.has(key)) continue;
      const [a, b] = key.split("|");
      if (!animatedIds.has(a) && !animatedIds.has(b)) continue;
      next = swapAnimations(next, a, b);
      next = { ...next, runtime: { ...next.runtime, swaps: [...next.runtime.swaps, { a, b, at: now }] } };
    }
  }
  return { ...next, runtime: { ...next.runtime, touching: pairs } };
}

/** Advances every running thread by one frame. */
export function tick(state: AppState, now: number): AppState {
  const { project, runtime } = state;
  if (runtime.threads.length === 0) return state;

  const sprites = new Map(project.sprites.map((s) => [s.id, s]));
  const bubbles = { ...runtime.bubbles };
  const threads: Thread[] = [];
  let token = runtime.nextToken;

  for (const thread of runtime.threads) {
    const sprite = sprites.get(thread.spriteId);
    if (!sprite) continue;
    const step = stepThread(thread, sprite, bubbles[sprite.id], now, token);
    sprites.set(sprite.id, step.sprite);
    if (step.bubble) bubbles[sprite.id] = step.bubble;
    else delete bubbles[sprite.id];
    token = step.nextToken;
    if (step.thread) threads.push(step.thread);
  }

  const stepped: AppState = {
    project: { ...project, sprites: project.sprites.map((s) => sprites.get(s.id) || s) },
    runtime: { ...runtime, threads, bubbles, nextToken: token },
  };
  return resolveCollisions(stepped, new Set(runtime.threads.map((t) => t.spriteId)), now);
}

const startsWithHat = (script: Script): boolean => {
  const first = script.blocks[0];
  return first !== undefined && BLOCK_SPECS[first.kind].shape === "hat";
};

/** Removes the threads matching `shouldStop`, taking down any bubble they put up. */
function stopThreads(runtime: Runtime, shouldStop: (thread: Thread) => boolean): Runtime {
  const bubbles = { ...runtime.bubbles };
  const threads = runtime.threads.filter((thread) => {
    if (!shouldStop(thread)) return true;
    const bubble = bubbles[thread.spriteId];
    if (bubble && bubble.token === thread.bubbleToken) delete bubbles[thread.spriteId];
    return false;
  });
  return { ...runtime, threads, bubbles };
}

/**
 * (Re)starts the given scripts of one sprite, restarting any that are already
 * running, the way triggering a hat block again does in Scratch.
 */
export function startScripts(state: AppState, spriteId: string, scripts: Script[]): AppState {
  const ids = new Set(scripts.map((s) => s.id));
  const runtime = stopThreads(state.runtime, (t) => t.spriteId === spriteId && ids.has(t.scriptId));
  const started = scripts.filter((s) => s.blocks.length > 0).map((s) => createThread(spriteId, s.id, s.blocks));
  return {
    ...state,
    runtime: {
      ...runtime,
      threads: [...runtime.threads, ...started],
      // Starting from idle: sprites that already overlap must not swap.
      touching: state.runtime.threads.length === 0 ? touchingPairs(state.project.sprites) : runtime.touching,
    },
  };
}

/** Clicking a script in the code area runs it, or stops it if it is running. */
export function toggleScript(state: AppState, spriteId: string, scriptId: string, blocks: Block[]): AppState {
  const isTarget = (t: Thread) => t.spriteId === spriteId && t.scriptId === scriptId;
  if (state.runtime.threads.some(isTarget)) {
    return { ...state, runtime: stopThreads(state.runtime, isTarget) };
  }
  return startScripts(state, spriteId, [{ id: scriptId, x: 0, y: 0, blocks }]);
}

/**
 * Stops a script that was deleted while running, so no thread outlives its blocks.
 * Script ids are unique across sprites, so this also finds a thread a hero swap moved.
 */
export const stopScript = (state: AppState, scriptId: string): AppState => ({
  ...state,
  runtime: stopThreads(state.runtime, (t) => t.scriptId === scriptId),
});

/** Clicking a sprite on the stage runs its "when this sprite clicked" scripts. */
export function spriteClicked(state: AppState, spriteId: string): AppState {
  const sprite = state.project.sprites.find((s) => s.id === spriteId);
  if (!sprite) return state;
  const scripts = sprite.scripts.filter((s) => s.blocks[0]?.kind === "event_whenthisspriteclicked");
  return scripts.length > 0 ? startScripts(state, spriteId, scripts) : state;
}

/**
 * The play button. It restarts every "when flag clicked" script, plus every
 * script without a hat block, so that all sprites start animating.
 */
export function greenFlag(state: AppState): AppState {
  const threads = state.project.sprites.flatMap((sprite) =>
    sprite.scripts
      .filter((s) => s.blocks.length > 0)
      .filter((s) => s.blocks[0].kind === "event_whenflagclicked" || !startsWithHat(s))
      .map((s) => createThread(sprite.id, s.id, s.blocks))
  );
  return {
    ...state,
    runtime: {
      ...createRuntime(),
      threads,
      // Sprites that already overlap when play is pressed must not swap.
      touching: touchingPairs(state.project.sprites),
      nextToken: state.runtime.nextToken,
    },
  };
}

/** The stop button: ends every thread and clears every bubble. */
export const stopAll = (state: AppState): AppState => ({
  ...state,
  runtime: { ...createRuntime(), nextToken: state.runtime.nextToken },
});

/** Drops everything the runtime knows about a sprite that is being deleted. */
export function forgetSprite(runtime: Runtime, spriteId: string): Runtime {
  const next = stopThreads(runtime, (t) => t.spriteId === spriteId);
  const bubbles = { ...next.bubbles };
  delete bubbles[spriteId];
  return { ...next, bubbles, touching: next.touching.filter((key) => !key.split("|").includes(spriteId)) };
}
