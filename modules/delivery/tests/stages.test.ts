import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { listReleases, type ReleaseRow } from "../server/queries";
import { recordDeployment, voidDeployment } from "../server/services";
import { stationTip } from "../ui/stage-times";
import { deliveryDb } from "./db";

const st = (environment: string, position: number, status: string | null, firstAt: string | null, more: Partial<ReleaseRow["stages"][number]> = {}) =>
  ({ environment, position, isProd: environment === "Prod", status, at: firstAt, note: null, run: null, firstAt, deploymentId: firstAt ? `d-${environment}` : null, count: status ? 1 : 0, recordedBy: null, ...more });
const rel = (...stages: ReturnType<typeof st>[]): ReleaseRow => ({ id: "r", projectId: "p", version: "v1.8.0", projectKey: "FLT", projectName: "Fleet Tracker", projectColor: "amber", proposals: 5, stages });
const NOW = new Date("2026-10-16T15:00:00Z");

describe("074 release map stage times", () => {
  it("AC-25 a station gives its status, the time since the last one, how long it has sat there, who, the note and repeats", () => {
    const r = rel(st("Dev", 1, "deployed", "2026-10-08T09:00:00Z"), st("QA", 2, "deployed", "2026-10-12T09:00:00Z"),
      st("UAT", 3, "rolled-back", "2026-10-13T11:00:00Z", { at: "2026-10-14T11:00:00Z", note: "waiting on Maya 2 d", run: "1190", count: 2, recordedBy: "Claude for Nimal" }), st("Prod", 4, null, null));
    expect(stationTip(r, 2, NOW)).toEqual({ title: "UAT · Rolled back", at: "2026-10-13T11:00:00Z", deploymentId: "d-UAT",
      lines: ["1 day 2 h after QA", "In UAT for 2 days 4 h", "By Claude for Nimal, pipeline run 1190", "waiting on Maya 2 d", "Deployed 2 times, latest Oct 14"] });
    expect(stationTip(r, 0, NOW).lines).toEqual([]);
    expect(stationTip(r, 3, NOW)).toEqual({ title: "Prod · Not deployed yet", at: null, lines: [], deploymentId: null });
  });

  it("AC-26 a skipped environment is measured from the last one reached, and a live release isn't 'sitting' anywhere", () => {
    const r = rel(st("Dev", 1, "deployed", "2026-10-01T09:00:00Z"), st("QA", 2, null, null), st("Prod", 3, "deployed", "2026-10-01T14:30:00Z"));
    expect(stationTip(r, 2, NOW).lines).toEqual(["5 h after Dev"]);
  });
});

describe.skipIf(!hasDb)("074 stage details in list_releases (Postgres)", () => {
  let db: Awaited<ReturnType<typeof deliveryDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await deliveryDb();
    maya = await db.as("maya", "PM");
  });
  afterAll(() => db?.t.drop());

  it("AC-28 each stage carries its first live deployment, the latest one's id, the live count and who recorded it; voided records are left out", async () => {
    const stage = async () => (await listReleases(maya, { projectKey: "CON" })).find((r) => r.version === "v2.4.0")!.stages.find((s) => s.environment === "QA")!;
    const first = await stage();
    await recordDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.4.0", environment: "QA", status: "testing" });
    const again = await stage();
    expect([again.firstAt, again.count, again.recordedBy]).toEqual([first.firstAt, 2, "Maya"]);
    await voidDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.4.0", environment: "QA", deploymentId: again.deploymentId!, reason: "wrong environment" });
    expect(await stage()).toEqual(first);
  });
});
