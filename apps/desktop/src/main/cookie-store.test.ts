import { afterEach, describe, expect, it, vi } from "vitest";
import type { CookieStore } from "./cookie-store.js";
import { flushCookieStores, installCookieFlush } from "./cookie-store.js";

function fakeStore() {
  const listeners: Array<() => void> = [];
  const store: CookieStore = {
    flushStore: vi.fn(async () => undefined),
    on: (_event, listener) => {
      listeners.push(listener);
    },
  };
  return {
    store,
    change: () => {
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("cookie flush", () => {
  it("writes cookies once after they change, so a later quit still has them", async () => {
    vi.useFakeTimers();
    const { store, change } = fakeStore();
    installCookieFlush(store, 500);
    change();
    change();
    expect(store.flushStore).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.flushStore).toHaveBeenCalledOnce();
  });

  it("flushes each store on quit", async () => {
    const first = fakeStore();
    const second = fakeStore();
    await flushCookieStores([first.store, first.store, second.store]);
    expect(first.store.flushStore).toHaveBeenCalledOnce();
    expect(second.store.flushStore).toHaveBeenCalledOnce();
  });
});
