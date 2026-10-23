import type { Viewer } from "@amax/auth";
import { readSlot } from "@amax/core/server";
import { PinButton } from "@amax/ui";
import { REVENUE_SLOT, type RevenueByProject } from "../contracts";
import type { ProjectRow } from "../server/queries";
import { Donut } from "./charts";
import { compact, revenueView } from "./revenue";

const HEX: Record<string, string> = { violet: "#7B61FF", amber: "#F2A93B", pink: "#F48B9B", mint: "#2FCB8C" };

// 074 AC-7–AC-11: contract values come from Finance through its slot; Delivery never imports Finance.
export async function RevenueCard({ viewer, projects, client }: { viewer: Viewer; projects: ProjectRow[]; client?: string }) {
  const reads = await readSlot<RevenueByProject>(REVENUE_SLOT, viewer, { projectIds: projects.map((p) => p.id) });
  const view = revenueView(reads, projects, HEX);
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Revenue by project</h2><PinButton inline pin={{ label: "Revenue by project", tool: "get_revenue_by_project", args: client ? { client } : {} }} /><a className="btn sm pillbtn" href="/finance">View all</a></div>
      {view.kind === "note" ? <p className="muted empty">{view.text}</p> : (
        <>
          <Donut label="Revenue by project" center={compact(view.total, view.currency)} sub="contract value" parts={view.parts} />
          {view.notes.map((n) => <p key={n} className="muted" style={{ fontSize: 13 }}>{n}</p>)}
        </>
      )}
    </div>
  );
}
