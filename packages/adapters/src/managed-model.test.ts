import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  managedChatModel,
  managedDraftIdentity,
  managedModelEnabled,
  resolveGrokScratchRoot,
  resolveManagedModel,
  writeAlmaModelTable,
} from "./managed-model.js";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("turns the switch off only for the four off values", () => {
  expect(managedModelEnabled({})).toBe(true);
  expect(managedModelEnabled({ ALMA_MANAGED_MODEL: "  " })).toBe(true);
  expect(managedModelEnabled({ ALMA_MANAGED_MODEL: "1" })).toBe(true);
  expect(managedModelEnabled({ ALMA_MANAGED_MODEL: "YES" })).toBe(true);
  for (const value of ["0", "false", "no", "off", " FALSE "]) {
    expect(managedModelEnabled({ ALMA_MANAGED_MODEL: value })).toBe(false);
  }
});

it("defaults the runtime to grok-build and keeps secrets out of the draft identity", () => {
  const config = resolveManagedModel({
    ALMA_MODEL_API_KEY: "xai-test-fixture",
    ALMA_MODEL_BASE_URL: " https://models.example.test/v1 ",
  });
  expect(config.runtime).toBe("grok-build");
  expect(config.provider).toBe("xai");
  expect(config.baseUrl).toBe("https://models.example.test/v1");
  expect(managedDraftIdentity(config)).toEqual({
    model: "xai",
    modelVersion: "subscription-default",
  });
  expect(JSON.stringify(managedDraftIdentity(config))).not.toContain("xai-test-fixture");
});

it("uses the deployment model for the Pi runtime and leaves Grok unlabeled without an id", () => {
  expect(
    managedChatModel({
      ALMA_MODEL_RUNTIME: "pi",
      PI_DEFAULT_PROVIDER: "deepseek",
      PI_DEFAULT_MODEL: "deepseek-flash",
    }),
  ).toEqual({ provider: "deepseek", id: "deepseek-flash" });
  expect(managedChatModel({ ALMA_MODEL_RUNTIME: "pi" })).toEqual({
    provider: "openrouter",
    id: "anthropic/claude-haiku-5.5",
  });
  expect(managedChatModel({})).toBeUndefined();
  expect(managedChatModel({ ALMA_MODEL_PROVIDER: "xai", ALMA_MODEL_ID: "grok-4" })).toEqual({
    provider: "xai",
    id: "grok-4",
  });
});

it("puts grok scratch on a writable data directory when ALMA_GROK_SCRATCH is unset", () => {
  expect(
    resolveGrokScratchRoot({
      ALMA_GROK_SCRATCH: "  /var/alma-scratch  ",
      DATA_DIR: "/data",
    }),
  ).toBe("/var/alma-scratch");

  const data = mkdtempSync(path.join(os.tmpdir(), "alma-data-"));
  roots.push(data);
  expect(resolveGrokScratchRoot({ DATA_DIR: data, ALMA_GROK_SCRATCH: "" })).toBe(
    path.join(data, "alma-grok"),
  );
  expect(
    resolveGrokScratchRoot({
      DATA_DIR: path.join(os.tmpdir(), "missing-alma-data-dir"),
      ALMA_GROK_SCRATCH: " ",
    }),
  ).toBe(path.join(os.tmpdir(), "alma-grok"));
  expect(resolveManagedModel({ DATA_DIR: data }).scratchRoot).toBe(path.join(data, "alma-grok"));
});

it("writes the alma table without the secret value", async () => {
  const root = path.join(os.tmpdir(), `alma-model-${Date.now()}`);
  roots.push(root);
  await mkdir(root);
  const config = resolveManagedModel({
    GROK_HOME: root,
    ALMA_MODEL_ID: "firm-model",
    ALMA_MODEL_BASE_URL: "https://models.example.test/v1",
    ALMA_MODEL_API_KEY: "xai-test-fixture",
  });
  await writeFile(path.join(root, "config.toml"), "[other]\nkeep = true\n", "utf8");
  await writeAlmaModelTable(config);
  const text = await readFile(path.join(root, "config.toml"), "utf8");
  expect(text).toContain("[other]");
  expect(text).toContain('model = "firm-model"');
  expect(text).toContain('base_url = "https://models.example.test/v1"');
  expect(text).toContain('env_key = "ALMA_MODEL_API_KEY"');
  expect(text).toContain('default = "alma"');
  expect(text).not.toContain("xai-test-fixture");
});
