/**
 * Block catalog: every block the editor knows about, how it is drawn and
 * which inputs it takes. Only the blocks requested by the challenge exist.
 *
 * A block spec has:
 *   - category: palette section and colour
 *   - shape:    "hat" (starts a script), "stack" (regular) or "c" (wraps a body)
 *   - parts:    label pieces, rendered left to right
 *   - defaults: initial value for every input
 */
import type { Block } from "../model/types.ts";

export type BlockKind =
  | "event_whenflagclicked"
  | "event_whenthisspriteclicked"
  | "motion_movesteps"
  | "motion_turnright"
  | "motion_turnleft"
  | "motion_gotoxy"
  | "looks_sayforsecs"
  | "looks_thinkforsecs"
  | "control_repeat";

export type Category = "events" | "motion" | "looks" | "control";
export type Shape = "hat" | "stack" | "c";
export type InputType = "number" | "text";

export type LabelPart =
  | { type: "text"; value: string }
  | { type: "icon"; name: string }
  | { type: "input"; name: string; input: InputType };

export interface BlockSpec {
  category: Category;
  shape: Shape;
  parts: LabelPart[];
  defaults: Record<string, string>;
}

const text = (value: string): LabelPart => ({ type: "text", value });
const number = (name: string): LabelPart => ({ type: "input", name, input: "number" });
const string = (name: string): LabelPart => ({ type: "input", name, input: "text" });
const icon = (name: string): LabelPart => ({ type: "icon", name });

export const BLOCK_SPECS: Record<BlockKind, BlockSpec> = {
  event_whenflagclicked: {
    category: "events",
    shape: "hat",
    parts: [text("when"), icon("flag"), text("clicked")],
    defaults: {},
  },
  event_whenthisspriteclicked: {
    category: "events",
    shape: "hat",
    parts: [text("when this sprite clicked")],
    defaults: {},
  },
  motion_movesteps: {
    category: "motion",
    shape: "stack",
    parts: [text("move"), number("STEPS"), text("steps")],
    defaults: { STEPS: "10" },
  },
  motion_turnright: {
    category: "motion",
    shape: "stack",
    parts: [text("turn"), icon("redo"), number("DEGREES"), text("degrees")],
    defaults: { DEGREES: "15" },
  },
  motion_turnleft: {
    category: "motion",
    shape: "stack",
    parts: [text("turn"), icon("undo"), number("DEGREES"), text("degrees")],
    defaults: { DEGREES: "15" },
  },
  motion_gotoxy: {
    category: "motion",
    shape: "stack",
    parts: [text("go to x:"), number("X"), text("y:"), number("Y")],
    defaults: { X: "0", Y: "0" },
  },
  looks_sayforsecs: {
    category: "looks",
    shape: "stack",
    parts: [text("say"), string("MESSAGE"), text("for"), number("SECS"), text("seconds")],
    defaults: { MESSAGE: "Hello!", SECS: "2" },
  },
  looks_thinkforsecs: {
    category: "looks",
    shape: "stack",
    parts: [text("think"), string("MESSAGE"), text("for"), number("SECS"), text("seconds")],
    defaults: { MESSAGE: "Hmm...", SECS: "2" },
  },
  control_repeat: {
    category: "control",
    shape: "c",
    parts: [text("repeat"), number("TIMES")],
    defaults: { TIMES: "10" },
  },
};

export interface CategoryInfo {
  id: Category;
  label: string;
  kinds: BlockKind[];
}

export const CATEGORIES: CategoryInfo[] = [
  { id: "events", label: "Events", kinds: ["event_whenflagclicked", "event_whenthisspriteclicked"] },
  {
    id: "motion",
    label: "Motion",
    kinds: ["motion_movesteps", "motion_turnright", "motion_turnleft", "motion_gotoxy"],
  },
  { id: "looks", label: "Looks", kinds: ["looks_sayforsecs", "looks_thinkforsecs"] },
  { id: "control", label: "Control", kinds: ["control_repeat"] },
];

export const isHat = (block: Block | undefined): boolean =>
  block !== undefined && BLOCK_SPECS[block.kind].shape === "hat";
