import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compact, revenueView } from "../ui/revenue";
import { TasksCard } from "../ui/TasksCard";

const P = [{ id: "c", name: "Contoso Portal", color: "violet" }, { id: "f", name: "Fleet Tracker", color: "amber" }, { id: "h", name: "HR Insights", color: "pink" }];
const HEX = { violet: "#7B61FF", amber: "#F2A93B" };
const data = (d: object) => [{ module: "finance", data: { access: true, currency: "USD", parts: [], leftOut: [], ...d } }];

describe("074 Projects page cards", () => {
  it("AC-5 with nothing closed and nothing planned, the tasks card says so", () => {
    const weekly = { labels: ["W1"], weeks: ["2026-10-12"], planned: [null], done: [0], plannedFrom: null };
    expect(renderToStaticMarkup(createElement(TasksCard, { weekly, filter: {} }))).toContain("No tasks closed in the last 8 weeks.");
  });

  it("AC-8 a contract with no rate is named, not added; projects without a contract are counted", () => {
    const view = revenueView(data({ parts: [{ projectId: "c", value: 420000 }], leftOut: [{ contractId: "x", projectId: "f", currency: "EUR" }] }), P, HEX);
    expect(view).toEqual({ kind: "chart", total: 420000, currency: "USD", parts: [{ name: "Contoso Portal", value: 420000, color: "#7B61FF" }],
      notes: ["1 contract in EUR left out: no EUR → USD rate. Add one with set_fx_rate.", "1 project has no contract"] });
    expect(compact(774000, "USD")).toBe("$774k");
  });

  it("AC-9 says why there is no chart: no Finance, no access, no contracts, or a failed read", () => {
    expect(revenueView([], P, HEX)).toEqual({ kind: "note", text: "Revenue by project needs the Finance module." });
    expect(revenueView(data({ access: false }), P, HEX)).toEqual({ kind: "note", text: "You don't have access to Finance." });
    expect(revenueView(data({}), P, HEX)).toEqual({ kind: "note", text: "No contracts yet." });
    expect(revenueView([{ module: "finance", failed: true }], P, HEX)).toEqual({ kind: "note", text: "Couldn't load" });
  });
});
