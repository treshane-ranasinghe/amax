import { sql } from "drizzle-orm";
import { createDb, withTenant, type Tx } from "@amax/db";
import { lumen } from "@amax/testing";

// 074 e2e: a fictional project, Northwind Kiosk (NWK), seeded just for board.spec.ts so the other
// specs keep fixtures.md's numbers. It has cards in three phases, tasks closed over three weeks,
// weekly snapshots, a release that went to QA twice and is testing in UAT, and two contracts, one in
// EUR, which has no stored rate, so the revenue donut leaves it out and says so.
const T = lumen.tenant.id;
const LK = "11111111-1111-4111-8111-1111111111a1";

const PROPOSALS = [
  { key: "NWK-001", title: "Self-checkout screen", phase: "planned", open: 3, done: [] },
  { key: "NWK-002", title: "Receipt printer driver", phase: "planned", open: 1, done: [] },
  { key: "NWK-003", title: "Offline basket sync", phase: "proposed", open: 0, done: [] },
  { key: "NWK-004", title: "Loyalty card scan", phase: "building", open: 1, done: ["2026-09-30", "2026-10-07", "2026-10-13", "2026-10-15"] },
  { key: "NWK-005", title: "Price label import", phase: "verified", open: 0, done: ["2026-10-08"] },
] as const;
const DEPLOYS = [
  ["Dev", "deployed", "2026-10-05T09:00:00Z", null, null, "maya"],
  ["QA", "deployed", "2026-10-09T10:00:00Z", null, "2201", "nimal"],
  ["QA", "deployed", "2026-10-11T10:00:00Z", "Redeployed after a config fix", "2207", "nimal"],
  ["UAT", "testing", "2026-10-13T14:00:00Z", "Client sign-off pending", "2215", "maya"],
] as const;

const userId = async (tx: Tx, key: string) => (await tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0].id as string;

async function seed(tx: Tx) {
  const maya = await userId(tx, "maya"), nimal = await userId(tx, "nimal");
  const [p] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, manager_name, manager_user_id, color, legal_entity_id, sprint)
    values (${T}, 'NWK', 'Northwind Kiosk', 'Northwind Traders', 'fixed', 'Maya Fernando', ${maya}, 'mint', ${LK}, 'Sprint 3') on conflict (tenant_id, key) do nothing returning id`);
  if (!p) return;
  const env: Record<string, string> = {};
  for (const [i, name] of ["Dev", "QA", "UAT", "Prod"].entries())
    env[name] = (await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod) values (${T}, ${p.id}, ${name}, ${i + 1}, ${name === "Prod"}) returning id`))[0].id as string;
  const [r] = await tx.execute(sql`insert into delivery.release (tenant_id, project_id, version) values (${T}, ${p.id}, 'v1.0.0') returning id`);
  for (const x of PROPOSALS) {
    const [row] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, phase, tasks_done, tasks_total, owner_name, release_id)
      values (${T}, ${p.id}, ${x.key}, ${x.title}, ${x.phase}, ${x.done.length}, ${x.done.length + x.open}, 'Nimal Silva', ${x.phase === "verified" ? r.id : null}) returning id`);
    let n = 1;
    for (const day of x.done) await tx.execute(sql`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at, done_by) values (${T}, ${row.id}, ${`T${n}`}, ${`Task ${n++}`}, true, ${`${day}T11:00:00Z`}, ${`user:${nimal}`})`);
    for (let k = 0; k < x.open; k++) await tx.execute(sql`insert into delivery.task (tenant_id, proposal_id, ref, title) values (${T}, ${row.id}, ${`T${n}`}, ${`Task ${n++}`})`);
  }
  for (const [week, planned] of [["2026-09-28", 4], ["2026-10-05", 5], ["2026-10-12", 6]] as const)
    await tx.execute(sql`insert into delivery.weekly_stat (tenant_id, project_id, week, planned) values (${T}, ${p.id}, ${week}, ${planned}) on conflict do nothing`);
  for (const [name, status, at, note, run, who] of DEPLOYS)
    await tx.execute(sql`insert into delivery.deployment (tenant_id, release_id, environment_id, status, at, note, pipeline_run, recorded_by)
      values (${T}, ${r.id}, ${env[name]}, ${status}, ${at}, ${note}, ${run}, ${who === "maya" ? `user:${maya}` : `agent:claude for user:${nimal}`})`);
  for (const [currency, value] of [["USD", "96000"], ["EUR", "12000"]] as const)
    await tx.execute(sql`insert into finance.contract (tenant_id, legal_entity_id, project_id, client, kind, currency, value, starts_on, payment_days, tax_treatment, created_by)
      values (${T}, ${LK}, ${p.id}, 'Northwind Traders', 'fixed', ${currency}, ${value}, '2026-09-01', 30, 'export', 'e2e')`);
}

/** Seeds Northwind Kiosk into the e2e database as the app role (RLS applies), once. */
export async function seedBoardDemo() {
  const admin = new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax");
  const ownerUrl = Object.assign(admin, { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString();
  const { db, client } = createDb(ownerUrl, { max: 1, connection: { options: "-c role=amax_app" } as never });
  await withTenant(db, T, seed);
  await client.end();
}
