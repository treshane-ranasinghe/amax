import { PHASES, type Phase } from "../contracts";
import { LANE_LABEL } from "./lane-of";
import type { LaneRow, ProposalRow } from "./queries";

export type BoardLane = { phase: Phase; name: string; custom: boolean; position: number; cards: ProposalRow[] };

/** 074 AC-23: every phase's lanes in board order, its default lane first, each with the cards in it. */
export function boardLanes(lanes: LaneRow[], proposals: ProposalRow[]): BoardLane[] {
  return PHASES.flatMap((phase) => {
    const own = lanes.filter((l) => l.phase === phase).sort((a, b) => a.position - b.position);
    const known = new Set(own.map((l) => l.name));
    const inPhase = proposals.filter((p) => p.phase === phase);
    return [
      { phase, name: LANE_LABEL[phase], custom: false, position: 0, cards: inPhase.filter((p) => !p.lane || !known.has(p.lane)) },
      ...own.map((l) => ({ phase, name: l.name, custom: true, position: l.position, cards: inPhase.filter((p) => p.lane === l.name) })),
    ];
  });
}
