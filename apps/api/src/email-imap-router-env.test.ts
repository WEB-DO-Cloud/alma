import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("createRouter env", () => {
  it("passes the email mailbox flag into the router, so detect and test are not 404 when the flag is on", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "app.ts"), "utf8");
    const block = source.slice(source.indexOf("const router = createRouter({"));
    const env = block.slice(block.indexOf("env: {"), block.indexOf("},\n  });"));
    expect(env).toMatch(/emailImapConnector:\s*env\.emailImapConnector/);
  });
});
