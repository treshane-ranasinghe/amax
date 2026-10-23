import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { ACTIVE, clockOf, endOfDay, lastWeeks, read } from "./queries";

// 074 A: "Tasks done per week". Done is live from delivery.task.done_at (a task once done stays done,
// 008), Planned is each project's open backlog at the start of the week, snapshotted on Mondays.

/** The Projects screen's filters: its client filter and its Active / Closed tab (074 AC-3). */
export type WeekFilter = { client?: string; status?: "active" | "closed" };
export type TasksPerWeek = { labels: string[]; weeks: string[]; planned: (number | null)[]; done: number[]; plannedFrom: string | null };

const shown = (f: WeekFilter) => sql`pr.status = ${f.status ?? "active"}${f.client ? sql` and pr.client = ${f.client}` : sql``}`;

/**
 * Per project, the tasks still open at the start of the week that begins on `monday`, on proposals in
 * Planned or Building (any lane). A task done during that week was still open when it began.
 */
export const openBacklog = (tx: Tx, monday: string, where = sql`true`) =>
  tx.execute(sql`select p.project_id, count(*)::int as n
    from delivery.task t join delivery.proposal p on p.id = t.proposal_id join delivery.project pr on pr.id = p.project_id
    where p.phase in ('planned', 'building') and ${ACTIVE} and (not t.done or t.done_at >= ${`${monday}T00:00:00Z`}) and ${where}
    group by p.project_id`);

/**
 * The last 8 weeks of Planned and Done for the projects the filters show (074 AC-1–AC-4). A past week
 * without a snapshot has no Planned (null, not 0); the current week without one is worked out live,
 * so a page load never writes. `plannedFrom` names the first week with a Planned value when earlier
 * weeks lack one.
 */
export const tasksPerWeek = (v: Viewer, f: WeekFilter = {}, now?: Date) =>
  read(v, async (tx): Promise<TasksPerWeek> => {
    const at = now ?? (await clockOf(tx));
    const weeks = lastWeeks(at);
    const first = weeks[0].monday;
    const done = await tx.execute(sql`select date_trunc('week', t.done_at at time zone 'UTC')::date::text as week, count(*)::int as n
      from delivery.task t join delivery.proposal p on p.id = t.proposal_id join delivery.project pr on pr.id = p.project_id
      where t.done and t.done_at >= ${`${first}T00:00:00Z`} and t.done_at < ${endOfDay(at)} and ${ACTIVE} and ${shown(f)} group by 1`);
    const snaps = await tx.execute(sql`select s.week::text as week, sum(s.planned)::int as n
      from delivery.weekly_stat s join delivery.project pr on pr.id = s.project_id where s.week >= ${first} and ${shown(f)} group by 1`);
    const planned = weeks.map((w): number | null => { const s = snaps.find((r) => r.week === w.monday); return s ? Number(s.n) : null; });
    if (planned[planned.length - 1] === null) planned[planned.length - 1] = (await openBacklog(tx, weeks[weeks.length - 1].monday, shown(f))).reduce((n, r) => n + Number(r.n), 0);
    const from = planned.findIndex((p) => p !== null);
    return {
      labels: weeks.map((w) => w.label),
      weeks: weeks.map((w) => w.monday),
      planned,
      done: weeks.map((w) => Number(done.find((r) => r.week === w.monday)?.n ?? 0)),
      plannedFrom: from > 0 ? weeks[from].label : null,
    };
  });
