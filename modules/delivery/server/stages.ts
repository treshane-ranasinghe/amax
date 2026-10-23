import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { byLine } from "./activity";

export type StageRecord = { status: string; at: string; note: string | null; run: string | null; firstAt: string; deploymentId: string; count: number; recordedBy: string };

const kindOf = (actor: string) => (actor.startsWith("user:") ? "user" : actor.startsWith("sp:") ? "service" : actor.startsWith("agent:") ? "agent" : "system");

/**
 * 074 AC-26, AC-28: per release and environment, the latest live (not voided) deployment, the first
 * one, how many there were, and who recorded the latest, by today's names ("Claude for Nimal").
 */
export async function liveStages(tx: Tx): Promise<Map<string, StageRecord>> {
  const rows = await tx.execute(sql`select l.*, au.name as actor_name, sp.name as principal_name, fu.name as for_name from (
      select d.*, split_part(d.recorded_by, ' for ', 1) as actor, substring(d.recorded_by from ' for user:([0-9a-f-]{36})') as for_id,
        row_number() over w as rn, count(*) over (partition by d.release_id, d.environment_id) as n, min(d.at) over (partition by d.release_id, d.environment_id) as first_at
      from delivery.deployment d where d.voided_at is null window w as (partition by d.release_id, d.environment_id order by d.at desc)) l
    left join auth.user au on l.actor like 'user:%' and au.id::text = substr(l.actor, 6)
    left join auth.service_principal sp on l.actor like 'sp:%' and sp.id::text = substr(l.actor, 4)
    left join auth.user fu on fu.id::text = l.for_id
    where l.rn = 1`);
  return new Map(rows.map((r) => [`${r.release_id as string}:${r.environment_id as string}`, {
    status: r.status as string, at: new Date(r.at as string).toISOString(), note: (r.note as string | null) ?? null, run: (r.pipeline_run as string | null) ?? null,
    firstAt: new Date(r.first_at as string).toISOString(), deploymentId: r.id as string, count: Number(r.n),
    recordedBy: byLine({ actor_kind: kindOf(r.actor as string), actor_id: r.actor as string, actor_name: r.actor_name, principal_name: r.principal_name, for_name: r.for_name }),
  }]));
}
