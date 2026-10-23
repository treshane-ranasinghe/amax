import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { addBoardLane, moveBoardLane, removeBoardLane, renameBoardLane } from "../server/lanes";
import { getProject } from "../server/queries";
import { moveProposal } from "../server/services";
import { deliveryDb } from "./db";

describe.skipIf(!hasDb)("074 board lanes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof deliveryDb>>;
  let maya: Viewer, nimal: Viewer;
  const card = async (key: string) => (await getProject(maya, "CON"))!.proposals.find((p) => p.key === key)!;
  const lanes = async () => (await getProject(maya, "CON"))!.lanes.map((l) => `${l.phase}:${l.name}`);

  beforeAll(async () => {
    db = await deliveryDb();
    [maya, nimal] = [await db.as("maya", "PM"), await db.as("nimal")];
  });
  afterAll(() => db?.t.drop());

  it("AC-18 a lane is a step of one phase: CON-011 sits in Code review, and leaving Building leaves the lane", async () => {
    expect([(await card("CON-011")).phase, (await card("CON-011")).lane]).toEqual(["building", "Code review"]);
    await db.q(sql`update delivery.proposal set phase = 'verified' where key = 'CON-011'`);
    expect((await card("CON-011")).lane).toBeNull();
    await db.q(sql`update delivery.proposal set phase = 'building', lane_id = (select id from delivery.lane where name = 'Code review') where key = 'CON-011'`);
  });

  it("AC-19 adds a lane at a position in its phase; refuses Released, a phase's name and a taken name", async () => {
    await addBoardLane(ctxFor(maya), { projectKey: "CON", phase: "building", name: "Ready for QA", position: 1 });
    expect((await lanes()).filter((l) => l.startsWith("building"))).toEqual(["building:Ready for QA", "building:Code review"]);
    await expect(addBoardLane(ctxFor(maya), { projectKey: "CON", phase: "released", name: "Hotfix" })).rejects.toThrow();
    await expect(addBoardLane(ctxFor(maya), { projectKey: "CON", phase: "planned", name: "Building" })).rejects.toThrow(/phase's name/);
    await expect(addBoardLane(ctxFor(maya), { projectKey: "CON", phase: "planned", name: "code REVIEW" })).rejects.toThrow(/already has a lane called Code review/);
  });

  it("AC-20 renames, moves and removes a lane; its cards go back to the default lane", async () => {
    await renameBoardLane(ctxFor(maya), { projectKey: "CON", lane: "ready for qa", name: "QA handoff" });
    await moveBoardLane(ctxFor(maya), { projectKey: "CON", lane: "QA handoff", direction: "right" });
    expect((await lanes()).filter((l) => l.startsWith("building"))).toEqual(["building:Code review", "building:QA handoff"]);
    await moveProposal(ctxFor(maya), { key: "CON-014", lane: "QA handoff" });
    expect(await removeBoardLane(ctxFor(maya), { projectKey: "CON", lane: "QA handoff" })).toEqual({ removed: "QA handoff", cardsMoved: ["CON-014"] });
    expect([(await card("CON-014")).phase, (await card("CON-014")).lane]).toEqual(["building", null]);
    await expect(removeBoardLane(ctxFor(maya), { projectKey: "CON", lane: "Building" })).rejects.toThrow(/default lane/);
  });

  it("AC-21 lanes are edited through the MCP tools with the board permission: a PM yes, an Engineer no", async () => {
    expect(mcpTools.filter((x) => x.name.endsWith("_board_lane")).map((x) => [x.name, x.permission])).toEqual(["add", "rename", "move", "remove"].map((v) => [`${v}_board_lane`, "delivery:board:edit"]));
    await expect(addBoardLane(ctxFor(nimal), { projectKey: "CON", phase: "planned", name: "Spike" })).rejects.toThrow(/forbidden/);
    const list = mcpTools.find((x) => x.name === "list_board_lanes")!;
    expect(await list.run(maya as never, { projectKey: "CON" } as never, "mcp" as never)).toEqual(expect.arrayContaining([{ phase: "building", lane: "Code review", own: true, cards: ["CON-011"] }]));
  });
});
