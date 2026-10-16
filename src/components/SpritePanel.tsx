import React, { useRef, useState } from "react";
import { createSprite, nextSpriteHue, nextSpriteName } from "../model/project.ts";
import type { Sprite } from "../model/types.ts";
import { useDrag } from "../dnd/DragProvider.tsx";
import type { SpritePatch } from "../state/reducer.ts";
import { useSelectedSprite, useStore } from "../state/store.tsx";
import Icon from "./Icon.tsx";
import SpriteArt from "./SpriteArt.tsx";

const randomInt = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

interface FieldProps {
  label: string;
  icon: string;
  value: string;
  onCommit: (value: string) => void;
  numeric?: boolean;
}

/** A labelled input that holds a draft while focused and commits on blur or Enter (Escape reverts). */
function Field({ label, icon, value, onCommit, numeric = false }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = useRef(value);
  const cancelled = useRef(false);
  const commit = () => {
    if (!cancelled.current && draft !== null && draft !== focused.current) onCommit(draft);
    cancelled.current = false;
    setDraft(null);
  };
  return (
    <label className="field">
      <span className="field-label">
        <Icon name={icon} size={10} />
        {label}
      </span>
      <input
        className="field-input"
        value={draft ?? value}
        inputMode={numeric ? "decimal" : "text"}
        spellCheck={false}
        onFocus={() => {
          focused.current = value;
          setDraft(value);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true; // blur() commits synchronously, before setDraft lands
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** Name, position and direction of the selected sprite, like Scratch's sprite info pane. */
function SpriteInfo({ sprite }: { sprite: Sprite }) {
  const { dispatch } = useStore();
  const patch = (fields: SpritePatch) => dispatch({ type: "updateSprite", spriteId: sprite.id, patch: fields });
  const numberField = (key: "x" | "y" | "direction") => (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) patch({ [key]: n });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Sprite" icon="cat" value={sprite.name} onCommit={(name) => patch({ name })} />
      <Field label="Direction" icon="compass" value={String(Math.round(sprite.direction))} onCommit={numberField("direction")} numeric />
      <Field label="x" icon="arrows-alt-h" value={String(Math.round(sprite.x))} onCommit={numberField("x")} numeric />
      <Field label="y" icon="arrows-alt-v" value={String(Math.round(sprite.y))} onCommit={numberField("y")} numeric />
    </div>
  );
}

/** Sprite list: pick the sprite to code, add or delete sprites, drop scripts on a tile to copy them. */
export default function SpritePanel() {
  const { state, dispatch } = useStore();
  const selected = useSelectedSprite();
  const { session, zone } = useDrag();
  const { sprites, selectedId } = state.project;
  const running = new Set(state.runtime.threads.map((t) => t.spriteId));

  const addSprite = () =>
    dispatch({
      type: "addSprite",
      sprite: createSprite({
        name: nextSpriteName(sprites),
        x: randomInt(-180, 180),
        y: randomInt(-120, 120),
        hue: nextSpriteHue(sprites),
      }),
    });

  return (
    <section className="card sprite-card relative flex-1 min-h-0 flex flex-col overflow-hidden" aria-label="Sprites">
      <div className="flex-none px-3 pt-3 pb-3 border-b border-gray-100">
        <SpriteInfo sprite={selected} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll p-3 pb-20">
        <div className="sprite-grid">
          {sprites.map((s) => {
            const isSelected = s.id === selectedId;
            const candidate = session !== null && session.spriteId !== s.id;
            const dropping = candidate && zone === `sprite:${s.id}`;
            const select = () => dispatch({ type: "selectSprite", spriteId: s.id });
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                data-drop-sprite={s.id}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select();
                  }
                }}
                className={`sprite-tile ${isSelected ? "is-selected" : ""} ${candidate ? "is-drop-candidate" : ""} ${
                  dropping ? "is-drop-target" : ""
                }`}
                title={s.name}
              >
                {running.has(s.id) && <span className="tile-running" aria-label="running" />}
                {dropping && <span className="tile-drop-hint">Copy here</span>}
                {isSelected && sprites.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Delete ${s.name}`}
                    title="Delete sprite"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "removeSprite", spriteId: s.id });
                    }}
                    className="tile-delete"
                  >
                    <Icon name="times" size={10} />
                  </button>
                )}
                <SpriteArt hue={s.hue} width={48} height={50} />
                <span className="sprite-tile-name">{s.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button type="button" onClick={addSprite} className="fab" aria-label="Add sprite" title="Add sprite">
        <Icon name="plus" size={18} />
      </button>
    </section>
  );
}
