import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { askAndConfirm, signIn } from "./ask";
import { seedBoardDemo } from "./board-seed";

// 074 B and C, on the fictional Northwind Kiosk board (board-seed.ts), as Maya, its PM.
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const lane = (page: Page, name: RegExp) => page.locator("section.lane", { has: page.locator(".lane-head", { hasText: name }) }).first();
const said = (page: Page) => page.locator(".sr[aria-live=polite]").first();
async function drag(page: Page, handle: Locator, to: Locator) {
  const from = (await handle.boundingBox())!, box = (await to.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 8 });
  await page.mouse.up();
}

test.beforeAll(seedBoardDemo);
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/NWK");
});

test("074 AC-19/AC-21 a PM adds a 'QA handoff' lane to Building by asking amax", async ({ page }) => {
  // Scenario: the team wants a step between building and verifying. Maya presses Add lane under
  // Building, names it in chat and confirms; the new lane appears inside Building, marked as such.
  test.setTimeout(90_000);
  await askAndConfirm(page, page.getByRole("button", { name: "Add a lane to Building" }), { pin: "NWK board lanes", prompt: "Add a lane to Building on NWK called ", type: "QA handoff" });
  await expect(lane(page, /QA handoff/)).toContainText("Building ›");
  expect(await axe(page)).toEqual([]);
});

test("074 AC-12/AC-13 dragging a card asks chat to move it; confirming keeps it in the new lane", async ({ page }) => {
  // Scenario: Maya drags "Self-checkout screen" from Planned into QA handoff. Nothing is saved yet:
  // chat opens with the move filled in and the card waits as "Moving…". She sends and confirms.
  test.setTimeout(90_000);
  const card = lane(page, /^Planned/).locator(".tcard", { hasText: "NWK-001" });
  await drag(page, card.getByRole("button", { name: /^Move NWK-001,/ }), lane(page, /QA handoff/));
  await expect(lane(page, /QA handoff/).locator(".tcard.pending", { hasText: "NWK-001" })).toBeVisible();
  await expect(page.getByLabel("Message amax")).toHaveValue("Move NWK-001 to QA handoff");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.getByRole("button", { name: "Add it" }).click();
  await expect(confirm).toContainText("Done:");
  await page.reload();
  await expect(lane(page, /QA handoff/).locator(".tcard", { hasText: "NWK-001" })).toBeVisible();
});

test("074 AC-13 cancelling a dragged card puts it back where it was", async ({ page }) => {
  // Scenario: Maya drags "Receipt printer driver" to Verified, then changes her mind and presses Cancel.
  await drag(page, page.getByRole("button", { name: /^Move NWK-002,/ }), lane(page, /^Verified/));
  await lane(page, /^Verified/).getByRole("button", { name: "Cancel" }).click();
  await expect(lane(page, /^Planned/).locator(".tcard", { hasText: "NWK-002" })).toBeVisible();
  await expect(said(page)).toHaveText("NWK-002 stays where it was");
});

test("074 AC-14 a card can't be dropped into Released to Prod", async ({ page }) => {
  // Scenario: only a Prod deployment releases work, so dropping a card on Released snaps it back and says why.
  await drag(page, page.getByRole("button", { name: /^Move NWK-002,/ }), lane(page, /^Released to Prod/));
  await expect(said(page)).toHaveText(/Released to Prod comes only from a Prod deployment/);
  await expect(page.getByLabel("Message amax")).not.toHaveValue(/NWK-002/);
});

test("074 AC-15 the keyboard moves a card: Space picks it up, arrows choose a lane, Space drops it", async ({ page }) => {
  // Scenario: a keyboard user moves "Offline basket sync" from Proposed one lane right, into Planned.
  const handle = page.getByRole("button", { name: /^Move NWK-003,/ });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(said(page)).toContainText("NWK-003 picked up. Proposed.");
  await page.keyboard.press("ArrowRight");
  await expect(said(page)).toHaveText("Planned");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Message amax")).toHaveValue("Move NWK-003 to Planned");
});
