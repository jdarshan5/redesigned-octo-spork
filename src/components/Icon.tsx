import React from "react";

interface IconProps {
  /** A symbol id from public/icons/solid.svg (Font Awesome solid). */
  name: string;
  size?: number;
  className?: string;
}

export default function Icon({ name, size = 20, className = "" }: IconProps) {
  return (
    <svg className={`fill-current ${className}`} width={size} height={size} aria-hidden="true" focusable="false">
      <use xlinkHref={`/icons/solid.svg#${name}`} />
    </svg>
  );
}
