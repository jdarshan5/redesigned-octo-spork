import React from "react";
import { useStore } from "../state/store.tsx";
import SpritePanel from "./SpritePanel.tsx";
import Stage from "./Stage.tsx";
import { GreenFlag, StopSign } from "./StageIcons.tsx";

/** The stage with its run controls, and the sprite list. On small screens it sits above the editor. */
export default function PreviewArea() {
  const { state, dispatch } = useStore();
  const running = state.runtime.threads.length > 0;

  return (
    <aside className="stage-col order-first lg:order-none min-h-0 flex flex-col md:flex-row lg:flex-col gap-3">
      <section className="card flex-none md:flex-1 lg:flex-none p-3" aria-label="Stage">
        <div className="flex items-center gap-1 mb-2.5">
          <button
            type="button"
            aria-label="Play"
            title="Play: run every sprite's scripts"
            onClick={() => dispatch({ type: "greenFlag" })}
            className={`stage-btn ${running ? "is-active" : ""}`}
          >
            <GreenFlag size={24} />
          </button>
          <button
            type="button"
            aria-label="Stop"
            title="Stop everything"
            onClick={() => dispatch({ type: "stopAll" })}
            disabled={!running}
            className="stage-btn"
          >
            <StopSign size={22} />
          </button>
          <div className="flex-1" />
          <span className={`status-chip ${running ? "is-live" : ""}`} role="status">
            <span className="dot" />
            {running ? "Running" : "Ready"}
          </span>
        </div>
        <Stage />
      </section>
      <SpritePanel />
    </aside>
  );
}
