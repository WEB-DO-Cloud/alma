import { bestEffort } from "@rakazo/logging";

/** The slice of Electron's cookie jar this process has to get onto disk. */
export interface CookieStore {
  flushStore(): Promise<void>;
  on(event: "changed", listener: () => void): void;
}

const installed = new WeakSet<CookieStore>();
const pending = new WeakMap<CookieStore, ReturnType<typeof setTimeout>>();

/** Chromium keeps new cookies in memory until it flushes. An update can quit before that. */
export function installCookieFlush(store: CookieStore, delayMs = 500): void {
  if (installed.has(store)) return;
  installed.add(store);
  store.on("changed", () => {
    const existing = pending.get(store);
    if (existing !== undefined) clearTimeout(existing);
    pending.set(
      store,
      setTimeout(() => {
        pending.delete(store);
        void bestEffort("flush session cookies", store.flushStore());
      }, delayMs),
    );
  });
}

export async function flushCookieStores(stores: Iterable<CookieStore>): Promise<void> {
  const unique = [...new Set(stores)];
  await Promise.all(unique.map((store) => bestEffort("flush session cookies", store.flushStore())));
}
