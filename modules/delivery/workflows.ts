import { cron, defineWorkflow, step } from "@amax/workflows";
import { snapshotThisWeek } from "./server/snapshot";

// 074 AC-2: Monday's snapshot of each project's open backlog, the "Planned" line of Tasks done per week.
export const weeklySnapshot = defineWorkflow({
  name: "delivery.weekly-snapshot",
  title: "Weekly task snapshot",
  async run(ctx) {
    const r = await step("snapshot", () => snapshotThisWeek(ctx.tenantId), { timeout: "2m" });
    return { summary: r.written ? `Planned recorded for ${r.written} project${r.written === 1 ? "" : "s"}, week of ${r.week}` : `Week of ${r.week} already recorded` };
  },
});

export const weeklySnapshotSchedule = cron({ name: "delivery.weekly-snapshot", title: "Weekly task snapshot", description: "Records each project's open tasks at the start of the week, for the Planned line of Tasks done per week", workflow: "delivery.weekly-snapshot", cron: "5 0 * * 1", enabled: true });
