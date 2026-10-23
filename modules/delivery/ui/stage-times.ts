import type { ReleaseRow } from "../server/queries";

export type Tip = { title: string; at: string | null; lines: string[]; deploymentId: string | null };

const STATUS: Record<string, string> = { deployed: "Deployed", testing: "Testing", "rolled-back": "Rolled back" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "2 days 4 h", "5 h", "under an hour": a span between two moments, for stage times. */
export function span(fromIso: string, toIso: string) {
  const h = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000);
  if (h < 1) return "under an hour";
  const d = Math.floor(h / 24);
  return d ? `${plural(d, "day")}${h % 24 ? ` ${h % 24} h` : ""}` : `${h} h`;
}

/**
 * 074 AC-25, AC-26: a station's details, for the station at `i` of the release's stages in their own
 * order. Stage time runs from the previous reached station's first live deployment to this one's, so
 * a skipped environment is measured from the last one reached before it.
 */
export function stationTip(r: ReleaseRow, i: number, now: Date): Tip {
  const own = [...r.stages].sort((a, b) => a.position - b.position);
  const s = own[i];
  if (!s.status || !s.firstAt) return { title: `${s.environment} · Not deployed yet`, at: null, lines: [], deploymentId: null };
  const prev = own.slice(0, i).reverse().find((x) => x.status && x.firstAt);
  const lastI = own.reduce((at, x, j) => (x.status ? j : at), -1);
  const live = own.some((x) => x.isProd && x.status === "deployed");
  const lines = [
    ...(prev ? [`${span(prev.firstAt!, s.firstAt)} after ${prev.environment}`] : []),
    ...(i === lastI && !live && s.at ? [`In ${s.environment} for ${span(s.at, now.toISOString())}`] : []),
    ...(s.recordedBy ? [`By ${s.recordedBy}${s.run ? `, pipeline run ${s.run}` : ""}`] : s.run ? [`Pipeline run ${s.run}`] : []),
    ...(s.note ? [s.note] : []),
    ...(s.count > 1 && s.at ? [`Deployed ${s.count} times, latest ${shortDay(s.at)}`] : []),
  ];
  return { title: `${s.environment} · ${STATUS[s.status] ?? s.status}`, at: s.firstAt, lines, deploymentId: s.deploymentId };
}

/** The station's accessible name: the same details, with its date in UTC (the screen shows the viewer's own time). */
export const tipText = (t: Tip) => [t.title, t.at && `${new Date(t.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`, ...t.lines].filter(Boolean).join(". ");
