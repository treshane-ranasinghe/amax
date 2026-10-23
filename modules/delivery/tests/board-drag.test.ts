import { describe, expect, it } from "vitest";
import { scriptedWrite } from "@amax/ai/scripted-writes";
import { canDrag, movePrompt, refusal, step, type DragCard, type DropLane } from "../ui/drag-rules";

const lanes: DropLane[] = [
  { phase: "proposed", name: "Proposed", custom: false }, { phase: "planned", name: "Planned", custom: false },
  { phase: "building", name: "Building", custom: false }, { phase: "building", name: "Code review", custom: true },
  { phase: "verified", name: "Verified", custom: false }, { phase: "released", name: "Released to Prod", custom: false },
];
const card = (c: Partial<DragCard> = {}): DragCard => ({ key: "CON-014", phase: "planned", lane: null, source: null, ...c });

describe("074 dragging cards on the board", () => {
  it("AC-12 a card can be dragged by someone who may move it, unless it's in Prod", () => {
    expect([canDrag(card(), true), canDrag(card(), false), canDrag(card({ phase: "released" }), true)]).toEqual([true, false, false]);
  });

  it("AC-13 a drop fills chat with a move that the model turns into move_proposal for that lane", () => {
    expect(movePrompt("CON-014", lanes[3])).toBe("Move CON-014 to Code review");
    expect(scriptedWrite(movePrompt("CON-014", lanes[3]))?.map((c) => [c.name, c.input])).toEqual([["move_proposal", { key: "CON-014", lane: "Code review" }]]);
    expect(scriptedWrite(movePrompt("CON-014", lanes[2]))?.map((c) => [c.name, c.input])).toEqual([["move_proposal", { key: "CON-014", to: "building" }]]);
  });

  it("AC-14 refuses what the service refuses: Released, a synced card across phases, and its own lane", () => {
    expect(refusal(card(), lanes[5], "Planned")).toMatch(/Prod deployment/);
    expect(refusal(card({ phase: "building", source: "specclaw" }), lanes[4], "Building")).toMatch(/follows the repo/);
    expect(refusal(card({ phase: "building", source: "specclaw" }), lanes[3], "Building")).toBeNull();
    expect(refusal(card({ phase: "building", lane: "Code review" }), lanes[3], "Building")).toMatch(/already in Code review/);
    expect(refusal(card(), lanes[2], "Planned")).toBeNull();
  });

  it("AC-15 keyboard moves step to the next lane the card may go to, and stop at the ends", () => {
    const synced = card({ phase: "building", source: "specclaw" });
    expect([step(card(), lanes, 1, 1), step(card(), lanes, 4, 1), step(synced, lanes, 2, 1), step(synced, lanes, 3, -1)]).toEqual([2, null, 3, 2]);
  });
});
