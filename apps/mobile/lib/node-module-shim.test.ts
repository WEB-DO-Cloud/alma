import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const shim = require("../node-module-shim.js") as {
  createRequire: () => (id: string) => { sentryUploadAllowed: () => boolean };
};

describe("node:module shim", () => {
  it("answers only the build-time Sentry upload check", () => {
    const bundledRequire = shim.createRequire();
    expect(bundledRequire("./sentry-upload.cjs").sentryUploadAllowed()).toBe(false);
    expect(() => bundledRequire("node:fs")).toThrow(/Unsupported Node built-in in the app bundle/);
  });

  it("is what Metro uses for node:module", () => {
    const config = require("../metro.config.js") as {
      resolver: {
        resolveRequest: (
          context: object,
          moduleName: string,
          platform: string,
        ) => { type: string; filePath: string };
      };
    };
    const resolved = config.resolver.resolveRequest({}, "node:module", "ios");
    expect(resolved).toEqual({
      type: "sourceFile",
      filePath: join(dirname(fileURLToPath(import.meta.url)), "../node-module-shim.js"),
    });
  });
});
