/**
 * Root reducer. The editor model lives in `project` and the running
 * animation lives in `runtime`; both are plain data, updated immutably.
 */
import { fenced, touchingPairs, wrapDirection } from "../engine/geometry.ts";
import {
  createRuntime,
  forgetSprite,
  greenFlag,
  spriteClicked,
  stopAll,
  tick,
  toggleScript,
} from "../engine/runtime.ts";
import type { AppState, Block, Project, Script, Sprite } from "../model/types.ts";

export type SpritePatch = Partial<Pick<Sprite, "name" | "x" | "y" | "direction">>;

export type Action =
  | { type: "selectSprite"; spriteId: string }
  | { type: "addSprite"; sprite: Sprite }
  | { type: "removeSprite"; spriteId: string }
  | { type: "updateSprite"; spriteId: string; patch: SpritePatch }
  | { type: "editScripts"; spriteId: string; edit: (scripts: Script[]) => Script[] }
  | { type: "setHeroEnabled"; enabled: boolean }
  | { type: "loadProject"; project: Project }
  | { type: "greenFlag" }
  | { type: "stopAll" }
  | { type: "spriteClicked"; spriteId: string }
  | { type: "toggleScript"; spriteId: string; scriptId: string; blocks: Block[] }
  | { type: "tick"; now: number };

export const initState = (project: Project): AppState => ({ project, runtime: createRuntime() });

function patchSprite(sprite: Sprite, patch: SpritePatch): Sprite {
  const next = { ...sprite, ...patch };
  const name = next.name.trim() === "" ? sprite.name : next.name.trim();
  return { ...next, name, ...fenced(next.x, next.y), direction: wrapDirection(next.direction) };
}

export function reducer(state: AppState, action: Action): AppState {
  const { project } = state;
  switch (action.type) {
    case "selectSprite":
      return { ...state, project: { ...project, selectedId: action.spriteId } };
    case "addSprite": {
      const sprites = [...project.sprites, action.sprite];
      return {
        project: { ...project, sprites, selectedId: action.sprite.id },
        // Appearing on top of a running sprite is not a collision.
        runtime: { ...state.runtime, touching: touchingPairs(sprites) },
      };
    }
    case "removeSprite": {
      const index = project.sprites.findIndex((s) => s.id === action.spriteId);
      // Like Scratch, a project always keeps at least one sprite.
      if (index === -1 || project.sprites.length === 1) return state;
      const sprites = project.sprites.filter((s) => s.id !== action.spriteId);
      const selectedId =
        project.selectedId === action.spriteId ? sprites[Math.min(index, sprites.length - 1)].id : project.selectedId;
      return {
        project: { ...project, sprites, selectedId },
        runtime: forgetSprite(state.runtime, action.spriteId),
      };
    }
    case "updateSprite":
      return {
        ...state,
        project: {
          ...project,
          sprites: project.sprites.map((s) => (s.id === action.spriteId ? patchSprite(s, action.patch) : s)),
        },
      };
    case "editScripts":
      return {
        ...state,
        project: {
          ...project,
          sprites: project.sprites.map((s) =>
            s.id === action.spriteId ? { ...s, scripts: action.edit(s.scripts) } : s
          ),
        },
      };
    case "setHeroEnabled":
      return { ...state, project: { ...project, heroEnabled: action.enabled } };
    case "loadProject":
      return { project: action.project, runtime: { ...createRuntime(), nextToken: state.runtime.nextToken } };
    case "greenFlag":
      return greenFlag(state);
    case "stopAll":
      return stopAll(state);
    case "spriteClicked":
      return spriteClicked(state, action.spriteId);
    case "toggleScript":
      return toggleScript(state, action.spriteId, action.scriptId, action.blocks);
    case "tick":
      return tick(state, action.now);
  }
}
