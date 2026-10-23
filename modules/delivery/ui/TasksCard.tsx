import { PinButton } from "@amax/ui";
import type { TasksPerWeek, WeekFilter } from "../server/weekly";
import { axisMax, LineChart } from "./charts";

const empty = (w: TasksPerWeek) => w.done.every((d) => !d) && w.planned.every((p) => !p);

// 074 AC-1–AC-6: Done from tasks closed each week, Planned from the weekly snapshots.
export function TasksCard({ weekly, filter }: { weekly: TasksPerWeek; filter: WeekFilter }) {
  // The axis grows with the data (40 at least, as in the mock), so no week is drawn past the top.
  const yMax = axisMax([...weekly.planned, ...weekly.done], 40, 10);
  const args = { ...(filter.client ? { client: filter.client } : {}), ...(filter.status === "closed" ? { status: "closed" } : {}) };
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Tasks done per week</h2><PinButton inline pin={{ label: "Tasks done per week", tool: "get_tasks_per_week", args }} /><span className="muted" style={{ fontSize: 13 }}>{filter.client ?? "All projects"}</span></div>
      {empty(weekly) ? <p className="muted empty">No tasks closed in the last 8 weeks.</p> : (
        <LineChart id="tasksWeek" label="Tasks done per week against plan" labels={weekly.labels} max={yMax} step={10}
          series={[{ name: "Planned", color: "#C3B5FF", data: weekly.planned, dashed: true }, { name: "Done", color: "#7B61FF", data: weekly.done, area: true }]} />)}
      <div className="legend"><span><i style={{ background: "var(--violet)" }} />Done</span><span><i style={{ background: "repeating-linear-gradient(90deg,#C3B5FF 0 5px,transparent 5px 9px)" }} />Planned</span></div>
      {weekly.plannedFrom && <p className="muted" style={{ fontSize: 13 }}>Planned starts from {weekly.plannedFrom}.</p>}
    </div>
  );
}
