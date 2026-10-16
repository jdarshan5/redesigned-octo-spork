import React from "react";
import { createHeroDemoProject } from "../model/project.ts";
import { useStore } from "../state/store.tsx";
import Icon from "./Icon.tsx";

/** A tiny script: a hat block with a motion and a looks block under it. */
function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="10" fill="#fff" fillOpacity="0.16" />
      <path
        d="M7 10C8.6 6 15.4 6 17 10H24a1.5 1.5 0 0 1 1.5 1.5V13a1.5 1.5 0 0 1-1.5 1.5H8.5A1.5 1.5 0 0 1 7 13z"
        fill="#FFBF00"
      />
      <rect x="7" y="15.5" width="13" height="5" rx="1.5" fill="#4C97FF" />
      <rect x="7" y="21.5" width="17" height="5" rx="1.5" fill="#B794FF" />
    </svg>
  );
}

/** Branding plus the project-wide controls: the hero feature switch and the demo. */
export default function TopBar() {
  const { state, dispatch } = useStore();
  const { sprites, heroEnabled } = state.project;

  const loadDemo = () => {
    const hasWork = sprites.some((s) => s.scripts.length > 0);
    if (hasWork && !window.confirm("Replace the current project with the collision demo from the brief?")) return;
    dispatch({ type: "loadProject", project: createHeroDemoProject() });
  };

  return (
    <header className="app-header flex-none h-14 flex items-center gap-3 px-3 sm:px-4 text-white">
      <Logo />
      <div className="min-w-0 flex items-baseline gap-3">
        <h1 className="text-lg font-black tracking-tight whitespace-nowrap">Scratch Editor</h1>
        <span className="hidden md:inline truncate text-xs font-semibold text-white text-opacity-75">
          Snap blocks together, press the flag, watch sprites collide
        </span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        role="switch"
        aria-checked={heroEnabled}
        onClick={() => dispatch({ type: "setHeroEnabled", enabled: !heroEnabled })}
        className="header-btn"
        title="Hero feature: when two sprites collide, they swap animations"
      >
        <span className={`switch ${heroEnabled ? "is-on" : ""}`} />
        <Icon name="bolt" size={11} />
        <span>Hero swap</span>
      </button>
      <button
        type="button"
        onClick={loadDemo}
        className="header-btn"
        aria-label="Load demo"
        title="Load two sprites walking into each other, as in the challenge brief"
      >
        <Icon name="magic" size={12} />
        <span className="hidden sm:inline">Load demo</span>
      </button>
    </header>
  );
}
