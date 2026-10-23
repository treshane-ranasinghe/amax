import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { getProject } from "../server/queries";
import { createProposal, moveProposal } from "../server/services";
import { deliveryDb } from "./db";

describe.skipIf(!hasDb)("074 moving and creating cards into lanes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof deliveryDb>>;
  let maya: Viewer;
  const card = async (key: string) => (await getProject(maya, "CON"))!.proposals.find((p) => p.key === key)!;

  beforeAll(async () => {
    db = await deliveryDb();
    maya = await db.as("maya", "PM");
  });
  afterAll(() => db?.t.drop());

  it("AC-16 a lane move emits lane_changed; a phase move phase_changed; a lane outside `to` is refused; synced cards stay in their phase", async () => {
    await moveProposal(ctxFor(maya), { key: "CON-014", lane: "Code review" });
    await moveProposal(ctxFor(maya), { key: "CON-013", to: "building" });
    const events = await db.q(sql`select name, payload->>'key' as key from core.event where name like 'delivery.proposal.%changed' order by created_at`);
    expect(events.map((e) => `${e.name} ${e.key}`).slice(-2)).toEqual(["delivery.proposal.lane_changed CON-014", "delivery.proposal.phase_changed CON-013"]);
    await expect(moveProposal(ctxFor(maya), { key: "CON-013", to: "planned", lane: "Code review" })).rejects.toThrow(/lane of Building, not Planned/);
    await db.q(sql`update delivery.proposal set source = 'specclaw' where key = 'CON-011'`);
    await moveProposal(ctxFor(maya), { key: "CON-011", lane: "Building" });
    await expect(moveProposal(ctxFor(maya), { key: "CON-011", to: "planned" })).rejects.toThrow(/follows the repo/);
    await db.q(sql`update delivery.proposal set source = null where key = 'CON-011'`);
  });

  it("AC-17 two moves of one card at once apply in turn", async () => {
    await Promise.all([moveProposal(ctxFor(maya), { key: "CON-016", to: "planned" }), moveProposal(ctxFor(maya), { key: "CON-016", lane: "Code review" })]);
    expect(["planned", "building"]).toContain((await card("CON-016")).phase);
  });

  it("AC-22 a new proposal starts in a named lane, or Proposed, but never Released", async () => {
    const r = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Invoice export to PDF v2", lane: "Code review" });
    expect([(await card(r.key)).phase, (await card(r.key)).lane]).toEqual(["building", "Code review"]);
    expect((await card((await createProposal(ctxFor(maya), { projectKey: "CON", title: "Plain" })).key)).phase).toBe("proposed");
    await expect(createProposal(ctxFor(maya), { projectKey: "CON", title: "Nope", lane: "Released to Prod" })).rejects.toThrow(/Prod deployment/);
  });
});
