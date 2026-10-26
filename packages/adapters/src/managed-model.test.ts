import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  managedDraftIdentity,
  managedModelEnabled,
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
