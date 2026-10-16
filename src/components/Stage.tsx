import React, { useEffect, useLayoutEffect, useRef, useState, type Dispatch } from "react";
import { STAGE_HEIGHT, STAGE_WIDTH } from "../engine/geometry.ts";
import type { Bubble as BubbleModel, Sprite, Swap } from "../model/types.ts";
import type { Action } from "../state/reducer.ts";
import { useStore } from "../state/store.tsx";
import Icon from "./Icon.tsx";
import SpriteArt from "./SpriteArt.tsx";

const HALF_WIDTH = STAGE_WIDTH / 2;
const HALF_HEIGHT = STAGE_HEIGHT / 2;
const toLeft = (x: number) => HALF_WIDTH + x;
const toTop = (y: number) => HALF_HEIGHT - y;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const CLICK_SLOP = 3;

function Bubble({ sprite, bubble }: { sprite: Sprite; bubble: BubbleModel }) {
  const flip = sprite.x > 100;
  return (
    <div
      className={`bubble bubble-${bubble.kind} ${flip ? "bubble-flip" : ""}`}
      style={{ left: toLeft(sprite.x) + (flip ? -22 : 22), top: toTop(sprite.y) - 44 }}
    >
      {bubble.text}
    </div>
  );
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

interface StageSpriteProps {
  sprite: Sprite;
  scale: number;
  /** Timestamp of the swap to flash for, or null. A new value restarts the animation. */
  flash: number | null;
  dispatch: Dispatch<Action>;
}

/** A sprite on the stage: drag it to move it, click it to trigger "when this sprite clicked". */
function StageSprite({ sprite, scale, flash, dispatch }: StageSpriteProps) {
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: sprite.x, originY: sprite.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    d.moved = true;
    dispatch({ type: "updateSprite", spriteId: sprite.id, patch: { x: Math.round(d.originX + dx), y: Math.round(d.originY - dy) } });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) dispatch({ type: "spriteClicked", spriteId: sprite.id });
  };

  return (
    <div
      className="stage-sprite"
      title={sprite.name}
      style={{
        left: toLeft(sprite.x),
        top: toTop(sprite.y),
        transform: `translate(-50%, -50%) rotate(${sprite.direction - 90}deg)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div key={flash ?? "idle"} className={flash === null ? undefined : "swap-flash"}>
        <SpriteArt hue={sprite.hue} />
      </div>
    </div>
  );
}

const TOAST_MS = 2200;

/** Shows the most recent hero-feature swap for a moment. */
function useSwapAnnouncement(swaps: Swap[]): Swap | null {
  const latest = swaps.length > 0 ? swaps[swaps.length - 1] : null;
  const [shown, setShown] = useState<Swap | null>(null);
  useEffect(() => {
    setShown(latest);
    if (!latest) return undefined;
    const timer = setTimeout(() => setShown(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [latest]);
  return shown;
}

/** The 480x360 Scratch stage, scaled to fit its container. */
export default function Stage() {
  const { state, dispatch } = useStore();
  const { sprites } = state.project;
  const { bubbles, swaps } = state.runtime;
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const swap = useSwapAnnouncement(swaps);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / STAGE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Stage coordinates under the pointer, handy for "go to x: y:".
  const trackPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPointer({
      x: clamp(Math.round((e.clientX - r.left) / scale - HALF_WIDTH), -HALF_WIDTH, HALF_WIDTH),
      y: clamp(Math.round(HALF_HEIGHT - (e.clientY - r.top) / scale), -HALF_HEIGHT, HALF_HEIGHT),
    });
  };

  const nameOf = (id: string) => sprites.find((s) => s.id === id)?.name ?? "?";

  return (
    <div
      ref={frameRef}
      className="stage-frame w-full flex-none"
      style={{ height: STAGE_HEIGHT * scale }}
      onPointerMove={trackPointer}
      onPointerLeave={() => setPointer(null)}
    >
      <div
        className="absolute left-0 top-0"
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "0 0" }}
      >
        {sprites.map((sprite) => (
          <StageSprite
            key={sprite.id}
            sprite={sprite}
            scale={scale}
            flash={swap !== null && (swap.a === sprite.id || swap.b === sprite.id) ? swap.at : null}
            dispatch={dispatch}
          />
        ))}
        {sprites.map((sprite) => {
          const bubble = bubbles[sprite.id];
          return bubble && bubble.text !== "" ? (
            <Bubble key={`${sprite.id}-${bubble.token}`} sprite={sprite} bubble={bubble} />
          ) : null;
        })}
      </div>

      {swap && (
        <div key={swap.at} role="status" className="stage-toast">
          <Icon name="bolt" size={11} className="text-yellow-300" />
          <span>{nameOf(swap.a)}</span>
          <Icon name="exchange-alt" size={11} />
          <span>{nameOf(swap.b)}</span>
          <span className="opacity-75">swapped</span>
        </div>
      )}
      {pointer && (
        <div className="coords" aria-hidden="true">
          x: {pointer.x}&nbsp;&nbsp;y: {pointer.y}
        </div>
      )}
    </div>
  );
}
