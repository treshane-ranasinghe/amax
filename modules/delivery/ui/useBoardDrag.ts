"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { announce, onChatDecided, openChat, type PinRef } from "@amax/ui";
import type { Phase } from "../contracts";
import { movePrompt, refusal, step, type DragCard, type DropLane } from "./drag-rules";

type Moving = { key: string; to: number };
type Card = DragCard & { pin: PinRef };

// 074 AC-12–AC-15: pointer, touch and keyboard moves. A drop never writes: it opens chat with the move
// filled in, and the card waits in its new lane until chat confirms (it stays) or cancels (it goes back).
export function useBoardDrag(lanes: DropLane[], label: (p: Phase) => string) {
  const [pending, setPending] = useState<Moving | null>(null);
  const [held, setHeld] = useState<Moving | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useEffect(() => onChatDecided((d) => {
    if (!pending || d.tool !== "move_proposal" || d.input.key !== pending.key) return;
    if (d.state !== "done") announce(`${pending.key} stays where it was`);
    setPending(null);
  }), [pending]);

  const drop = (card: Card, to: number | null) => {
    setHeld(null);
    setOver(null);
    if (to === null) return;
    const why = refusal(card, lanes[to], label(card.phase));
    if (why) { if (!why.includes("already in")) announce(why); return; }
    setPending({ key: card.key, to });
    openChat({ pin: card.pin, prompt: movePrompt(card.key, lanes[to]) });
    announce(`Moving ${card.key} to ${lanes[to].name}. Confirm it in chat.`);
  };
  const laneAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-lane-index]");
    return el ? Number(el.dataset.laneIndex) : null;
  };

  const handle = (card: Card, from: number) => ({
    picked: held?.key === card.key,
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const move = (m: globalThis.PointerEvent) => setOver(laneAt(m.clientX, m.clientY));
      const up = (u: globalThis.PointerEvent) => { el.removeEventListener("pointermove", move); drop(card, laneAt(u.clientX, u.clientY)); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up, { once: true });
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const at = held?.key === card.key ? held.to : null;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (at === null) { setHeld({ key: card.key, to: from }); announce(`${card.key} picked up. ${lanes[from].name}. Left and Right choose a lane, Space drops, Escape cancels.`); }
        else drop(card, at === from ? null : at);
      } else if (at !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        const next = step(card, lanes, at, e.key === "ArrowRight" ? 1 : -1);
        if (next !== null) { setHeld({ key: card.key, to: next }); announce(`${lanes[next].name}${lanes[next].custom ? `, in ${label(lanes[next].phase)}` : ""}`); }
      } else if (at !== null && e.key === "Escape") { setHeld(null); announce(`${card.key} put back`); }
    },
  });

  return { pending, held, over, handle, cancel: () => { if (pending) announce(`${pending.key} stays where it was`); setPending(null); } };
}
