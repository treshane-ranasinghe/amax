import { sql } from "drizzle-orm";
import { canEver, type Viewer } from "@amax/auth";
import { listProjectRefs, type RevenueByProject, type RevenueQuery } from "@amax/delivery/contracts";
import { listContractRefs } from "../contracts";
import { read, todayOf } from "./read";
import { fx } from "./totals";

// 074 AC-7–AC-9: each project's contract value in the target currency, from the contracts the viewer
// may read. A contract whose currency has no stored rate is left out and named, never added in.
export async function revenueByProject(v: Viewer, q: RevenueQuery): Promise<RevenueByProject> {
  if (!canEver(v, "finance:read")) return { access: false, currency: null, parts: [], leftOut: [] };
  return read(v, async (tx) => {
    const on = await todayOf(tx);
    const [s] = await tx.execute(sql`select target_currency from finance.settings`);
    const contracts = (await listContractRefs(tx, v)).filter((c) => q.projectIds.includes(c.projectId));
    const target = String(s?.target_currency ?? contracts[0]?.currency ?? "USD");
    const rates = new Map<string, number | null>();
    for (const cur of new Set(contracts.map((c) => c.currency))) {
      const [r] = await tx.execute(sql`select ${fx(sql`${cur}::text`, target, on)} as rate`);
      rates.set(cur, r.rate === null ? null : Number(r.rate));
    }
    const parts = new Map<string, number>();
    for (const c of contracts) {
      const rate = rates.get(c.currency);
      if (rate !== null && rate !== undefined) parts.set(c.projectId, (parts.get(c.projectId) ?? 0) + Number(c.value) * rate);
    }
    return {
      access: true,
      currency: target,
      parts: [...parts].map(([projectId, value]) => ({ projectId, value: Math.round(value * 100) / 100 })),
      leftOut: contracts.filter((c) => rates.get(c.currency) === null).map((c) => ({ contractId: c.id, projectId: c.projectId, currency: c.currency })),
    };
  });
}

/** get_revenue_by_project: the same answer for active projects, optionally one client's, with names. */
export async function revenueForClient(v: Viewer, client?: string) {
  const projects = await read(v, (tx) => listProjectRefs(tx));
  const shown = projects.filter((p) => !client || p.client === client);
  const r = await revenueByProject(v, { projectIds: shown.map((p) => p.id) });
  const name = new Map(shown.map((p) => [p.id, p.name]));
  return { ...r, parts: r.parts.map((p) => ({ ...p, project: name.get(p.projectId) ?? null })), leftOut: r.leftOut.map((l) => ({ ...l, project: name.get(l.projectId) ?? null })) };
}
