import { logError } from "./log";
import type { ModuleManifest } from "./module";

// 074: a screen reads another module's data through a named slot, so it never imports that module
// (Delivery's Projects page takes Finance's contract values; Finance already depends on Delivery).
let providers: readonly Pick<ModuleManifest, "id" | "slots">[] = [];

export const configureSlots = (modules: readonly Pick<ModuleManifest, "id" | "slots">[]) => {
  providers = modules.filter((m) => m.slots);
};

export type SlotRead<T> = { module: string; data: T } | { module: string; failed: true };

/** Every installed provider's answer for a slot. None installed is an empty list; a provider that throws is logged and marked failed. */
export function readSlot<T>(name: string, viewer: unknown, query: unknown): Promise<SlotRead<T>[]> {
  return Promise.all(providers.filter((m) => m.slots?.[name]).map((m) =>
    m.slots![name](viewer as never, query as never).then(
      (data): SlotRead<T> => ({ module: m.id, data: data as T }),
      (e: unknown): SlotRead<T> => (logError(`slot ${name} ${m.id}`, e), { module: m.id, failed: true }),
    )));
}
