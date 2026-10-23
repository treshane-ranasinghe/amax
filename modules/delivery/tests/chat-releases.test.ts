import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { listReleases } from "../server/queries";
import { onActiveMap } from "../ui/ReleasesPage";

const T = lumen.tenant.id;
const create = (input: Record<string, unknown>) => () => ({ toolCalls: [{ type: "tool_use" as const, id: `c${Math.random()}`, name: "create_release", input }] });

// 075: amax adds a release from a typed chat message, and it shows on the release map straight away.
describe.skipIf(!hasDb)("075 amax adds a release from chat (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, liam: Viewer;
  const registry = createRegistry([delivery]);
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  const say = (v: Viewer, text: string, step: ReturnType<typeof create>, screen?: string) => {
    const provider = fakeProvider([step, () => ({ text: "Confirm it?" })]);
    configureAi({ provider, db: app, model: "claude-haiku-5-5" });
    return chatTurn(app, registry, v, { text, screen }).then((turn) => ({ turn, system: provider.calls[0].system }));
  };
  const versions = async () => (await listReleases(maya, { projectKey: "CON" })).map((r) => r.version);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
    liam = await as("liam@lumenlabs.test");
  });
  afterAll(() => t?.drop());

  it("AC-1 a typed request on a project's Releases screen becomes a create_release card for that project", async () => {
    const { turn, system } = await say(maya, "add release v9.1.0 with CON-016", create({ projectKey: "CON", version: "v9.1.0", proposalKeys: ["CON-016"] }), "/delivery/p/CON/releases");
    expect(system).toContain("The user is on the screen /delivery/p/CON/releases");
    expect(turn.pending).toHaveLength(1);
    expect(turn.pending[0]).toMatchObject({ tool: "create_release", input: { projectKey: "CON", version: "v9.1.0", proposalKeys: ["CON-016"] } });
    expect(await versions()).not.toContain("v9.1.0");
  });

  it("AC-2 a version the project already has is refused on confirm and nothing is written", async () => {
    const { turn } = await say(maya, "add release v2.5.0 to CON", create({ projectKey: "CON", version: "v2.5.0" }));
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id)).rejects.toThrow(/CON already has a release v2\.5\.0/);
    expect((await versions()).filter((v) => v === "v2.5.0")).toHaveLength(1);
  });

  it("AC-3 without delivery:release:create amax gets a refusal and shows no confirm card", async () => {
    const { turn } = await say(liam, "add release v9.2.0 to CON", create({ projectKey: "CON", version: "v9.2.0" }));
    expect(turn.pending).toEqual([]);
  });

  it("AC-4 once confirmed, the release is on the Active release map before any deployment", async () => {
    const { turn } = await say(maya, "add release v9.3.0 to CON", create({ projectKey: "CON", version: "v9.3.0" }));
    await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id);
    const map = onActiveMap(await listReleases(maya), new Date());
    expect(map.find((r) => r.version === "v9.3.0")?.stages.every((s) => s.status === null)).toBe(true);
  });
});
