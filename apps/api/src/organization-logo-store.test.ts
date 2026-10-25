import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalOrganizationLogoStore, organizationLogoKey } from "./organization-logo-store.js";

describe("organization logo files", () => {
  it("keeps the previous file when a new logo is stored", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "alma-logo-"));
    const store = new LocalOrganizationLogoStore(root);
    const first = organizationLogoKey("org-1", "logo-1");
    const second = organizationLogoKey("org-1", "logo-2");
    await store.put(first, new Uint8Array([1, 2, 3]));
    await store.put(second, new Uint8Array([4, 5]));
    expect(await store.get(first)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.get(second)).toEqual(new Uint8Array([4, 5]));
    const names = await readdir(path.join(root, "organization-logos", "org-1"));
    expect(names.sort()).toEqual(["logo-1", "logo-2"]);
  });

  it("refuses a key that leaves the logo directory", () => {
    expect(() => organizationLogoKey("../org", "logo")).toThrow(/Invalid organization logo key/);
    expect(() => organizationLogoKey("org", "logo/../../etc")).toThrow(
      /Invalid organization logo key/,
    );
  });
});
