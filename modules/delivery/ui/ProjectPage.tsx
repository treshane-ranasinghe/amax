import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { IntentButton } from "@amax/ui";
import { boardLanes } from "../server/board";
import { LANE_LABEL } from "../server/lane-of";
import { getProject, listEnvironments } from "../server/queries";
import { Board } from "./Board";
import { EnvironmentsCard } from "./EnvironmentsCard";
import { getRepoSync } from "../server/repo-sync";
import { RepoSyncCard } from "./RepoSyncCard";
import { needViewer, SignInFirst } from "./parts";
import { ProjectTabs } from "./ProjectSections";

const D = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
// "Sprint 18 runs Mon Oct 12 to Fri Oct 23. 9 of 16 tasks done, on track for v2.5.0. "
function sprintLine(p: { sprint: string | null; sprintStart: string | null; sprintEnd: string | null; health: string; nextRelease: string | null }, done: number, total: number) {
  if (!p.sprint) return "";
  const when = p.sprintStart && p.sprintEnd ? ` runs ${D(p.sprintStart, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")} to ${D(p.sprintEnd, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")}` : "";
  const v = p.nextRelease?.match(/v\d+(\.\d+)+/)?.[0];
  return `${p.sprint}${when}. ${done} of ${total} tasks done${v ? `, ${p.health === "on-track" ? "on track" : "at risk"} for ${v}` : ""}. `;
}

export async function ProjectPage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Project</h1><SignInFirst /></>;
  const data = await getProject(viewer, params.key);
  if (!data) return <><h1>Project not found</h1><p className="lede">No project with the key {params.key}.</p></>;
  const { project, proposals, lanes } = data;
  const canMove = can(viewer, "delivery:proposal:move", { projectId: project.id });
  const envs = await listEnvironments(viewer, project.key);
  const sync = await getRepoSync(viewer, { projectId: project.id });

  // Synced projects have no sprint counters; their progress is the proposals' tasks.
  const done = project.sprintTotal ? project.sprintDone : proposals.reduce((n, p) => n + p.tasksDone, 0);
  const total = project.sprintTotal || proposals.reduce((n, p) => n + p.tasksTotal, 0);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span>{project.name}</nav>
      <div className="row head">
        <div>
          <h1>{project.name}</h1>
          <p className="lede">{sprintLine(project, done, total)}Released means it reached {envs.find((e) => e.isProd)?.name ?? "Prod"}.</p>
        </div>
        <div className="actions">
          {project.sprint && <select className="select" aria-label="Sprint" defaultValue={project.sprint}><option>{project.sprint}</option></select>}
          <IntentButton intent="delivery.new-proposal" label="New proposal" />
        </div>
      </div>
      <ProjectTabs projectKey={project.key} current="" />
      <Board projectKey={project.key} lanes={boardLanes(lanes, proposals)} labels={LANE_LABEL} canMove={canMove} canEdit={can(viewer, "delivery:board:edit", { projectId: project.id })} />
      {sync && <RepoSyncCard projectKey={project.key} projectId={project.id} repoUrl={sync.repoUrl} last={sync.lastApplied} recent={sync.recent} canLink={can(viewer, "delivery:project:link", { projectId: project.id })} />}
      <EnvironmentsCard projectKey={project.key} envs={envs} canEdit={can(viewer, "delivery:release:create", { projectId: project.id })} />
    </>
  );
}
