import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { boardLanes } from "./server/board";
import { ctxFor } from "./server/context";
import { BOARD_PHASES } from "./server/lane-of";
import { addBoardLane, moveBoardLane, removeBoardLane, renameBoardLane } from "./server/lanes";
import { getProject } from "./server/queries";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const write = { scope: "write" as const, permission: "delivery:board:edit" };

async function listBoardLanes(v: Viewer, projectKey: string) {
  const data = await getProject(v, projectKey);
  if (!data) return null;
  return boardLanes(data.lanes, data.proposals).map((l) => ({ phase: l.phase, lane: l.name, own: l.custom, cards: l.cards.map((c) => c.key) }));
}

// 074 AC-21: a project's own board lanes, for people in chat and for agents, with the same permission.
export const laneTools: McpToolDef[] = [
  tool({ scope: "read", readOnly: true, permission: "delivery:read", pin: "view", name: "list_board_lanes", description: "A project's board lanes in order: each phase's default lane, then the board's own lanes in that phase, with the cards in each.",
    input: z.object({ projectKey: z.string() }), run: (v, a) => listBoardLanes(v, a.projectKey) }),
  tool({ ...write, name: "add_board_lane", description: "Add a lane to a project's board inside a phase before Released (proposed, planned, building, verified), e.g. Code review in building. position counts among that phase's own lanes (default: last). PM or Admin.",
    input: z.object({ projectKey: z.string(), phase: z.enum(BOARD_PHASES as [string, ...string[]]), name: z.string(), position: z.number().int().min(1).optional() }),
    service: addBoardLane, run: (v, a, s = "mcp") => addBoardLane(ctxFor(v, s), a) }),
  tool({ ...write, name: "rename_board_lane", description: "Rename one of a board's own lanes. A phase's default lane keeps its name.",
    input: z.object({ projectKey: z.string(), lane: z.string(), name: z.string() }), service: renameBoardLane, run: (v, a, s = "mcp") => renameBoardLane(ctxFor(v, s), a) }),
  tool({ ...write, name: "move_board_lane", description: "Move one of a board's own lanes left or right among its phase's own lanes.",
    input: z.object({ projectKey: z.string(), lane: z.string(), direction: z.enum(["left", "right"]) }), service: moveBoardLane, run: (v, a, s = "mcp") => moveBoardLane(ctxFor(v, s), a) }),
  tool({ ...write, destructive: true, name: "remove_board_lane", description: "Remove one of a board's own lanes. Its cards go back to the phase's default lane; their phase doesn't change.",
    input: z.object({ projectKey: z.string(), lane: z.string() }), service: removeBoardLane, run: (v, a, s = "mcp") => removeBoardLane(ctxFor(v, s), a) }),
];
