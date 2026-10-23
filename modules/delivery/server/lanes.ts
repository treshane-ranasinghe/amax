import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { BOARD_PHASES, boardOf, customLane, isPhaseName, nameFree, ordered, renumber } from "./lane-of";

const Name = z.string().trim().min(1).max(40).refine((n) => !isPhaseName(n), "a lane can't take a phase's name");

const lane = { scoped: true, action: "delivery:board:edit", resource: "delivery.lane" } as const;

// 074 AC-19: a new lane inside a phase before Released, after the phase's default lane and any lanes before `position`.
export const addBoardLane = defineService({
  ...lane, name: "delivery.lane.add",
  input: z.object({ projectKey: z.string(), phase: z.enum(BOARD_PHASES as [string, ...string[]]), name: Name, position: z.number().int().min(1).optional() }),
  async run(tx, a, ctx) {
    const projectId = await boardOf(tx, ctx, a.projectKey);
    await nameFree(tx, projectId, a.name);
    const ids = await ordered(tx, projectId, a.phase);
    const [l] = await tx.execute(sql`insert into delivery.lane (tenant_id, project_id, phase, name, position) values (${ctx.tenantId}, ${projectId}, ${a.phase}, ${a.name}, ${ids.length + 1}) returning id`);
    ids.splice(Math.min((a.position ?? ids.length + 1) - 1, ids.length), 0, l.id as string);
    await renumber(tx, ids);
    return { result: { lane: a.name, phase: a.phase, position: ids.indexOf(l.id as string) + 1 }, resourceId: l.id as string, after: a };
  },
});

export const renameBoardLane = defineService({
  ...lane, name: "delivery.lane.rename",
  input: z.object({ projectKey: z.string(), lane: z.string(), name: Name }),
  async run(tx, a, ctx) {
    const projectId = await boardOf(tx, ctx, a.projectKey);
    const l = await customLane(tx, projectId, a.lane);
    await nameFree(tx, projectId, a.name, l.id);
    await tx.execute(sql`update delivery.lane set name = ${a.name} where id = ${l.id}`);
    return { result: { lane: a.name }, resourceId: l.id as string, before: { name: l.name }, after: { name: a.name } };
  },
});

// AC-20: left or right among the phase's own lanes; the default lane stays first.
export const moveBoardLane = defineService({
  ...lane, name: "delivery.lane.move",
  input: z.object({ projectKey: z.string(), lane: z.string(), direction: z.enum(["left", "right"]) }),
  async run(tx, a, ctx) {
    const projectId = await boardOf(tx, ctx, a.projectKey);
    const l = await customLane(tx, projectId, a.lane);
    const ids = await ordered(tx, projectId, l.phase as string);
    const at = ids.indexOf(l.id as string), to = a.direction === "left" ? at - 1 : at + 1;
    if (to < 0 || to >= ids.length) throw new Error(`${l.name as string} is already the ${a.direction === "left" ? "first" : "last"} of ${l.phase as string}'s own lanes`);
    [ids[at], ids[to]] = [ids[to], ids[at]];
    await renumber(tx, ids);
    return { result: { lane: l.name as string, position: to + 1 }, resourceId: l.id as string, before: { position: at + 1 }, after: { position: to + 1 } };
  },
});

// AC-20: its cards go back to the phase's default lane; nothing else about them changes.
export const removeBoardLane = defineService({
  ...lane, name: "delivery.lane.remove",
  input: z.object({ projectKey: z.string(), lane: z.string() }),
  async run(tx, a, ctx) {
    const projectId = await boardOf(tx, ctx, a.projectKey);
    const l = await customLane(tx, projectId, a.lane);
    const moved = await tx.execute(sql`update delivery.proposal set lane_id = null, updated_at = now() where lane_id = ${l.id} returning key`);
    await tx.execute(sql`delete from delivery.lane where id = ${l.id}`);
    await renumber(tx, await ordered(tx, projectId, l.phase as string));
    return { result: { removed: l.name as string, cardsMoved: moved.map((p) => p.key as string) }, resourceId: l.id as string, before: { name: l.name, phase: l.phase } };
  },
});
