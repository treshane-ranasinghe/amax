import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { contextFor, defineService, getRuntime } from "@amax/core/server";
import { clockOf, lastWeeks } from "./queries";
import { openBacklog } from "./weekly";

const isMonday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1;

/**
 * Records every project's open backlog for the week that begins on `week` (074 AC-2). The first
 * snapshot of a week stands: running it again, later that week or twice at once, changes nothing.
 */
export const snapshotWeek = defineService({
  name: "delivery.weekly.snapshot",
  action: "delivery:weekly:snapshot",
  resource: "delivery.weekly_stat",
  input: z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isMonday, "week must be a Monday") }),
  async run(tx, input, ctx) {
    const open = await openBacklog(tx, input.week);
    // Every project gets a row, so a week with nothing open reads 0 rather than "no snapshot".
    const rows = await tx.execute(sql`insert into delivery.weekly_stat (tenant_id, project_id, week, planned)
      select ${ctx.tenantId}, pr.id, ${input.week}, coalesce(o.n, 0)
      from delivery.project pr left join jsonb_to_recordset(${JSON.stringify(open)}::jsonb) as o(project_id uuid, n int) on o.project_id = pr.id
      on conflict (tenant_id, project_id, week) do nothing returning project_id`);
    return { result: { week: input.week, written: rows.length }, resourceId: input.week, after: { week: input.week, projects: rows.length } };
  },
});

/** The Monday of the week `d` falls in (UTC), as YYYY-MM-DD. */
export const mondayOf = (d: Date) => lastWeeks(d, 1)[0].monday;

/** One run of the 029 schedule for a tenant: snapshot the current week as of the tenant's "today". */
export async function snapshotThisWeek(tenantId: string) {
  const today = await withTenant(getRuntime().db, tenantId, clockOf);
  return snapshotWeek(contextFor.job(tenantId, "delivery.weekly-snapshot"), { week: mondayOf(today) });
}
