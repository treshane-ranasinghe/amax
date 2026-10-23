import type { Phase } from "../contracts";

export type DragCard = { key: string; phase: Phase; lane: string | null; source: string | null };
export type DropLane = { phase: Phase; name: string; custom: boolean };

const laneOfCard = (c: DragCard, phaseLabel: string) => c.lane ?? phaseLabel;

const blocked = (card: DragCard, lane: DropLane): string | null => {
  if (card.phase === "released") return `${card.key} is in Prod; it can't move back on the board`;
  if (lane.phase === "released") return "Released to Prod comes only from a Prod deployment";
  if (card.source && lane.phase !== card.phase) return `${card.key} comes from ${card.source}. Its phase follows the repo`;
  return null;
};

/** 074 AC-14: why a card can't go to a lane, or null when it can. Mirrors move_proposal's own refusals. */
export function refusal(card: DragCard, lane: DropLane, phaseLabel: string): string | null {
  if (lane.phase === card.phase && lane.name === laneOfCard(card, phaseLabel)) return `${card.key} is already in ${lane.name}`;
  return blocked(card, lane);
}

export const canDrag = (card: DragCard, canMove: boolean) => canMove && card.phase !== "released";

/** The chat prompt a drop fills in (AC-13): the lane's own name, so chat and agents name it the same way. */
export const movePrompt = (key: string, lane: DropLane) => `Move ${key} to ${lane.name}`;

/** AC-15: the next lane a keyboard move lands on, skipping lanes the card can't go to (its own lane is a way back); null when there is none that way. */
export function step(card: DragCard, lanes: DropLane[], from: number, dir: 1 | -1): number | null {
  for (let i = from + dir; i >= 0 && i < lanes.length; i += dir) if (!blocked(card, lanes[i])) return i;
  return null;
}
