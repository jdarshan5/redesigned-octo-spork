import React from "react";
import CatSprite from "./CatSprite.tsx";

interface SpriteArtProps {
  /** Hue rotation in degrees; 0 is the classic orange cat. */
  hue: number;
  width?: number;
  height?: number;
}

/** The cat costume, tinted per sprite so several sprites are easy to tell apart. */
export default function SpriteArt({ hue, width, height }: SpriteArtProps) {
  return (
    <span className="block leading-none" style={hue ? { filter: `hue-rotate(${hue}deg)` } : undefined}>
      <CatSprite width={width} height={height} />
    </span>
  );
}
