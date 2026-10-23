import type { SlotRead } from "@amax/core/server";
import type { RevenueByProject } from "../contracts";

type Named = { id: string; name: string; color: string };
export type RevenueView =
  | { kind: "note"; text: string }
  | { kind: "chart"; total: number; currency: string; parts: { name: string; value: number; color: string }[]; notes: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 074 AC-7–AC-10: what the Revenue by project card shows, from Finance's slot answer and the projects on screen. */
export function revenueView(reads: SlotRead<RevenueByProject>[], projects: Named[], hex: Record<string, string>): RevenueView {
  const r = reads[0];
  if (!r) return { kind: "note", text: "Revenue by project needs the Finance module." };
  if ("failed" in r) return { kind: "note", text: "Couldn't load" };
  if (!r.data.access) return { kind: "note", text: "You don't have access to Finance." };
  if (!r.data.parts.length && !r.data.leftOut.length) return { kind: "note", text: "No contracts yet." };
  const parts = projects.flatMap((p) => {
    const hit = r.data.parts.find((x) => x.projectId === p.id);
    return hit ? [{ name: p.name, value: hit.value, color: hex[p.color] ?? "#7B61FF" }] : [];
  });
  const currency = r.data.currency ?? "USD";
  const without = projects.filter((p) => !r.data.parts.some((x) => x.projectId === p.id) && !r.data.leftOut.some((l) => l.projectId === p.id)).length;
  const notes = [
    ...[...new Set(r.data.leftOut.map((l) => l.currency))].map((c) => `${plural(r.data.leftOut.filter((l) => l.currency === c).length, "contract", "contracts")} in ${c} left out: no ${c} → ${currency} rate. Add one with set_fx_rate.`),
    ...(without ? [`${plural(without, "project has", "projects have")} no contract`] : []),
  ];
  return { kind: "chart", total: parts.reduce((n, p) => n + p.value, 0), currency, parts, notes };
}

/** "$774k", as in the mock; another currency keeps its code. */
export const compact = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 0 }).format(n).replace(/K$/, "k");
