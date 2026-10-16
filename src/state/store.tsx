import React, { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { FRAME_MS } from "../engine/runtime.ts";
import { createInitialProject } from "../model/project.ts";
import type { AppState, Sprite } from "../model/types.ts";
import { initState, reducer, type Action } from "./reducer.ts";

export interface Store {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

/** Drives the runtime at Scratch's 30 frames per second while anything runs. */
function useAnimationLoop(running: boolean, dispatch: Dispatch<Action>) {
  useEffect(() => {
    if (!running) return undefined;
    let frame = 0;
    let last = -Infinity;
    const loop = (time: number) => {
      if (time - last >= FRAME_MS - 2) {
        last = time;
        dispatch({ type: "tick", now: time });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, dispatch]);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, () => initState(createInitialProject()));
  useAnimationLoop(state.runtime.threads.length > 0, dispatch);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

export function useSelectedSprite(): Sprite {
  const { state } = useStore();
  const { sprites, selectedId } = state.project;
  return sprites.find((s) => s.id === selectedId) || sprites[0];
}
