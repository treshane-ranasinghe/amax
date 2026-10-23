import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./ask";
import { seedBoardDemo } from "./board-seed";

// 074 A and D, with the fictional Northwind Kiosk data (board-seed.ts) beside the fixtures, as Maya.
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const card = (page: Page, title: string) => page.locator(".card", { has: page.getByRole("heading", { name: title }) });

test.beforeAll(seedBoardDemo);
test.beforeEach(({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("074 AC-1/AC-3/AC-6 Tasks done per week counts real closed tasks and follows the client filter", async ({ page }) => {
  // Scenario: Maya filters Projects to Northwind Traders. The chart now shows only Northwind Kiosk,
  // whose tasks were closed in W40 to W42, and its pin asks get_tasks_per_week for that client.
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.goto("/delivery?client=Northwind%20Traders");
  const tasks = card(page, "Tasks done per week");
  await expect(tasks).toContainText("Northwind Traders");
  await expect(tasks.getByRole("img", { name: "Tasks done per week against plan" })).toBeVisible();
  await expect(tasks.getByRole("button", { name: "Add Tasks done per week to chat" })).toHaveAttribute("data-pin", /"tool":"get_tasks_per_week","args":\{"client":"Northwind Traders"\}/);
});

test("074 AC-7/AC-8 Revenue by project comes from Finance and names the contract it couldn't convert", async ({ page }) => {
  // Scenario: Northwind Kiosk has a $96,000 contract and a €12,000 one. amax has no EUR rate, so the
  // donut shows $96k and says the EUR contract was left out, instead of mixing currencies.
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.goto("/delivery?client=Northwind%20Traders");
  const revenue = card(page, "Revenue by project");
  await expect(revenue).toContainText("$96k");
  await expect(revenue).toContainText("1 contract in EUR left out: no EUR → USD rate. Add one with set_fx_rate.");
  await expect(revenue.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/finance");
});

test("074 AC-25/AC-26 hovering a release map station shows its stage time and full details", async ({ page }) => {
  // Scenario: Northwind Kiosk v1.0.0 reached Dev on Oct 5 and QA on Oct 9, was redeployed to QA on
  // Oct 11, and is testing in UAT since Oct 13. Hovering QA shows how long it took after Dev, who
  // deployed it and that it went to QA twice; hovering UAT shows how long it has been waiting there.
  await signIn(page, "maya@lumenlabs.test", "/delivery/releases");
  const station = (env: string) => page.getByRole("button", { name: new RegExp(`^Northwind Kiosk v1\\.0\\.0, ${env} · `) });
  await station("QA").hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("QA · Deployed");
  await expect(tip).toContainText("4 days 1 h after Dev");
  await expect(tip).toContainText("By Claude for Nimal, pipeline run 2207");
  await expect(tip).toContainText("Deployed 2 times, latest Oct 11");
  await station("UAT").hover();
  await expect(tip).toContainText("UAT · Testing");
  await expect(tip).toContainText("Client sign-off pending");
  await expect(tip).toContainText(/In UAT for \d+ days/);
});

test("074 AC-27 the station details open from the keyboard and close with Escape", async ({ page }) => {
  // Scenario: a keyboard user tabs to a station, reads its details, then presses Escape to close them.
  await signIn(page, "maya@lumenlabs.test", "/delivery/releases");
  await page.getByRole("button", { name: /^Northwind Kiosk v1\.0\.0, Dev · Deployed/ }).focus();
  await expect(page.getByRole("tooltip")).toContainText("Dev · Deployed");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test("075 AC-12 amax adds a release from a typed message and it is on the map before its first deployment", async ({ page }) => {
  // Scenario: on Northwind Kiosk's Releases section, Maya types "add release v1.1.0 to NWK with
  // NWK-001" and confirms. The map shows v1.1.0 not deployed yet; once amax records its Dev
  // deployment, the same row moves on to Dev instead of a second row appearing.
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/NWK/releases");
  const say = async (text: string) => {
    await page.getByRole("button", { name: "Ask amax" }).click();
    await page.getByLabel("Message amax").fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
    await confirm.getByRole("button", { name: "Add it" }).click();
    await expect(confirm).toContainText("Done:");
    await page.reload();
  };
  const map = card(page, "Release map").getByRole("group");
  await say("add release v1.1.0 to NWK with NWK-001");
  await expect(map).toHaveAttribute("aria-label", /Northwind Kiosk v1\.1\.0: not deployed yet/);
  await expect(page.getByRole("button", { name: /^Northwind Kiosk v1\.1\.0, Dev · Not deployed yet/ })).toBeVisible();
  await say("record a deployment of NWK v1.1.0 to Dev");
  await expect(map).toHaveAttribute("aria-label", /Northwind Kiosk v1\.1\.0: In Dev since/);
  await expect(page.getByRole("button", { name: /^Northwind Kiosk v1\.1\.0, Dev · Deployed/ })).toHaveCount(1);
  expect(await axe(page)).toEqual([]);
});
