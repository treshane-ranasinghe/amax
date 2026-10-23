"use client";

import type { Phase } from "../contracts";
import { proposalPin } from "../pins";
import type { BoardLane } from "../server/board";
import { canDrag } from "./drag-rules";
import { BoardCard } from "./BoardCard";
import { AddLane, LaneHead } from "./LaneHead";
import { useBoardDrag } from "./useBoardDrag";

type Props = { projectKey: string; lanes: BoardLane[]; labels: Record<Phase, string>; canMove: boolean; canEdit: boolean };

// 074 AC-12–AC-15, AC-23: the project board. Lanes are grouped by phase; cards drag between them.
export function Board({ projectKey, lanes, labels, canMove, canEdit }: Props) {
  const label = (p: Phase) => labels[p];
  const { pending, held, over, handle, cancel } = useBoardDrag(lanes, label);
  const pin = { label: `${projectKey} board lanes`, tool: "list_board_lanes", args: { projectKey } };
  const movingKey = pending?.key;
  return (
    <div className="board lanes" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(220px, 1fr))` }}>
      {lanes.map((lane, i) => {
        const cards = lane.cards.filter((c) => c.key !== movingKey);
        const moving = pending?.to === i ? lanes.flatMap((l) => l.cards).find((c) => c.key === movingKey) : undefined;
        const lastOfPhase = lanes[i + 1]?.phase !== lane.phase;
        const target = over === i || held?.to === i;
        return (
          <section className={`lane${target ? " target" : ""}`} key={`${lane.phase}:${lane.name}`} data-lane-index={i} aria-label={`${lane.name}${lane.custom ? `, in ${label(lane.phase)}` : ""}, ${cards.length + (moving ? 1 : 0)}`}>
            <LaneHead projectKey={projectKey} phase={lane.phase} phaseLabel={label(lane.phase)} name={lane.name} custom={lane.custom} count={cards.length + (moving ? 1 : 0)} canEdit={canEdit} pin={pin} />
            {cards.map((p) => (
              <BoardCard key={p.id} p={p} canMove={canMove}
                handle={canDrag(p, canMove) ? { label: `Move ${p.key}, ${p.title}`, ...handle({ ...p, pin: proposalPin(p) }, i) } : undefined} />
            ))}
            {moving && <BoardCard p={moving} canMove={canMove} pending={{ onCancel: cancel }} />}
            {canEdit && lastOfPhase && lane.phase !== "released" && <AddLane projectKey={projectKey} phaseLabel={label(lane.phase)} pin={pin} />}
          </section>
        );
      })}
    </div>
  );
}
