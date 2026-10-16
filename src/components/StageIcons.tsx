import React from "react";

interface IconProps {
  size?: number;
}

/** Scratch's green flag. */
export function GreenFlag({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 3.2v17.6" stroke="#45993d" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M6 4.6c2.4-1.5 4.9-1.5 7.4 0s4.9 1.5 7.1 0v9.2c-2.2 1.5-4.7 1.5-7.1 0s-5-1.5-7.4 0z"
        fill="#4cbf56"
        stroke="#45993d"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Scratch's red stop sign. */
export function StopSign({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8.3 2.5h7.4l5.8 5.8v7.4l-5.8 5.8H8.3l-5.8-5.8V8.3z"
        fill="#ec5959"
        stroke="#b84848"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
