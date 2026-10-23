import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { mcpTools } from "../mcp";
import { snapshotWeek } from "../server/snapshot";
import { tasksPerWeek } from "../server/weekly";
import { deliveryDb, T } from "./db";

const NOW = new Date("2026-10-16T15:00:00Z");
const OPEN = (monday: string) => sql`select count(*)::int as n from delivery.task t join delivery.proposal p on p.id = t.proposal_id
  where p.phase in ('planned', 'building') and coalesce(p.meta->>'withdrawn', 'false') <> 'true' and (not t.done or t.done_at >= ${monday})`;

describe.skipIf(!hasDb)("074 tasks per week (Postgres)", () => {
  let db: Awaited<ReturnType<typeof deliveryDb>>;
  let maya: Viewer;
  const q = (x: ReturnType<typeof sql>) => db.q(x);
  const sum = (rows: Record<string, unknown>[], k: string) => rows.reduce((n, r) => n + Number(r[k]), 0);

  beforeAll(async () => {
    db = await deliveryDb();
    maya = await db.as("maya", "PM");
  });
  afterAll(() => db?.t.drop());

  it("AC-1 a task closed this week counts at once, and a withdrawn proposal's never do", async () => {
    const before = (await tasksPerWeek(maya, {}, NOW)).done.at(-1)!;
    const [p] = await q(sql`select id from delivery.proposal where key = 'CON-011'`);
    await q(sql`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at, done_by) values (${T}, ${p.id}, 'T90', 'live', true, '2026-10-16T08:00:00Z', 'user:test')`);
    expect((await tasksPerWeek(maya, {}, NOW)).done.at(-1)).toBe(before + 1);
    await q(sql`update delivery.proposal set meta = meta || '{"withdrawn": true}'::jsonb where key = 'CON-011'`);
    expect((await tasksPerWeek(maya, {}, NOW)).done.at(-1)).toBeLessThan(before + 1);
    await q(sql`update delivery.proposal set meta = meta - 'withdrawn' where key = 'CON-011'`);
  });

  it("AC-2 the snapshot is written once per week by the job; the current week is live without writing", async () => {
    const [{ n: open }] = await q(OPEN("2026-10-19"));
    expect(await snapshotWeek(contextFor.job(T, "delivery.weekly-snapshot"), { week: "2026-10-19" })).toEqual({ week: "2026-10-19", written: 3 });
    expect(await snapshotWeek(contextFor.job(T, "delivery.weekly-snapshot"), { week: "2026-10-19" })).toEqual({ week: "2026-10-19", written: 0 });
    expect(sum(await q(sql`select planned from delivery.weekly_stat where week = '2026-10-19'`), "planned")).toBe(Number(open));
    await expect(snapshotWeek(contextFor.job(T, "delivery.weekly-snapshot"), { week: "2026-10-20" })).rejects.toThrow(/Monday/);
    const [{ n: live }] = await q(OPEN("2026-10-26"));
    expect((await tasksPerWeek(maya, {}, new Date("2026-10-28T12:00:00Z"))).planned.at(-1)).toBe(Number(live));
    expect(await q(sql`select 1 from delivery.weekly_stat where week = '2026-10-26'`)).toEqual([]);
  });

  it("AC-3 the clients' charts add up to the portfolio's, and the Closed tab shows none of it", async () => {
    const all = await tasksPerWeek(maya, {}, NOW);
    const parts = await Promise.all(["Contoso", "Wide World Importers", "Northwind HR"].map((client) => tasksPerWeek(maya, { client }, NOW)));
    expect(all.done.map((_, i) => parts.reduce((n, p) => n + p.done[i], 0))).toEqual(all.done);
    expect(all.planned.map((_, i) => parts.reduce((n, p) => n + (p.planned[i] ?? 0), 0))).toEqual(all.planned);
    expect((await tasksPerWeek(maya, { status: "closed" }, NOW)).done.every((n) => n === 0)).toBe(true);
  });

  it("AC-4 a past week with no snapshot has no Planned, and the first week with one is named", async () => {
    const far = await tasksPerWeek(maya, {}, new Date("2027-03-03T12:00:00Z"));
    expect(far.planned.slice(0, 7)).toEqual([null, null, null, null, null, null, null]);
    expect(far.plannedFrom).toBe(far.labels.at(-1));
    expect((await tasksPerWeek(maya, {}, NOW)).plannedFrom).toBeNull();
  });

  it("AC-6 get_tasks_per_week returns what the chart draws", async () => {
    const tool = mcpTools.find((x) => x.name === "get_tasks_per_week")!;
    await q(sql`insert into delivery.clock_pin (tenant_id, today) values (${T}, '2026-10-16') on conflict (tenant_id) do update set today = excluded.today`);
    expect(await tool.run(maya as never, { client: "Contoso" } as never, "mcp" as never)).toEqual(await tasksPerWeek(maya, { client: "Contoso" }));
  });
});
