import type { KeyboardEvent, PointerEvent } from "react";
import { PinButton } from "@amax/ui";
import { proposalPin } from "../pins";
import type { ProposalRow } from "../server/queries";
import { AskButton } from "./AskButton";
import { Avatar } from "./Avatar";
import { initials } from "./parts";

export type Handle = { label: string; picked: boolean; onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void; onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void };

// Facts the specclaw sync adds (039): lane, queue status, claim, PR.
function SpecFacts({ p }: { p: ProposalRow }) {
  const m = p.meta as { lane?: string; status?: string; waiting?: string[]; claim?: string | null; pr?: string | null; withdrawn?: boolean };
  const status = m.withdrawn ? "withdrawn" : m.status === "blocked" ? `blocked on ${m.waiting?.join(", ")}` : m.status === "claimed" ? `claimed by ${m.claim}` : m.status === "ready" ? "ready" : null;
  return (
    <div className="foot" style={{ marginTop: 8 }}>
      {m.lane && <span className="chip">{m.lane}</span>}
      {status && status !== "done" && <span className={`chip ${m.status === "ready" ? "good" : m.status === "claimed" ? "agent" : "warn"}`}>{status}</span>}
      {m.pr && <a href={m.pr} rel="noreferrer">PR {m.pr.split("/").at(-1)}</a>}
    </div>
  );
}

/** One proposal on the board. `handle` is its drag handle (074 AC-12, AC-15); `pending` while chat confirms a drop (AC-13). */
export function BoardCard({ p, canMove, handle, pending }: { p: ProposalRow; canMove: boolean; handle?: Handle; pending?: { onCancel: () => void } }) {
  const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
  const done = p.phase === "verified" || p.phase === "released";
  const pin = proposalPin(p);
  return (
    <div className={`tcard pinnable${pending ? " pending" : ""}${handle?.picked ? " picked" : ""}`} data-card={p.key}>
      <PinButton pin={pin} />
      {handle && <button type="button" className="handle" aria-label={handle.label} aria-pressed={handle.picked} title={p.source ? "Its phase follows the repo" : "Drag to another lane"} onPointerDown={handle.onPointerDown} onKeyDown={handle.onKeyDown}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" /></svg></button>}
      <div className="id">{p.key}</div>
      <p>{p.title}</p>
      {p.phase !== "proposed" && p.phase !== "released" && <div className="prog"><i style={{ width: `${pct}%`, ...(done ? { background: "var(--mint)" } : {}) }} /></div>}
      <div className="foot">
        {p.phase === "released" ? <span className="chip">{p.release ?? "Released"}</span>
          : p.agent ? <span className="chip agent">{p.agent}</span> : <Avatar initials={initials(p.ownerName)} name={p.ownerName} />}
        <span>
          {p.phase === "proposed" && (p.estimateHours !== null ? `est. ${p.estimateHours} h` : `${p.hours} h`)}
          {(p.phase === "planned" || p.phase === "building") && `${p.tasksDone} of ${p.tasksTotal}${p.phase === "building" ? `, ${p.hours} h` : " tasks"}`}
          {p.phase === "verified" && p.source !== "specclaw" && <span className="chip">{p.release ?? "No release"}{p.shippedTo ? `, in ${p.shippedTo}` : ""}</span>}
          {p.phase === "verified" && p.source === "specclaw" && `${p.tasksDone} of ${p.tasksTotal} tasks`}
          {p.phase === "released" && <span className="chip good">In Prod</span>}
        </span>
      </div>
      {p.source === "specclaw" && <SpecFacts p={p} />}
      {pending && <div className="foot pendingnote" role="status">Moving… confirm it in chat<button type="button" className="btn sm" onClick={pending.onCancel}>Cancel</button></div>}
      {canMove && p.phase !== "released" && !pending && (
        <span className="cardmenu"><AskButton label="Move" name={`Move ${p.key}`} prompt={`Move ${p.key} to `} pin={pin} /></span>
      )}
    </div>
  );
}
