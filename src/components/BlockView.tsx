import React, { memo } from "react";
import { BLOCK_SPECS, type BlockSpec, type InputType } from "../blocks/catalog.ts";
import type { Block } from "../model/types.ts";
import Icon from "./Icon.tsx";
import { GreenFlag } from "./StageIcons.tsx";

/** Blocks whose id starts with this prefix are drawn as the grey snap preview. */
export const GHOST_PREFIX = "ghost:";
const isGhost = (id: string) => id.startsWith(GHOST_PREFIX);

const NUMBER_DRAFT = /^-?\d*\.?\d*$/;

export type BlockMode = "palette" | "workspace" | "drag";
export type PressHandler = (event: React.PointerEvent<HTMLDivElement>, block: Block) => void;
export type MenuHandler = (event: React.MouseEvent<HTMLDivElement>, block: Block) => void;
export type InputHandler = (blockId: string, name: string, value: string) => void;

interface BlockInputProps {
  block: Block;
  name: string;
  input: InputType;
  readOnly: boolean;
  onInput?: InputHandler;
}

function BlockInput({ block, name, input, readOnly, onInput }: BlockInputProps) {
  const value = block.inputs[name] ?? "";
  const isNumber = input === "number";
  const commit = (next: string) => onInput && onInput(block.id, name, next);
  return (
    <span className="blk-field" data-value={value}>
      <input
        className="blk-input"
        size={1}
        value={value}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : 0}
        // The full keyboard even for numbers: iOS's decimal pad has no minus key, so "move -10" could not be typed.
        aria-label={name.toLowerCase()}
        spellCheck={false}
        onPointerDown={readOnly ? undefined : (e) => e.stopPropagation()}
        onContextMenu={readOnly ? undefined : (e) => e.stopPropagation()}
        onChange={(e) => {
          const next = e.target.value;
          if (isNumber && !NUMBER_DRAFT.test(next)) return;
          commit(next);
        }}
        onBlur={() => {
          if (isNumber && (value.trim() === "" || !Number.isFinite(Number(value)))) commit("0");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </span>
  );
}

interface BlockLabelProps {
  block: Block;
  spec: BlockSpec;
  readOnly: boolean;
  onInput?: InputHandler;
}

function BlockLabel({ block, spec, readOnly, onInput }: BlockLabelProps) {
  return (
    <div className="blk-label">
      {spec.parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        if (part.type === "icon") {
          return part.name === "flag" ? (
            <GreenFlag key={i} size={18} />
          ) : (
            <Icon key={i} name={part.name} size={13} className="text-white" />
          );
        }
        return (
          <BlockInput key={i} block={block} name={part.name} input={part.input} readOnly={readOnly} onInput={onInput} />
        );
      })}
    </div>
  );
}

export interface BlockViewProps {
  block: Block;
  /** "drag" is the floating copy under the pointer. Inputs are editable in the workspace only. */
  mode: BlockMode;
  onPress?: PressHandler;
  onInput?: InputHandler;
  onMenu?: MenuHandler;
}

/** One block. C-blocks render their body as a nested StackView. */
export const BlockView = memo(function BlockView({ block, mode, onPress, onInput, onMenu }: BlockViewProps) {
  const spec = BLOCK_SPECS[block.kind];
  const ghost = isGhost(block.id);
  const inert = ghost || mode === "drag";
  const wrapProps = {
    // cat-* sets the category colours (see styles.css) for this block and its pieces.
    className: `blk-wrap blk-${mode} cat-${spec.category} ${ghost ? "is-ghost" : ""}`,
    "data-block-id": ghost ? undefined : block.id,
    "data-ghost": ghost ? "" : undefined,
    onPointerDown: !inert && onPress ? (e: React.PointerEvent<HTMLDivElement>) => onPress(e, block) : undefined,
    onContextMenu:
      !inert && onMenu
        ? (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            onMenu(e, block);
          }
        : undefined,
  };
  const label = <BlockLabel block={block} spec={spec} readOnly={inert || mode !== "workspace"} onInput={onInput} />;

  if (spec.shape === "c") {
    return (
      <div {...wrapProps}>
        <div className="blk blk-c-top">{label}</div>
        <div className="blk-c-middle">
          <div className="blk-c-arm" />
          <div className="blk-c-slot" data-c-inner={ghost ? undefined : block.id}>
            <StackView blocks={block.body || []} mode={mode} onPress={onPress} onInput={onInput} onMenu={onMenu} />
          </div>
        </div>
        <div className="blk blk-c-bottom" />
      </div>
    );
  }
  return (
    <div {...wrapProps}>
      <div className={`blk ${spec.shape === "hat" ? "blk-hat" : "blk-stack"}`}>{label}</div>
    </div>
  );
});

export interface StackViewProps extends Omit<BlockViewProps, "block"> {
  blocks: Block[];
}

export function StackView({ blocks, ...rest }: StackViewProps) {
  return (
    <div className="blk-list">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} {...rest} />
      ))}
    </div>
  );
}
