import React, { useEffect, useRef } from "react";
import Icon from "./Icon.tsx";

export interface MenuItem {
  label: string;
  icon: string;
  danger?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const WIDTH = 176;
const ROW = 36;

/** A small right-click menu that closes on any outside press, scroll or Escape. */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture phase: blocks stop pointerdown from bubbling, but must still close the menu.
    const onPress = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - WIDTH - 8);
  const top = Math.min(y, window.innerHeight - items.length * ROW - 16);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="menu-pop fixed z-50 p-1 rounded-xl border border-gray-100 bg-white shadow-xl text-sm font-bold text-ink"
      style={{ left, top, width: WIDTH }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`w-full flex items-center gap-2.5 px-3 rounded-lg text-left ${
            item.danger ? "text-red-600 hover:bg-red-50" : "hover:bg-blue-50"
          }`}
          style={{ height: ROW }}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          <Icon name={item.icon} size={13} className={item.danger ? "text-red-500" : "text-gray-400"} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
