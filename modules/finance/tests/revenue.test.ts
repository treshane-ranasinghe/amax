import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSlots, readSlot } from "@amax/core/server";
import { REVENUE_SLOT, type RevenueByProject } from "@amax/delivery/contracts";
import { mcpTools } from "../mcp";
import { revenueByProject } from "../server/revenue";
import { financeDb, T } from "./db";

describe.skipIf(!hasDb)("074 revenue by project from Finance (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  let ids: Record<string, string>;
  beforeAll(async () => {
    db = await financeDb();
    ids = Object.fromEntries((await db.q(sql`select key, id from delivery.project`)).map((r) => [r.key, r.id as string]));
  }, 120_000);
  afterAll(() => db?.t.drop());
  const value = (r: RevenueByProject, key: string) => r.parts.find((p) => p.projectId === ids[key])?.value;

  it("AC-7 each project's contract value comes from its Finance contracts", async () => {
    const r = await revenueByProject(await db.as("maya", "Finance"), { projectIds: Object.values(ids) });
    expect([r.currency, value(r, "CON"), value(r, "FLT"), value(r, "HRI"), r.leftOut]).toEqual(["USD", 420000, 210000, 144000, []]);
  });

  it("AC-8 converts at the stored rate and leaves out a currency with none", async () => {
    const [c] = await db.q(sql`select legal_entity_id, client from finance.contract where project_id = ${ids.CON}`);
    const add = (cur: string, value: string) => db.q(sql`insert into finance.contract (tenant_id, legal_entity_id, project_id, client, kind, currency, value, starts_on, payment_days, tax_treatment, created_by)
      values (${T}, ${c.legal_entity_id}, ${ids.CON}, ${c.client}, 'fixed', ${cur}, ${value}, '2026-03-01', 30, 'export', 'test') returning id`);
    const [lkr] = await add("LKR", "3000000");
    const [eur] = await add("EUR", "1000");
    const r = await revenueByProject(await db.as("maya", "Finance"), { projectIds: [ids.CON] });
    expect(value(r, "CON")).toBe(430000);
    expect(r.leftOut).toEqual([{ contractId: eur.id, projectId: ids.CON, currency: "EUR" }]);
    await db.q(sql`delete from finance.contract where id in (${lkr.id}, ${eur.id})`);
  });

  it("AC-9 a viewer with no Finance access gets no figures", async () => {
    expect(await revenueByProject(await db.as("nimal"), { projectIds: Object.values(ids) })).toEqual({ access: false, currency: null, parts: [], leftOut: [] });
  });

  it("AC-10 get_revenue_by_project answers for one client, with project names", async () => {
    const tool = mcpTools.find((x) => x.name === "get_revenue_by_project")!;
    const r = (await tool.run((await db.as("maya", "Finance")) as never, { client: "Contoso" } as never, "mcp" as never)) as RevenueByProject & { parts: { project: string }[] };
    expect(r.parts).toEqual([{ projectId: ids.CON, value: 420000, project: "Contoso Portal" }]);
  });

  it("AC-11 the slot reaches Finance through core, and a failing provider is marked, not thrown", async () => {
    const viewer = await db.as("maya", "Finance");
    configureSlots(db.modules);
    const [hit] = await readSlot<RevenueByProject>(REVENUE_SLOT, viewer, { projectIds: [ids.HRI] });
    expect(hit).toEqual({ module: "finance", data: expect.objectContaining({ parts: [{ projectId: ids.HRI, value: 144000 }] }) });
    configureSlots([{ id: "broken", slots: { [REVENUE_SLOT]: () => Promise.reject(new Error("down")) } }]);
    expect(await readSlot(REVENUE_SLOT, viewer, {})).toEqual([{ module: "broken", failed: true }]);
    configureSlots([]);
    expect(await readSlot(REVENUE_SLOT, viewer, {})).toEqual([]);
  });
});
