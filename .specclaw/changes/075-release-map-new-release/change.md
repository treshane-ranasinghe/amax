# Release map: releases amax adds from chat

**Change:** 075-release-map-new-release · **Created:** 2026-10-23
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [042](../archive/042-release-management/change.md), [051](../archive/051-project-sections/change.md), [074](../074-projects-board-and-charts/change.md)

## Problem

A PM should be able to tell amax in chat "add release v2.5.0 to Contoso Portal" and see it on the
release map. amax can create it (`create_release`, after chat confirms), but the map hides every
release that has no deployment yet: `ReleaseMap` and `onActiveMap` draw only releases with a last
deployment (`modules/delivery/ui/ReleasesPage.tsx`). So the new release stays invisible on the map
until someone deploys it to Dev.

## Definitions

- **Undeployed release:** a release with no live (not voided) deployment in any environment.
- **Recent:** created within the last 45 days, the same window the Active map already uses.

## Decisions

1. **Chat only.** Releases are added by asking amax in chat; the map gets no new button. Nothing is
   written until the `create_release` card is confirmed (rule 1, R3 chat-first).
2. **Undeployed releases count as in flight** on the Active map while they're recent, beside the
   project's in-flight and Live releases. Older ones show on **All** only.
3. **No new write service.** `create_release` and its permission (`delivery:release:create`) are
   unchanged.

## Mock Delta

What changes on screen, and where to see it: [`075-release-map-new-release`](../../mock/index.html#075-release-map-new-release)

- The chat shows Maya asking "add release v2.5.0 to Contoso Portal with CON-011, CON-013 and
  CON-014" from the Releases page, and amax answering with the `create_release` confirm card.
- After confirm, Contoso Portal **v2.5.0** appears on the release map as its own row:
  - every station is unreached and grey, joined by a dashed line;
  - a grey pill says "Not deployed yet · added Oct 16".
- The Release map card head is unchanged: no new button.

## Acceptance Criteria

1. **AC-1** From chat on any screen, a person with `delivery:release:create` on the project can ask
   amax to add a release in their own words, e.g. "add release v2.5.0 to Contoso Portal with CON-013
   and CON-014". amax fills `projectKey`, `version` and `proposalKeys` from the message and shows the
   `create_release` confirm card. On the Releases page or a project's Releases section it takes the
   project from the screen when the message doesn't name one.
2. **AC-2** amax asks only for what's missing: "Which project?" and "Which version?" when they aren't
   given, and the proposals are optional (none unless the person names them). An unknown or
   already shipped proposal, or a version the project already has, is refused with the service's
   message, and nothing is written.
3. **AC-3** Without `delivery:release:create` on that project, amax says so and offers no confirm card.
4. **AC-4** After chat confirms, the new release shows on the map and in the All releases table on
   the next render (the existing `revalidatePath` after confirm), with no full reload.
5. **AC-5** An undeployed release is drawn on the map as its own row:
   - the project name and "<version>, <n> proposals", as for other rows;
   - every station unreached, joined by a dashed line, with no solid progress line;
   - a grey pill "Not deployed yet · added <date>".
6. **AC-6** On the Active map, an undeployed release shows when it's recent, alongside the project's
   in-flight releases or its current Live release, which stay as they are. On **All** it always
   shows. A project with only an old undeployed release shows nothing on Active.
7. **AC-7** Each station of an undeployed row has the 074 tooltip, saying "<environment> · Not
   deployed yet". The stations are reachable by keyboard, and the map's overall label reads
   "<project> <version>: not deployed yet".
8. **AC-8** Once its first deployment is recorded, the row becomes a normal in-flight row (solid line
   to the reached station, "In Dev since …"), with no duplicate row.
9. **AC-9** `list_releases` and the map pin show the same rows as the screen, so amax answers "what's
   on the release map?" with the undeployed release included.
10. **AC-10** The map gets no new button and no form: the existing chat-first guard test covers the
    Releases page.
11. **AC-11** Fixtures: the existing Contoso Portal v2.5.0 (CON-011, CON-013, CON-014; no
    deployments) gets a created date of Oct 16, the fixtures' today, so it shows on the Active map as
    in the mock.
12. **AC-12** Unit tests cover `onActiveMap` with undeployed releases (recent, old, beside Live, beside
    in flight), `mapRow` and `mapPill` for an undeployed row, and chat filling `create_release` from
    a typed message (scripted model). An e2e test types the request in chat, confirms, and sees the
    row appear on the map.

## Tasks

- [x] `T1` — Release map draws undeployed releases: `onActiveMap` keeps recent undeployed ones beside in-flight and Live rows, `mapRow`/`mapPill` give an all-grey dashed row and a "Not deployed yet · added <date>" pill, the map's label and station tooltips, no new button; fixture v2.5.0 created Oct 16; unit tests (AC-5–AC-11)
  Files: modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/delivery.css, modules/delivery/fixtures/index.ts, modules/delivery/tests/ui-logic.test.ts
- [x] `T2` — amax adds a release from a typed chat message: `create_release` takes the project by key or name and the proposals as optional, asks only for what's missing, takes the project from the Releases screen when not named, refuses without permission; the scripted model's rule for "add release <version> to <project> [with …]"; unit tests (AC-1–AC-4)
  Files: modules/delivery/mcp.ts, modules/delivery/chat.ts, modules/delivery/server/services.ts, packages/ai/src/scripted-writes.ts, apps/web/components/chat/Chat.tsx, modules/delivery/tests/releases.test.ts, packages/ai/tests/scripted-writes.test.ts
- [ ] `T3` — e2e: type the request in chat on the Releases page, confirm, see the new row on the map, then record its Dev deployment and see it become an in-flight row; module README; lint, typecheck, `check:graph` and the delivery and ai suites (AC-4, AC-8, AC-12)
  Files: apps/web/tests/e2e/release-map.spec.ts, modules/delivery/README.md
  Depends: T1, T2

## Verify
