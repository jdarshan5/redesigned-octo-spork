/**
 * Pointer-based drag and drop for blocks (works with mouse, pen and touch).
 *
 * Scratch behaviours covered:
 *   - drag a block from the palette into the code area
 *   - snap blocks together, with a grey preview where they will land
 *   - drag a block out of a stack to take it and everything below it
 *   - drop blocks inside a repeat block, or above the top of a script
 *   - drop blocks back on the palette to delete them
 *   - drop a script onto another sprite's tile to copy it to that sprite
 *   - press and release without moving to "tap" a block (run its script)
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isHat } from "../blocks/catalog.ts";
import { StackView } from "../components/BlockView.tsx";
import { applyDrop, cloneStack, findScript, freeSpot, type DropTarget } from "../model/blocks.ts";
import { uid } from "../model/ids.ts";
import type { Block, Script } from "../model/types.ts";
import { useStore } from "../state/store.tsx";
import { findDropTarget, measureConnections, sameTarget, type ConnectionPoint } from "./hitTest.ts";

/** What `begin()` hands to the drag once the pointer has moved far enough. */
export interface DragPayload {
  stack: Block[];
  /**
   * Puts the stack back if the drag is cancelled, given the sprite's current
   * scripts (they may have changed under a hero swap). Null for palette drags.
   */
  restore: ((current: Script[]) => Script[]) | null;
  /** The sprite to restore to, if a hero swap has since moved the stack's scripts to another sprite. */
  owner?: () => string;
  /** Where the stack came from, so copies can be placed nearby. */
  origin: { x: number; y: number } | null;
  /** Set when a whole script is being moved: it keeps its id (and its running thread). */
  scriptId: string | null;
}

export interface PressOptions {
  spriteId: string;
  begin: () => DragPayload | null;
  /** Called instead of a drag when the pointer is released without moving. */
  tap?: () => void;
}

interface Session extends DragPayload {
  spriteId: string;
  grabX: number;
  grabY: number;
  x: number;
  y: number;
}

/** A drop zone under the pointer: the palette, the workspace or `sprite:<id>`. */
type Zone = string | null;

export interface DragApi {
  session: Session | null;
  target: DropTarget | null;
  zone: Zone;
  press: (event: React.PointerEvent<Element>, options: PressOptions) => void;
  registerCanvas: (el: HTMLElement | null) => void;
  invalidateTargets: () => void;
}

const DragContext = createContext<DragApi | null>(null);
const DRAG_THRESHOLD = 4;

function zoneAt(x: number, y: number): Zone {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const sprite = el.closest<HTMLElement>("[data-drop-sprite]");
  if (sprite) return `sprite:${sprite.dataset.dropSprite}`;
  if (el.closest('[data-drop="palette"]')) return "palette";
  if (el.closest('[data-drop="workspace"]')) return "workspace";
  return null;
}

interface Live {
  session: Session | null;
  target: DropTarget | null;
  zone: Zone;
}

export function DragProvider({ children }: { children: ReactNode }) {
  const { dispatch } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [zone, setZone] = useState<Zone>(null);
  const live = useRef<Live>({ session: null, target: null, zone: null });
  const canvasRef = useRef<HTMLElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<ConnectionPoint[] | null>(null);

  const registerCanvas = useCallback((el: HTMLElement | null) => {
    canvasRef.current = el;
  }, []);

  /** Forgets the measured snap points; they are measured again on the next pointer move. */
  const invalidateTargets = useCallback(() => {
    pointsRef.current = null;
  }, []);

  useEffect(() => {
    document.body.classList.toggle("is-dragging", Boolean(session));
  }, [session]);

  const setLive = (patch: Partial<Live>) => {
    live.current = { ...live.current, ...patch };
    if ("session" in patch) setSession(patch.session ?? null);
    if ("target" in patch) setTarget(patch.target ?? null);
    if ("zone" in patch) setZone(patch.zone ?? null);
  };

  const canvasPoint = (s: Session, canvas: HTMLElement, x: number, y: number) => {
    const origin = canvas.getBoundingClientRect();
    return { left: x - s.grabX - origin.left, top: y - s.grabY - origin.top };
  };

  const track = (x: number, y: number) => {
    const s = live.current.session;
    if (!s) return;
    if (ghostRef.current) {
      ghostRef.current.style.transform = `translate(${x - s.grabX}px, ${y - s.grabY}px)`;
    }
    const nextZone = zoneAt(x, y);
    if (nextZone !== live.current.zone) setLive({ zone: nextZone });

    let nextTarget: DropTarget | null = null;
    const canvas = canvasRef.current;
    if (nextZone === "workspace" && canvas) {
      // Measured before any preview is shown, then reused for the whole drag.
      if (!pointsRef.current) pointsRef.current = measureConnections(canvas);
      const height = ghostRef.current ? ghostRef.current.getBoundingClientRect().height : 0;
      nextTarget = findDropTarget(pointsRef.current, {
        ...canvasPoint(s, canvas, x, y),
        height,
        isHatStack: isHat(s.stack[0]),
      });
    }
    if (!sameTarget(nextTarget, live.current.target)) setLive({ target: nextTarget });
  };

  const restore = (s: Session) => {
    if (s.restore) dispatch({ type: "editScripts", spriteId: s.owner ? s.owner() : s.spriteId, edit: s.restore });
  };

  const freeScript = (s: Session, stack: Block[], x: number, y: number): Script => ({
    id: s.scriptId ?? uid("script"),
    x: Math.max(8, Math.round(x)),
    y: Math.max(8, Math.round(y)),
    blocks: stack,
  });

  const drop = (x: number, y: number) => {
    const s = live.current.session;
    if (!s) return;
    const dropZone = zoneAt(x, y);
    const dropTarget = live.current.target;
    const canvas = canvasRef.current;
    const position = dropZone === "workspace" && canvas ? canvasPoint(s, canvas, x, y) : null;
    pointsRef.current = null;
    setLive({ session: null, target: null, zone: null });

    if (position) {
      dispatch({
        type: "editScripts",
        spriteId: s.spriteId,
        edit: (scripts) => {
          if (dropTarget) {
            const snapped = applyDrop(scripts, dropTarget, s.stack);
            // The target block is gone (e.g. a hero swap mid-drag): drop the stack loose instead.
            if (findScript(snapped, s.stack[0].id)) return snapped;
          }
          return [...scripts, freeScript(s, s.stack, position.left, position.top)];
        },
      });
      return;
    }
    if (dropZone && dropZone.startsWith("sprite:") && dropZone.slice(7) !== s.spriteId) {
      const at = s.origin || { x: 32, y: 32 };
      const blocks = cloneStack(s.stack);
      const id = uid("script");
      dispatch({
        type: "editScripts",
        spriteId: dropZone.slice(7),
        edit: (scripts) => [...scripts, { id, ...freeSpot(scripts, at.x, at.y), blocks }],
      });
      restore(s);
      return;
    }
    if (dropZone !== "palette") {
      restore(s);
      return;
    }
    // Dropping on the palette deletes the blocks: they are already detached.
    // A whole script deleted while it runs stops, as in Scratch.
    if (s.scriptId) dispatch({ type: "stopScript", scriptId: s.scriptId });
  };

  /**
   * Call from a block's pointerdown. `begin()` runs once the pointer has
   * moved far enough; releasing before that calls `tap()` instead.
   */
  const press = useCallback((event: React.PointerEvent<Element>, { spriteId, begin, tap }: PressOptions) => {
    if (event.button !== 0 || live.current.session) return;
    event.stopPropagation();
    // preventDefault keeps focus where it is, so commit a field being edited, as clicking elsewhere would.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const { pointerId } = event;
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      if (started) {
        track(e.clientX, e.clientY);
        return;
      }
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
      // Another finger started a drag first: one drag at a time.
      if (live.current.session) {
        cleanup();
        return;
      }
      const payload = begin();
      if (!payload) {
        cleanup();
        return;
      }
      started = true;
      pointsRef.current = null;
      setLive({
        session: {
          ...payload,
          spriteId,
          grabX: startX - rect.left,
          grabY: startY - rect.top,
          x: e.clientX,
          y: e.clientY,
        },
      });
    }
    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      cleanup();
      if (started) drop(e.clientX, e.clientY);
      else if (tap) tap();
    }
    function onCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      cleanup();
      if (!started) return;
      const s = live.current.session;
      pointsRef.current = null;
      setLive({ session: null, target: null, zone: null });
      if (s) restore(s);
    }
    // A long press or Ctrl+click opens the block's menu instead: it is neither a tap nor a drag.
    // Capture phase, because the block stops the event from bubbling.
    function onContextMenu() {
      if (!started) cleanup();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("contextmenu", onContextMenu, true);
    // `track`, `drop` and `restore` only read refs and the stable dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<DragApi>(
    () => ({ session, target, zone, press, registerCanvas, invalidateTargets }),
    [session, target, zone, press, registerCanvas, invalidateTargets]
  );

  return (
    <DragContext.Provider value={value}>
      {children}
      {session && (
        <div
          ref={ghostRef}
          className="drag-ghost"
          style={{ transform: `translate(${session.x - session.grabX}px, ${session.y - session.grabY}px)` }}
        >
          {/* Tilts around the grab point so the block stays under the pointer. */}
          <div className="drag-lift" style={{ transformOrigin: `${session.grabX}px ${session.grabY}px` }}>
            <StackView blocks={session.stack} mode="drag" />
          </div>
        </div>
      )}
    </DragContext.Provider>
  );
}

export function useDrag(): DragApi {
  const drag = useContext(DragContext);
  if (!drag) throw new Error("useDrag must be used inside <DragProvider>");
  return drag;
}
