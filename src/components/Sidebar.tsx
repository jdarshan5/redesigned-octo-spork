import React, { useCallback, useRef, useState } from "react";
import { BLOCK_SPECS, CATEGORIES, type BlockKind, type Category } from "../blocks/catalog.ts";
import { createBlock } from "../model/blocks.ts";
import type { Block } from "../model/types.ts";
import { useDrag } from "../dnd/DragProvider.tsx";
import { useStore } from "../state/store.tsx";
import { BlockView, type PressHandler } from "./BlockView.tsx";
import Icon from "./Icon.tsx";

const DOT: Record<Category, string> = {
  events: "bg-events",
  motion: "bg-motion",
  looks: "bg-looks",
  control: "bg-control",
};

// Palette blocks are templates; dragging one creates a fresh copy.
const TEMPLATES = {} as Record<BlockKind, Block>;
for (const category of CATEGORIES) {
  for (const kind of category.kinds) {
    const spec = BLOCK_SPECS[kind];
    TEMPLATES[kind] = { id: `palette:${kind}`, kind, inputs: { ...spec.defaults }, ...(spec.shape === "c" ? { body: [] } : {}) };
  }
}

/**
 * The block palette with Scratch's category rail. Drag a block into the code
 * area, click it to run it on the selected sprite, or drop blocks back here
 * to delete them.
 */
export default function Sidebar() {
  const { state, dispatch } = useStore();
  const { press, session, zone } = useDrag();
  const spriteId = state.project.selectedId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sections = useRef<Partial<Record<Category, HTMLElement>>>({});
  const [active, setActive] = useState<Category>(CATEGORIES[0].id);

  const handlePress = useCallback<PressHandler>(
    (event, block) =>
      press(event, {
        spriteId,
        begin: () => ({ stack: [createBlock(block.kind)], restore: null, origin: null, scriptId: null }),
        tap: () => dispatch({ type: "toggleScript", spriteId, scriptId: block.id, blocks: [block] }),
      }),
    [press, dispatch, spriteId]
  );

  // A category picked on the rail stays highlighted until the palette is scrolled by hand: near
  // the bottom, the palette cannot scroll far enough to bring the picked section to the top.
  const picked = useRef(false);
  const release = useCallback(() => {
    picked.current = false;
  }, []);

  // Highlight the category whose section is at the top of the palette.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || picked.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setActive(CATEGORIES[CATEGORIES.length - 1].id);
      return;
    }
    let current = CATEGORIES[0].id;
    for (const { id } of CATEGORIES) {
      const section = sections.current[id];
      if (section && section.offsetTop <= el.scrollTop + 16) current = id;
    }
    setActive(current);
  }, []);

  const jumpTo = (id: Category) => {
    const el = scrollRef.current;
    const section = sections.current[id];
    picked.current = true;
    setActive(id);
    if (el && section) el.scrollTo({ top: section.offsetTop - 8, behavior: "smooth" });
  };

  return (
    <div data-drop="palette" className="sidebar">
      <nav className="category-rail hidden sm:flex flex-col py-2 bg-white border-r border-gray-100" aria-label="Block categories">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`rail-item ${active === category.id ? "is-active" : ""}`}
            aria-current={active === category.id ? "true" : undefined}
            onClick={() => jumpTo(category.id)}
          >
            <span className={`rail-dot ${DOT[category.id]}`} />
            {category.label}
          </button>
        ))}
      </nav>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={release}
        onTouchStart={release}
        onPointerDown={release}
        onKeyDown={release}
        className="palette thin-scroll"
      >
        {CATEGORIES.map((category) => (
          <section
            key={category.id}
            ref={(el) => {
              if (el) sections.current[category.id] = el;
            }}
            className="pt-2 pb-4"
          >
            <h2 className="palette-title">{category.label}</h2>
            <div className="flex flex-col items-start gap-2.5">
              {category.kinds.map((kind) => (
                <BlockView key={kind} block={TEMPLATES[kind]} mode="palette" onPress={handlePress} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {session && zone === "palette" && (
        <div className="trash-overlay">
          <span className="trash-badge">
            <Icon name="trash-alt" size={22} />
          </span>
          Drop to delete
        </div>
      )}
    </div>
  );
}
