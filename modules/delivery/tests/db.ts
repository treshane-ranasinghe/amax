import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import manifest from "../module";

export const T = lumen.tenant.id;

/** A migrated database with delivery's fixtures, viewers by demo key (optionally viewing as one role), and a tenant query. */
export async function deliveryDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([manifest]);
  setViewerScopeResolvers([manifest.viewerScopes!]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, manifest], lumen);
  const q = (s: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(s));
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const [u] = await q(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`);
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return role ? applyViewAs(v, role) : v;
  };
  return { t, app, q, as };
}
