import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";
import { PHASES, type Phase } from "../contracts";

const EDIT = "delivery:board:edit";

export const LANE_LABEL: Record<Phase, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released to Prod" };
export type BoardPhase = Exclude<Phase, "released">;
export const BOARD_PHASES = PHASES.filter((p): p is BoardPhase => p !== "released");

const phaseNamed = (name: string) => PHASES.find((p) => p === name.trim().toLowerCase() || LANE_LABEL[p].toLowerCase() === name.trim().toLowerCase() || (p === "released" && name.trim().toLowerCase() === "released"));
export const isPhaseName = (name: string) => phaseNamed(name) !== undefined;

export type LaneRef = { phase: BoardPhase; laneId: string | null; name: string };

/**
 * 074: a lane as a person or agent names it, ignoring case: a phase's default lane ("Building" or
 * "building") or one of the project's own lanes. Released to Prod is never a lane anyone moves into.
 */
export async function laneOf(tx: Tx, projectId: unknown, name: string): Promise<LaneRef> {
  const phase = phaseNamed(name);
  if (phase === "released") throw new Error("Released to Prod comes only from a Prod deployment, so nothing moves or starts there");
  if (phase) return { phase, laneId: null, name: LANE_LABEL[phase] };
  const [l] = await tx.execute(sql`select id, phase, name from delivery.lane where project_id = ${projectId} and lower(name) = lower(${name.trim()})`);
  if (!l) throw new Error(`this board has no lane called ${name}`);
  return { phase: l.phase as BoardPhase, laneId: l.id as string, name: l.name as string };
}

/** One of the project's own lanes by name, for the lane tools: default lanes are the phases themselves and can't be changed. */
export async function customLane(tx: Tx, projectId: unknown, name: string) {
  if (isPhaseName(name)) throw new Error(`${name} is a phase's default lane, so it can't be renamed, moved or removed`);
  const [l] = await tx.execute(sql`select * from delivery.lane where project_id = ${projectId} and lower(name) = lower(${name.trim()}) for update`);
  if (!l) throw new Error(`this board has no lane called ${name}`);
  return l;
}

export async function boardOf(tx: Tx, ctx: ServiceContext, key: string) {
  const [p] = await tx.execute(sql`select id from delivery.project where key = ${key} for update`);
  if (!p) throw new Error(`no project ${key}`);
  const v = viewerOf(ctx);
  if (v) assertCan(v, EDIT, { projectId: p.id as string });
  return p.id as string;
}

export async function nameFree(tx: Tx, projectId: string, name: string, except: unknown = null) {
  const [hit] = await tx.execute(sql`select name from delivery.lane where project_id = ${projectId} and lower(name) = lower(${name}) and id is distinct from ${except}`);
  if (hit) throw new Error(`this board already has a lane called ${hit.name as string}`);
}

export const ordered = (tx: Tx, projectId: string, phase: string) =>
  tx.execute(sql`select id from delivery.lane where project_id = ${projectId} and phase = ${phase} order by position, created_at`).then((r) => r.map((l) => l.id as string));
export const renumber = async (tx: Tx, ids: string[]) => { for (const [i, id] of ids.entries()) await tx.execute(sql`update delivery.lane set position = ${i + 1} where id = ${id}`); };
