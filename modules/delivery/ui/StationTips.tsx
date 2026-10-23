"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PinButton } from "@amax/ui";
import type { Tip } from "./stage-times";

type Shown = { tip: Tip; x: number; y: number; release: string };
const local = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 074 AC-27: a station's details on hover, keyboard focus and tap. The tooltip can be hovered (it sits
// inside the map), stays until the pointer leaves or focus moves on, and Esc or a tap elsewhere closes it.
export function StationTips({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = (target: EventTarget | null) => {
    const g = (target as Element | null)?.closest?.<SVGGElement | HTMLElement>("[data-tip]");
    if (!g || !box.current) return;
    const r = g.getBoundingClientRect(), b = box.current.getBoundingClientRect();
    setShown({ tip: JSON.parse(g.getAttribute("data-tip")!), release: g.getAttribute("data-release") ?? "", x: r.left - b.left + r.width / 2 + box.current.scrollLeft, y: r.bottom - b.top + 6 });
  };
  useEffect(() => {
    if (!shown) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setShown(null); };
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setShown(null); };
    document.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("pointerdown", away); };
  }, [shown]);
  return (
    <div className="maptips" ref={box} onPointerOver={(e) => show(e.target)} onFocus={(e) => show(e.target)} onClick={(e) => show(e.target)}
      onPointerLeave={() => setShown(null)} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setShown(null); }}>
      {children}
      {shown && (
        <div className="stationtip pinnable" role="tooltip" style={{ left: shown.x, top: shown.y }}>
          <b>{shown.tip.title}</b>
          {shown.tip.at && <span>{local(shown.tip.at)}</span>}
          {shown.tip.lines.map((l) => <span key={l}>{l}</span>)}
          {shown.tip.deploymentId && <PinButton inline pin={{ label: `${shown.release} ${shown.tip.title}`, tool: "get_deployment", args: { deploymentId: shown.tip.deploymentId } }} />}
        </div>
      )}
    </div>
  );
}
