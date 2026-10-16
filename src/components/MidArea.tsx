import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isHat } from "../blocks/catalog.ts";
import {
  applyDrop,
  arrangeScripts,
  cloneStack,
  deleteBlock,
  detachStack,
  findScript,
  freeSpot,
  setInput,
  stackFrom,
} from "../model/blocks.ts";
import { uid } from "../model/ids.ts";
import type { Script } from "../model/types.ts";
import { useDrag } from "../dnd/DragProvider.tsx";
import { useSelectedSprite, useStore } from "../state/store.tsx";
import { GHOST_PREFIX, StackView, type InputHandler, type MenuHandler, type PressHandler } from "./BlockView.tsx";
import ContextMenu, { type MenuItem } from "./ContextMenu.tsx";
import Icon from "./Icon.tsx";
import SpriteArt from "./SpriteArt.tsx";

const CANVAS_MARGIN = 600;

interface Menu {
  x: number;
  y: number;
  blockId: string;
}

/** Faint outlines of a script, shown while the code area is empty. */
function EmptyIllustration() {
  return (
    <svg width="168" height="112" viewBox="0 0 168 112" aria-hidden="true" focusable="false">
      <path
        d="M8 26C20 8 44 8 56 26H156a4 4 0 0 1 4 4V46a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z"
        fill="#FFBF00"
        fillOpacity="0.2"
        stroke="#FFBF00"
        strokeOpacity="0.65"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <rect x="8" y="56" width="124" height="24" rx="4" fill="#4C97FF" fillOpacity="0.16" stroke="#4C97FF" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 4" />
      <rect x="8" y="86" width="100" height="24" rx="4" fill="#9966FF" fillOpacity="0.16" stroke="#9966FF" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 4" />
    </svg>
  );
}

/** The code area for the selected sprite. */
export default function MidArea() {
  const { state, dispatch } = useStore();
  const sprite = useSelectedSprite();
  const { press, session, target, registerCanvas, invalidateTargets } = useDrag();
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const spriteId = sprite.id;

  const scriptsRef = useRef(sprite.scripts);
  scriptsRef.current = sprite.scripts;
  const spritesRef = useRef(state.project.sprites);
  spritesRef.current = state.project.sprites;

  useEffect(() => {
    registerCanvas(canvasRef.current);
    return () => registerCanvas(null);
  }, [registerCanvas]);

  // If the scripts change during a drag (a hero swap), the measured snap points are stale.
  useEffect(() => {
    invalidateTargets();
  }, [sprite.scripts, invalidateTargets]);

  // Scripts with a running thread glow, like in Scratch.
  const running = useMemo(
    () => new Set(state.runtime.threads.filter((t) => t.spriteId === spriteId).map((t) => t.scriptId)),
    [state.runtime.threads, spriteId]
  );

  // While dragging over a snap target, show a grey preview of the drop.
  const scripts = useMemo(() => {
    if (!session || !target || session.spriteId !== spriteId) return sprite.scripts;
    const preview = cloneStack(session.stack, (b) => GHOST_PREFIX + b.id);
    return applyDrop(sprite.scripts, target, preview);
  }, [sprite.scripts, session, target, spriteId]);

  const handlePress = useCallback<PressHandler>(
    (event, block) =>
      press(event, {
        spriteId,
        begin: () => {
          const before = scriptsRef.current;
          const detached = detachStack(before, block.id);
          if (!detached) return null;
          dispatch({ type: "editScripts", spriteId, edit: () => detached.scripts });
          const { stack, origin, scriptId } = detached;
          return {
            stack,
            origin,
            scriptId,
            // Unchanged since the drag began: put the snapshot back. Otherwise
            // (a hero swap replaced the scripts) re-add the stack where it came from.
            restore: (current) =>
              current === detached.scripts
                ? before
                : [...current, { id: scriptId ?? uid("script"), x: origin.x, y: origin.y, blocks: stack }],
            // A hero swap moves the scripts as a whole, so whichever sprite holds them now is home.
            owner: () => spritesRef.current.find((s) => s.scripts === detached.scripts)?.id ?? spriteId,
          };
        },
        tap: () => {
          const script = findScript(scriptsRef.current, block.id);
          if (script) dispatch({ type: "toggleScript", spriteId, scriptId: script.id, blocks: script.blocks });
        },
      }),
    [press, dispatch, spriteId]
  );

  const handleInput = useCallback<InputHandler>(
    (blockId, name, value) =>
      dispatch({ type: "editScripts", spriteId, edit: (list) => setInput(list, blockId, name, value) }),
    [dispatch, spriteId]
  );

  const handleMenu = useCallback<MenuHandler>((event, block) => {
    setMenu({ x: event.clientX, y: event.clientY, blockId: block.id });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  /** Lines every script up in a tidy column, like Scratch's "Clean up blocks". */
  const cleanUp = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const heights = new Map<string, number>();
    canvas.querySelectorAll<HTMLElement>("[data-script-id]").forEach((el) => {
      if (el.dataset.scriptId) heights.set(el.dataset.scriptId, el.getBoundingClientRect().height);
    });
    dispatch({ type: "editScripts", spriteId, edit: (list) => arrangeScripts(list, (s) => heights.get(s.id) ?? 48) });
    scrollerRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const menuItems: MenuItem[] = menu
    ? [
        {
          label: "Duplicate",
          icon: "clone",
          onSelect: () =>
            dispatch({
              type: "editScripts",
              spriteId,
              edit: (list) => {
                const script = findScript(list, menu.blockId);
                const stack = stackFrom(list, menu.blockId);
                if (!script || stack.length === 0) return list;
                const at = freeSpot(list, script.x + 32, script.y + 32);
                const copy: Script = { id: uid("script"), ...at, blocks: cloneStack(stack) };
                return [...list, copy];
              },
            }),
        },
        {
          label: "Delete Block",
          icon: "trash",
          danger: true,
          onSelect: () => {
            const script = findScript(scriptsRef.current, menu.blockId);
            dispatch({ type: "editScripts", spriteId, edit: (list) => deleteBlock(list, menu.blockId) });
            // Deleting a script's only block deletes the script, which stops it if it runs.
            if (script && script.blocks.length === 1 && script.blocks[0].id === menu.blockId) {
              dispatch({ type: "stopScript", scriptId: script.id });
            }
          },
        },
      ]
    : [];

  // The canvas never shrinks out from under the visible area: the browser would clamp the scroll
  // position and the view would jump, e.g. when the lowest script is picked up to be dragged.
  const view = scrollerRef.current;
  const size = scripts.reduce(
    (acc, s) => ({ width: Math.max(acc.width, s.x + CANVAS_MARGIN), height: Math.max(acc.height, s.y + CANVAS_MARGIN) }),
    { width: view ? view.scrollLeft + view.clientWidth : 0, height: view ? view.scrollTop + view.clientHeight : 0 }
  );

  return (
    <div data-drop="workspace" className="relative flex-1 h-full min-w-0">
      <div ref={scrollerRef} className="absolute inset-0 overflow-auto workspace-bg thin-scroll">
        <div
          ref={canvasRef}
          className="relative"
          style={{ width: size.width, height: size.height, minWidth: "100%", minHeight: "100%" }}
        >
          {scripts.map((script) => (
            <div
              key={script.id}
              data-script-id={script.id}
              data-hat-top={isHat(script.blocks[0]) ? "true" : "false"}
              className={`absolute ${running.has(script.id) ? "is-running" : ""}`}
              style={{ left: script.x, top: script.y }}
            >
              <StackView blocks={script.blocks} mode="workspace" onPress={handlePress} onInput={handleInput} onMenu={handleMenu} />
            </div>
          ))}
        </div>
      </div>

      {/* Which sprite is being coded, Scratch-style, in the top-right corner. */}
      <div className="float-chip pointer-events-none absolute top-3 right-3">
        <SpriteArt hue={sprite.hue} width={22} height={23} />
        <span className="truncate" style={{ maxWidth: 120 }}>
          {sprite.name}
        </span>
      </div>

      <button
        type="button"
        onClick={cleanUp}
        disabled={sprite.scripts.length === 0}
        className="tool-btn absolute bottom-3 right-3"
        title="Line all scripts up in a tidy column"
      >
        <Icon name="broom" size={13} />
        Clean up
      </button>

      {sprite.scripts.length === 0 && !session && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="empty-state flex flex-col items-center text-center" style={{ maxWidth: 300 }}>
            <EmptyIllustration />
            <p className="mt-4 text-sm font-black text-ink">Drag blocks here to program {sprite.name}</p>
            <p className="mt-1.5 text-xs font-semibold leading-relaxed text-ink-soft">
              Start with <span className="font-black text-ink">when flag clicked</span>, snap blocks underneath, then
              press the green flag. Click a script to run it, right-click a block for more.
            </p>
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
    </div>
  );
}
