import type { PinRef } from "@amax/ui";
import type { Phase } from "../contracts";
import { AskButton } from "./AskButton";
import { Stk } from "./parts";

type Props = { projectKey: string; phase: Phase; phaseLabel: string; name: string; custom: boolean; count: number; canEdit: boolean; pin: PinRef };

// 074 AC-20, AC-23: a lane's head. Its own lanes show their phase and a menu; every change goes through chat.
export function LaneHead({ projectKey, phase, phaseLabel, name, custom, count, canEdit, pin }: Props) {
  const ask = (label: string, prompt: string) => <AskButton className="menuitem" label={label} name={`${label} ${name}`} prompt={prompt} pin={pin} />;
  return (
    <div className="lane-head">
      <span className="lh">{custom ? <small className="phase-of">{phaseLabel} ›</small> : <Stk phase={phase} />}{name}</span>
      <span className="lane-count">{count}</span>
      {custom && canEdit && (
        <details className="lanemenu">
          <summary aria-label={`${name} lane options`}>⋯</summary>
          <div role="menu">
            {ask("Rename", `Rename the ${name} lane on ${projectKey} to `)}
            {ask("Move left", `Move the ${name} lane on ${projectKey} left`)}
            {ask("Move right", `Move the ${name} lane on ${projectKey} right`)}
            {ask("Remove", `Remove the ${name} lane on ${projectKey}`)}
          </div>
        </details>
      )}
    </div>
  );
}

/** The chip after a phase's last lane (AC-19): starts the add-lane prompt for that phase. */
export const AddLane = ({ projectKey, phaseLabel, pin }: { projectKey: string; phaseLabel: string; pin: PinRef }) => (
  <AskButton className="btn sm addlane" label="Add lane" name={`Add a lane to ${phaseLabel}`} prompt={`Add a lane to ${phaseLabel} on ${projectKey} called `} pin={pin} spark />
);
