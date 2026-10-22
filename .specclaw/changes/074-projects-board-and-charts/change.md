# Projects: live charts, drag-and-drop board, custom lanes and release stage times

**Change:** 074-projects-board-and-charts · **Created:** 2026-10-22
**Lane:** Delivery · **Module:** `modules/delivery` (with contributions from `modules/finance`, `packages/core` and `apps/web`) · **Depends on:** [008](../archive/008-delivery-ingestion/change.md), [017](../archive/017-finance-contracts-billing/change.md), [029](../archive/029-workflows-scheduler/change.md), [041](../archive/041-delivery-mock-parity/change.md), [042](../archive/042-release-management/change.md), [044](../archive/044-release-and-region-hardening/change.md), [054](../archive/054-chat-first-everywhere/change.md)

## Problem

This change covers four gaps in the Projects screens.

**A. The two portfolio charts show only sample data** (`modules/delivery/ui/ProjectsPage.tsx`).
- **Tasks done per week** reads `delivery.weekly_stat`. 041 said 008 ingestion would write that
  table, but only `fixtures/index.ts` does. So a real tenant always sees "No weekly task data yet",
  even when commits and `mark_task_done` close tasks every day. The data already exists in
  `delivery.task` (`done`, `done_at`).
- **Revenue by project** sums `delivery.project.contract_value`. Nothing but the fixtures sets that
  column. The real contract values live in Finance (`finance.contract`, published as
  `listContractRefs`).

**B. Cards on the project board can't be dragged** (`modules/delivery/ui/ProjectPage.tsx`). To
move a card such as "Invoice export to PDF" from Planned to Building, a PM opens the card's
**Move** menu, which starts a chat ("Move CON-014 to …") and then types the lane. Every other board
tool people use lets them drag the card.

**C. The board's lanes are fixed.** It always shows the five specclaw phases (Proposed, Planned,
Building, Verified, Released to Prod; `PHASES` in `contracts.ts`). Teams can't add their own steps,
such as "Code review" or "Ready for QA". Neither a person nor amax can add a lane, and New proposal
always puts the card in Proposed.

**D. The release map hides how long each stage took** (`modules/delivery/ui/ReleasesPage.tsx`).
Its stations carry no information. A PM can't see that a release waited 4 days in QA before UAT,
or who promoted it, without opening every release. The data is already stored: each
`delivery.deployment` has `at`, `status`, `note`, `pipeline_run` and `recorded_by`.

## Scope

In scope:
- A: the Tasks done per week chart and the Revenue by project donut, including their data, states
  and pins.
- B: dragging and dropping proposal cards between lanes on the project board, by pointer, touch and
  keyboard.
- C: adding, renaming, reordering and removing lanes per project, through the screen and through
  amax (chat and MCP), and choosing the lane when a proposal is created.
- D: a details tooltip on each release map station, showing time between environments and the full
  deployment details.

Out of scope:
- The **Contract value** and **Average margin** tickets, and per-project health, risk, margin and
  invoiced (Features row 3).
- Sprints and velocity (Features row 9).
- Reordering cards inside one lane (priority order).
- Board settings shared across projects (tenant-wide lane templates).
- Average time per stage across releases (a reporting feature, for a later change).
- The Proposals page's **Shipped to Prod per week** chart, which is already live.

## Definitions

- **Phase:** one of the five fixed specclaw phases in `PHASES`. Phases stay fixed. Releases,
  `phaseCounts`, the Overview, Insights, sync and webhooks keep reading them unchanged.
- **Lane:** a column on one project's board. Each lane belongs to exactly one phase, and a phase
  can have several lanes. Every phase has one **default lane**, named as today. A custom lane is a
  step inside a phase: "Code review" is a lane in **Building**, so a card in Code review is still
  `building` everywhere else in amax. A proposal with no lane sits in its phase's default lane.
- **Week:** an ISO week, Monday to Sunday (UTC), as `lastWeeks()` and `shippedPerWeek` use. The
  tasks chart shows the last 8 weeks, ending with the current week.
- **Counted task:** a `delivery.task` on a proposal that isn't withdrawn, in a project that matches
  the page's filters.
- **Done in week W:** a counted task whose `done_at` falls in W.
- **Planned for week W:** the counted tasks still open at the start of W on proposals in the
  **Planned** or **Building** phase (any lane).
- **Contract value of a project:** the sum of `value` over the project's Finance contracts the
  viewer may read, in the Finance target currency.
- **Stage time:** for a station on the release map, the time from the release's first live
  (not voided) deployment to the previous environment it reached to its first live deployment to
  this environment.

## Decisions

The proposal's open questions are settled as follows. Each can be changed by a later change.

1. **Planned** = the open backlog at the start of the week on Planned or Building proposals.
2. **Synced cards** may move between lanes of their current phase, but never across phases.
3. **The Contract value ticket** stays on `delivery.project.contract_value` in this change.
4. **Every drop opens a chat confirm** (rule 1, R3 chat-first). There is no direct write.
5. **No tenant-wide lane templates** in this change.
6. **No ordering inside a lane** in this change.
7. **A new proposal may start in any lane except Released to Prod.**
8. **Revenue = total contract value** (as the mock says), not the invoiced amount.
9. **Stage time is measured from first live deployment to first live deployment.** The tooltip also
   shows the latest deployment when the stage was deployed more than once.

## Mock Delta

What changes on screen, and where to see it: [`074-projects-board-and-charts`](../../mock/index.html#074-projects-board-and-charts)

- The Contoso Portal board has:
  - a drag handle on each movable card;
  - a "Code review" lane inside Building, with a small "Building" label over that phase's lanes;
  - an **Add lane** chip at the end of each phase group;
  - a lane menu (Rename, Move left, Move right, Remove).
- The release map has a station tooltip, e.g. "QA · Deployed · Mon Oct 12, 09:00 · 4 days after
  Dev · by Pipeline run 1182".
- The Projects screen charts don't change layout (041 mock). They add only the partial-history note
  (AC-4) and the Finance-missing states (AC-9).

## Acceptance Criteria

### A. Live portfolio charts

1. **AC-1** **Done** for each of the 8 weeks is the count of tasks done in that week, from
   `delivery.task.done_at`. A task closed by a commit, `mark_task_done` or a specclaw sync shows on
   the next page load.
2. **AC-2** **Planned** for a past week comes from a weekly snapshot of open tasks, stored per
   project in `delivery.weekly_stat`. A 029 schedule (`delivery.weekly-snapshot`, Monday 00:05 UTC,
   on by default) writes it through an audited system service. Running it twice for a week gives
   the same rows. The current week's Planned is its snapshot when there is one, and is otherwise
   worked out live (a page load never writes).
3. **AC-3** The chart follows the client filter and the Active / Closed tab.
4. **AC-4** Done is complete for every past week. Planned exists from the first snapshot only, so a
   past week without one draws no Planned point (null, not 0). A note says "Planned starts from
   <week>".
5. **AC-5** With no closed tasks and no Planned value in the 8 weeks, the card says "No tasks closed
   in the last 8 weeks."
6. **AC-6** The card's pin resolves through a new read tool `get_tasks_per_week` (`client?`,
   `status?`). It returns the week labels with Planned and Done.
7. **AC-7** Each donut segment is one project's contract value from Finance (`listContractRefs`,
   summed per project). The centre shows the total. The donut no longer reads
   `delivery.project.contract_value`.
8. **AC-8** Values are converted to Finance's target currency with the latest stored
   `finance.fx_rate` on or before today. A contract with no rate is left out, and a note says which
   one and how to fix it ("Add one with set_fx_rate"). A total never mixes currencies.
9. **AC-9** The donut shows only contracts the viewer may read (`finance:read` for that contract's
   legal entity).
   - Without Finance installed, the card says "Revenue by project needs the Finance module."
   - When the viewer can't read Finance, the card says "You don't have access to Finance."
   - With no contracts, it says "No contracts yet."
10. **AC-10** The donut follows the client filter and the Active / Closed tab, and the legend says
    how many projects have no contract. **View all** goes to `/finance`. The pin resolves through a
    new Finance read tool `get_revenue_by_project`.
11. **AC-11** Delivery doesn't import Finance, because Finance already depends on Delivery. Finance
    gives the donut's data through a named manifest **slot** (`delivery.revenue-by-project`), which
    `@amax/core/server` reads. Delivery declares the slot's types in its `contracts.ts`.

### B. Drag and drop on the board

12. **AC-12** Anyone with `delivery:proposal:move` on the project can drag a card to any lane before
    Released to Prod. This works with a mouse, touch and pen.
13. **AC-13** Dropping a card doesn't write directly (rules 1 and 3, R3 chat-first):
    - It opens chat with the card pinned and the prompt filled in ("Move CON-014 to Building ›
      Code review").
    - While the move is pending, the card shows a "Moving…" state in the target lane, with a
      **Cancel** button.
    - When chat confirms the `move_proposal` card, the board shows the new lane.
    - When chat cancels it, or the person presses **Cancel**, the card returns to where it was.
14. **AC-14** The board refuses the same drops the service refuses, before chat opens:
    - Released to Prod accepts no drops. A Prod deployment is the only way in.
    - A released card can't be dragged.
    - A card synced from a repo (`source` is set) can only be dropped in another lane of its current
      phase; its tooltip says "Its phase follows the repo".
    - A viewer without move permission sees no drag handles.
    A refused drop snaps back and says why in a live region.
15. **AC-15** Dragging has a keyboard and single-pointer alternative (WCAG 2.2 2.1.1 and 2.5.7):
    - The card menu's **Move** lists the allowed lanes.
    - From the keyboard: Space picks the card up, Left and Right choose a lane, Space drops it, Esc
      cancels.
    - Each step is announced, e.g. "CON-014 picked up. Building, Code review."
    - With reduced motion, the card moves without animation.
16. **AC-16** `move_proposal` takes an optional `lane` (lane name) as well as `to`:
    - The phase comes from the lane, and naming a lane outside the phase `to` names is refused.
    - The move is audited with before and after lane and phase.
    - `delivery.proposal.phase_changed` fires only when the phase changes. A lane-only move emits the
      new `delivery.proposal.lane_changed`.
17. **AC-17** The move service locks the proposal row (`for update`), fixing the open 042
    follow-up. Two people moving the same card at once get one move each, applied in turn, and no
    lost update.

### C. Custom lanes, by people and by amax

18. **AC-18** A project's custom lanes are stored in a new `delivery.lane` table (project, phase,
    name, position). Default lanes aren't stored: they are the phase itself, so existing proposals,
    projects and syncs need no data migration. `delivery.proposal.lane_id` (nullable) places a card
    in a custom lane. A phase change clears it unless the move names a lane.
19. **AC-19** A PM can add a lane inside any phase except Released to Prod, at a chosen position in
    that phase. The **Add lane** chip opens chat with the prompt filled in ("Add a lane to Building
    on CON called "). Lane names are 1–40 characters and unique within the project (ignoring case),
    and can't reuse a phase name.
20. **AC-20** A PM can rename a lane, move it left or right within its phase, and remove it.
    Removing a lane moves its cards to the phase's default lane. Each of these goes through chat
    confirm. Default lanes can't be renamed or removed.
21. **AC-21** amax can do all of this from chat, and agents can do it over MCP with the same
    permission (`delivery:board:edit`, granted to PM on managed projects and Admin). New tools:
    - `list_board_lanes` (read);
    - `add_board_lane`;
    - `rename_board_lane`;
    - `move_board_lane`;
    - `remove_board_lane`.

    A new chat intent `delivery.add-lane` asks "Which project?", "Which phase?" and "What's the lane
    called?". Every lane change is audited and attributed to the person or to their agent.
22. **AC-22** `create_proposal` takes an optional `lane`, a phase name or a custom lane name. It
    defaults to Proposed. A new proposal can start in any lane except Released to Prod. The
    `delivery.new-proposal` intent asks "Which lane should it start in?". amax fills it in when the
    person says it, e.g. "add 'Invoice export to PDF' to Contoso, straight into Planned".
23. **AC-23** Each lane's head shows its card count. A small phase label groups a phase's lanes, so
    the five phases stay readable however many lanes there are. At phone width, lanes scroll
    sideways inside the board, and the page itself doesn't scroll sideways.
24. **AC-24** Other modules see no difference. `PHASES`, `phaseCounts`, `listProjectRefs`, the
    Overview, Insights, the specclaw sync and webhooks keep using phases. `get_project` and
    `list_proposals` add `lane` to each proposal, alongside `phase`.

### D. Release map stage times

25. **AC-25** Each reached station on the release map has a details tooltip:
    - the environment and its status ("UAT · Rolled back");
    - the date and time of its first live deployment, in the viewer's time zone;
    - the stage time, e.g. "2 days 4 h after QA" (not shown for the first reached station);
    - for the release's current station, how long it has been there ("In UAT for 3 days"), unless the
      release is Live;
    - who recorded it: a person, "an agent for <person>", a pipeline credential, or the pipeline run;
    - the note, when there is one;
    - the number of deployments when there was more than one, with the latest one's date ("Deployed
      2 times, latest Oct 15").

    A station not reached yet says "<environment> · Not deployed yet".
26. **AC-26** Stage time follows the definition above. Voided deployments are left out. A skipped
    environment is measured from the last reached environment before it.
27. **AC-27** The tooltip opens on hover, keyboard focus and tap, and stays open while the pointer
    is over it (WCAG 1.4.13). Esc and tapping elsewhere close it. Each station is focusable, in
    release order, with an accessible name that gives the same text. The SVG's overall label stays
    as it is.
28. **AC-28** `list_releases` adds to each stage: `firstAt`, `deploymentId` (the latest live record),
    `count` (live deployments) and `recordedBy` (a display name, never a raw id). So chat and agents
    can answer "how long did v1.8.0 take from QA to UAT?". The station tooltip's pin resolves through
    `get_deployment`.

### Shared

29. **AC-29** `npm run check:graph` passes. Every new write is a `defineService` with its MCP tool
    and a unit test, and runs only after chat's confirm. The chat-first guard test for the board
    still passes: no write `<form>` and no server action.
30. **AC-30** A failed read shows "Couldn't load" in its own card only, and is logged.
31. **AC-31** Fixtures keep the mock's numbers by seeding real data:
    - the tasks chart over W35–W42, from real tasks and snapshots;
    - Contoso Portal $420k, Fleet Tracker $210k and HR Insights $144k, from Finance contracts.

    They add one custom lane, "Code review" in Building on Contoso Portal, holding CON-011.
32. **AC-32** Unit and Postgres tests cover:
    - the weekly counts, the snapshot running twice, the filters and the current week worked out
      live;
    - the revenue slot: currency conversion, a missing rate, no access, and no Finance;
    - lanes: add, rename, move and remove, and their permissions;
    - moves into lanes, with the row lock and lane events;
    - creating a proposal into a lane;
    - stage times: skipped environments, voided records and repeat deployments.

## Non-functional requirements

- Dropping a card shows the pending state within 100 ms. Confirming updates the board through the
  existing `revalidatePath` after confirm, with no full reload.
- The board stays usable with 15 lanes and 300 cards on a project.
- The Projects page reads the tasks chart in at most two queries, plus the Finance slot. Indexes:
  - `delivery.task(tenant_id, done_at)`;
  - `delivery.weekly_stat(tenant_id, week)`;
  - `delivery.lane(project_id, phase, position)`.
- `delivery.lane` and `weekly_stat` keep tenant RLS. Lanes hold no personal data. Lane changes are
  audited like other delivery writes.

## Tasks

- [ ] `T1` — Tasks per week: per-project `weekly_stat`, a task-week read (Done live, Planned from snapshots or live for the current week), the weekly snapshot service, workflow and schedule, and `get_tasks_per_week` (AC-1–AC-6)
  Files: modules/delivery/db/migrations/0018_tasks_per_week.sql, modules/delivery/server/weekly.ts, modules/delivery/server/queries.ts, modules/delivery/workflows.ts, modules/delivery/mcp.ts, modules/delivery/module.ts, modules/delivery/tests/weekly.test.ts
- [ ] `T2` — Revenue slot: core manifest `slots` and `readSlot`, the web app wiring, Finance's `delivery.revenue-by-project` slot with FX conversion, and `get_revenue_by_project` (AC-7–AC-11)
  Files: packages/core/src/module.ts, packages/core/src/slots.ts, packages/core/src/server.ts, apps/web/lib/server.ts, modules/delivery/contracts.ts, modules/finance/server/revenue.ts, modules/finance/module.ts, modules/finance/mcp.ts, modules/finance/tests/revenue.test.ts
- [ ] `T3` — Projects page: both charts read live data with their notes, empty and Finance states, pins, and fixtures seeded from real tasks and snapshots (AC-1–AC-10, AC-30, AC-31)
  Files: modules/delivery/ui/ProjectsPage.tsx, modules/delivery/fixtures/index.ts, modules/delivery/tests/weekly.test.ts
  Depends: T1, T2
- [ ] `T4` — Lanes: `delivery.lane` table and `proposal.lane_id`, lane services and MCP tools, the `delivery.add-lane` intent, `move_proposal` with `lane` and a row lock, `create_proposal` with `lane`, lane events and permission (AC-16–AC-22, AC-24)
  Files: modules/delivery/db/migrations/0019_lanes.sql, modules/delivery/server/lanes.ts, modules/delivery/server/services.ts, modules/delivery/server/queries.ts, modules/delivery/contracts.ts, modules/delivery/mcp.ts, modules/delivery/chat.ts, modules/delivery/module.ts, modules/delivery/fixtures/index.ts, modules/delivery/tests/lanes.test.ts
- [ ] `T5` — Board UI: lanes grouped by phase, drag and drop (pointer, touch, keyboard) opening chat, the pending state with Cancel, Add lane and the lane menu; chat reports each decided card to the page (AC-12–AC-15, AC-23)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/Board.tsx, modules/delivery/ui/board.ts, modules/delivery/ui/delivery.css, apps/web/components/chat/Chat.tsx, packages/ui/src/components/PinButton.tsx, modules/delivery/tests/board.test.ts
  Depends: T4
- [ ] `T6` — Release stage times: stage details in `listReleases`, the station tooltip with focus, tap and Esc, and display names for who recorded it (AC-25–AC-28)
  Files: modules/delivery/server/queries.ts, modules/delivery/server/stages.ts, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/StationTip.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/stages.test.ts
- [ ] `T7` — Mock section, README, lint, typecheck, `check:graph` and the full test suites (AC-29, AC-32)
  Files: .specclaw/mock/index.html, modules/delivery/README.md
  Depends: T3, T5, T6

## Verify

Not started.
