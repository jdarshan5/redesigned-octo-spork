import test from "node:test";
import assert from "node:assert/strict";
import { createHeroDemoProject, createSprite, nextSpriteHue, nextSpriteName, SPRITE_HUES } from "./project.ts";

test("new sprites get a free name and a colour no other sprite uses", () => {
  const first = createSprite({ name: "Sprite1" });
  const second = createSprite({ name: "Sprite2", hue: SPRITE_HUES[1] });
  assert.equal(nextSpriteName([first, second]), "Sprite3");
  assert.equal(nextSpriteHue([first, second]), SPRITE_HUES[2]);

  const everyHue = SPRITE_HUES.map((hue, i) => createSprite({ name: `S${i}`, hue }));
  assert.equal(nextSpriteHue(everyHue), SPRITE_HUES[everyHue.length % SPRITE_HUES.length], "colours cycle once all are used");
});

test("the hero demo uses two differently coloured sprites", () => {
  const [a, b] = createHeroDemoProject().sprites;
  assert.notEqual(a.hue, b.hue);
});
